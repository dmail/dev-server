import {
  createCancellationToken,
  createOperation,
  createStoppableOperation,
  createCancellationSource,
  composeCancellationToken,
  errorToCancelReason,
} from "@jsenv/cancellation"
import { createLogger } from "@jsenv/logger"
import { composeCoverageMap } from "./coverage/composeCoverageMap.js"

const TIMING_BEFORE_EXECUTION = "before-execution"
const TIMING_DURING_EXECUTION = "during-execution"
const TIMING_AFTER_EXECUTION = "after-execution"

export const launchAndExecute = async ({
  cancellationToken = createCancellationToken(),
  executionLogLevel,

  fileRelativeUrl,
  launch,

  // stopAfterExecute false by default because you want to keep browser alive
  // or nodejs process
  // however unit test will pass true because they want to move on
  stopAfterExecute = false,
  stopAfterExecuteReason = "stop after execute",
  // when launch returns { disconnected, gracefulStop, stop }
  // the launched runtime have that amount of ms for disconnected to resolve
  // before we call stop
  gracefulStopAllocatedMs = 4000,
  runtimeConsoleCallback = () => {},
  runtimeStartedCallback = () => {},
  runtimeStoppedCallback = () => {},
  runtimeErrorCallback = () => {},
  runtimeDisconnectCallback = () => {},

  measureDuration = false,
  mirrorConsole = false,
  captureConsole = false, // rename collectConsole ?
  collectRuntimeName = false,
  collectRuntimeVersion = false,
  inheritCoverage = false,
  collectCoverage = false,
  ...rest
} = {}) => {
  const logger = createLogger({ logLevel: executionLogLevel })

  if (typeof fileRelativeUrl !== "string") {
    throw new TypeError(`fileRelativeUrl must be a string, got ${fileRelativeUrl}`)
  }
  if (typeof launch !== "function") {
    throw new TypeError(`launch launch must be a function, got ${launch}`)
  }

  let executionResultTransformer = (executionResult) => executionResult

  if (measureDuration) {
    const startMs = Date.now()
    executionResultTransformer = composeTransformer(
      executionResultTransformer,
      (executionResult) => {
        const endMs = Date.now()
        executionResult.startMs = startMs
        executionResult.endMs = endMs
        return executionResult
      },
    )
  }

  if (mirrorConsole) {
    runtimeConsoleCallback = composeCallback(runtimeConsoleCallback, ({ type, text }) => {
      if (type === "error") {
        process.stderr.write(text)
      } else {
        process.stdout.write(text)
      }
    })
  }

  if (captureConsole) {
    const consoleCalls = []
    runtimeConsoleCallback = composeCallback(runtimeConsoleCallback, ({ type, text }) => {
      consoleCalls.push({ type, text })
    })
    executionResultTransformer = composeTransformer(
      executionResultTransformer,
      (executionResult) => {
        executionResult.consoleCalls = consoleCalls
        return executionResult
      },
    )
  }

  if (collectRuntimeName) {
    runtimeStartedCallback = composeCallback(runtimeStartedCallback, ({ name }) => {
      executionResultTransformer = composeTransformer(
        executionResultTransformer,
        (executionResult) => {
          executionResult.runtimeName = name
          return executionResult
        },
      )
    })
  }

  if (collectRuntimeVersion) {
    runtimeStartedCallback = composeCallback(runtimeStartedCallback, ({ version }) => {
      executionResultTransformer = composeTransformer(
        executionResultTransformer,
        (executionResult) => {
          executionResult.runtimeVersion = version
          return executionResult
        },
      )
    })
  }

  if (inheritCoverage) {
    const savedCollectCoverage = collectCoverage
    collectCoverage = true
    executionResultTransformer = composeTransformer(
      executionResultTransformer,
      (executionResult) => {
        const { coverageMap, ...rest } = executionResult
        // ensure the coverage of the launched stuff
        // is accounted as coverage for this
        global.__coverage__ = composeCoverageMap(global.__coverage__ || {}, coverageMap || {})
        return savedCollectCoverage ? executionResult : rest
      },
    )
  }

  const executionResult = await computeRawExecutionResult({
    cancellationToken,
    logger,

    fileRelativeUrl,
    launch,

    stopAfterExecute,
    stopAfterExecuteReason,
    gracefulStopAllocatedMs,
    runtimeConsoleCallback,
    runtimeErrorCallback,
    runtimeDisconnectCallback,
    runtimeStartedCallback,
    runtimeStoppedCallback,
    collectCoverage,

    ...rest,
  })

  return executionResultTransformer(executionResult)
}

const composeCallback = (previousCallback, callback) => {
  return (...args) => {
    previousCallback(...args)
    return callback(...args)
  }
}

const composeTransformer = (previousTransformer, transformer) => {
  return (value) => {
    const transformedValue = previousTransformer(value)
    return transformer(transformedValue)
  }
}

const computeRawExecutionResult = async ({ cancellationToken, allocatedMs, ...rest }) => {
  const hasAllocatedMs = typeof allocatedMs === "number" && allocatedMs !== Infinity

  if (!hasAllocatedMs) {
    return computeExecutionResult({
      cancellationToken,
      ...rest,
    })
  }

  // here if allocatedMs is very big
  // setTimeout may be called immediatly
  // in that case we should just throw that hte number is too big

  const TIMEOUT_CANCEL_REASON = "timeout"
  const id = setTimeout(() => {
    timeoutCancellationSource.cancel(TIMEOUT_CANCEL_REASON)
  }, allocatedMs)
  const timeoutCancel = () => clearTimeout(id)
  cancellationToken.register(timeoutCancel)

  const timeoutCancellationSource = createCancellationSource()
  const externalOrTimeoutCancellationToken = composeCancellationToken(
    cancellationToken,
    timeoutCancellationSource.token,
  )

  try {
    const executionResult = await computeExecutionResult({
      cancellationToken: externalOrTimeoutCancellationToken,
      ...rest,
    })
    timeoutCancel()
    return executionResult
  } catch (e) {
    if (errorToCancelReason(e) === TIMEOUT_CANCEL_REASON) {
      return createTimedoutExecutionResult()
    }
    throw e
  }
}

const computeExecutionResult = async ({
  cancellationToken,
  logger,

  fileRelativeUrl,
  launch,

  stopAfterExecute,
  stopAfterExecuteReason,
  gracefulStopAllocatedMs,
  runtimeStartedCallback,
  runtimeStoppedCallback,
  runtimeConsoleCallback,
  runtimeErrorCallback,
  runtimeDisconnectCallback,

  ...rest
}) => {
  logger.debug(`launch runtime environment for ${fileRelativeUrl}`)

  const launchOperation = createStoppableOperation({
    cancellationToken,
    start: async () => {
      const value = await launch({
        cancellationToken,
        logger,
        ...rest,
      })
      runtimeStartedCallback({ name: value.name, version: value.version })
      return value
    },
    stop: async ({ runtimeName, runtimeVersion, gracefulStop, stop }, reason) => {
      const runtime = `${runtimeName}/${runtimeVersion}`

      // external code can cancel using cancellationToken at any time.
      // it is important to keep the code inside this stop function because once cancelled
      // all code after the operation won't execute because it will be rejected with
      // the cancellation error

      let stoppedGracefully

      if (gracefulStop && gracefulStopAllocatedMs) {
        logger.debug(`${fileRelativeUrl} ${runtime}: runtime.gracefulStop() because ${reason}`)

        const gracefulStopPromise = (async () => {
          await gracefulStop({ reason })
          return true
        })()

        const stopPromise = (async () => {
          stoppedGracefully = await new Promise(async (resolve) => {
            const timeoutId = setTimeout(() => {
              resolve(false)
            }, gracefulStopAllocatedMs)
            try {
              await gracefulStopPromise
              resolve(true)
            } finally {
              clearTimeout(timeoutId)
            }
          })
          if (stoppedGracefully) {
            return stoppedGracefully
          }

          logger.debug(
            `${fileRelativeUrl} ${runtime}: runtime.stop() because gracefulStop still pending after ${gracefulStopAllocatedMs}ms`,
          )
          await stop({ reason, gracefulFailed: true })
          return false
        })()

        stoppedGracefully = await Promise.race([gracefulStopPromise, stopPromise])
      } else {
        await stop({ reason, gracefulFailed: false })
        stoppedGracefully = false
      }

      runtimeStoppedCallback({ stoppedGracefully })
      logger.debug(
        `${fileRelativeUrl} ${runtime}: runtime stopped${stoppedGracefully ? " gracefully" : ""}`,
      )
    },
  })

  const {
    name: runtimeName,
    version: runtimeVersion,
    options,
    executeFile,
    registerErrorCallback,
    registerConsoleCallback,
    disconnected,
  } = await launchOperation

  const runtime = `${runtimeName}/${runtimeVersion}`

  logger.debug(`${fileRelativeUrl} ${runtime}: runtime launched.
--- options ---
options: ${JSON.stringify(options, null, "  ")}`)

  logger.debug(`${fileRelativeUrl} ${runtime}: start file execution.`)
  registerConsoleCallback(runtimeConsoleCallback)

  const executeOperation = createOperation({
    cancellationToken,
    start: async () => {
      let timing = TIMING_BEFORE_EXECUTION

      disconnected.then(() => {
        logger.debug(`${fileRelativeUrl} ${runtime}: runtime disconnected ${timing}.`)
        runtimeDisconnectCallback({ timing })
      })

      const executed = executeFile(fileRelativeUrl, rest)
      timing = TIMING_DURING_EXECUTION

      registerErrorCallback((error) => {
        logger.error(`${fileRelativeUrl} ${runtime}: error ${timing}.
--- error stack ---
${error.stack}`)
        runtimeErrorCallback({ error, timing })
      })

      const raceResult = await promiseTrackRace([disconnected, executed])
      timing = TIMING_AFTER_EXECUTION

      if (raceResult.winner === disconnected) {
        return createDisconnectedExecutionResult({})
      }

      if (stopAfterExecute) {
        launchOperation.stop(stopAfterExecuteReason)
      }

      const executionResult = raceResult.value
      const { status } = executionResult
      if (status === "errored") {
        logger.error(`${fileRelativeUrl} ${runtime}: error ${timing}.
--- error stack ---
${executionResult.error.stack}`)
        return createErroredExecutionResult(executionResult, rest)
      }

      logger.debug(`${fileRelativeUrl} ${runtime}: execution completed.`)
      return createCompletedExecutionResult(executionResult, rest)
    },
  })

  const executionResult = await executeOperation

  return executionResult
}

const createTimedoutExecutionResult = () => {
  return {
    status: "timedout",
  }
}

const createDisconnectedExecutionResult = () => {
  return {
    status: "disconnected",
  }
}

const createErroredExecutionResult = ({ error, coverageMap }, { collectCoverage }) => {
  return {
    status: "errored",
    error,
    ...(collectCoverage ? { coverageMap } : {}),
  }
}

const createCompletedExecutionResult = (
  { namespace, coverageMap },
  { collectNamespace, collectCoverage },
) => {
  return {
    status: "completed",
    ...(collectNamespace ? { namespace: normalizeNamespace(namespace) } : {}),
    ...(collectCoverage ? { coverageMap } : {}),
  }
}

const normalizeNamespace = (namespace) => {
  if (typeof namespace !== "object") return namespace
  if (namespace instanceof Promise) return namespace
  const normalized = {}
  // remove "__esModule" or Symbol.toStringTag from namespace object
  Object.keys(namespace).forEach((key) => {
    normalized[key] = namespace[key]
  })
  return normalized
}

const promiseTrackRace = (promiseArray) => {
  return new Promise((resolve, reject) => {
    let resolved = false

    const visit = (index) => {
      const promise = promiseArray[index]
      promise.then((value) => {
        if (resolved) return
        resolved = true
        resolve({ winner: promise, value, index })
      }, reject)
    }

    let i = 0
    while (i < promiseArray.length) {
      visit(i++)
    }
  })
}
