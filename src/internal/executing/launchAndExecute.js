import {
  createCancellationToken,
  createOperation,
  createStoppableOperation,
  createCancellationSource,
  composeCancellationToken,
  errorToCancelReason,
} from "@jsenv/cancellation"
import { composeCoverageMap } from "./coverage/composeCoverageMap.js"

const TIMING_BEFORE_EXECUTION = "before-execution"
const TIMING_DURING_EXECUTION = "during-execution"
const TIMING_AFTER_EXECUTION = "after-execution"

export const launchAndExecute = async ({
  cancellationToken = createCancellationToken(),
  launchLogger,
  executeLogger,
  launch,

  // stopPlatformAfterExecute false by default because you want to keep browser alive
  // or nodejs process
  // however unit test will pass true because they want to move on
  stopPlatformAfterExecute = false,
  // when launchPlatform returns { disconnected, stop, stopForce }
  // the launched platform have that amount of ms for disconnected to resolve
  // before we call stopForce
  allocatedMsBeforeForceStop = 4000,
  platformConsoleCallback = () => {},
  platformStartedCallback = () => {},
  platformStoppedCallback = () => {},
  platformErrorCallback = () => {},
  platformDisconnectCallback = () => {},

  allocatedMs, // both launch + execute
  measureDuration = false, // both launch + execute
  mirrorConsole = false,
  captureConsole = false,
  collectPlatformName = false,
  collectPlatformVersion = false,
  collectNamespace = false,
  collectCoverage = false,
  fileRelativeUrl,
  inheritCoverage = false,
  executionId,
} = {}) => {
  if (typeof launch !== "function") {
    throw new TypeError(`launch launch must be a function, got ${launch}`)
  }
  if (typeof fileRelativeUrl !== "string") {
    throw new TypeError(`fileRelativeUrl must be a string, got ${fileRelativeUrl}`)
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
    platformConsoleCallback = composeCallback(platformConsoleCallback, ({ type, text }) => {
      if (type === "error") {
        process.stderr.write(text)
      } else {
        process.stdout.write(text)
      }
    })
  }

  if (captureConsole) {
    let platformLog = ""
    platformConsoleCallback = composeCallback(platformConsoleCallback, ({ text }) => {
      platformLog += text
    })
    executionResultTransformer = composeTransformer(
      executionResultTransformer,
      (executionResult) => {
        executionResult.platformLog = platformLog
        return executionResult
      },
    )
  }

  if (collectPlatformName) {
    platformStartedCallback = composeCallback(platformStartedCallback, ({ name }) => {
      executionResultTransformer = composeTransformer(
        executionResultTransformer,
        (executionResult) => {
          executionResult.platformName = name
          return executionResult
        },
      )
    })
  }

  if (collectPlatformVersion) {
    platformStartedCallback = composeCallback(platformStartedCallback, ({ version }) => {
      executionResultTransformer = composeTransformer(
        executionResultTransformer,
        (executionResult) => {
          executionResult.platformVersion = version
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
    launchLogger,
    executeLogger,
    launch,
    stopPlatformAfterExecute,
    allocatedMsBeforeForceStop,
    platformConsoleCallback,
    platformErrorCallback,
    platformDisconnectCallback,
    platformStartedCallback,
    platformStoppedCallback,
    allocatedMs,
    fileRelativeUrl,
    collectNamespace,
    collectCoverage,
    executionId,
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
  launch,
  launchLogger,
  executeLogger,
  stopPlatformAfterExecute,
  allocatedMsBeforeForceStop,
  platformStartedCallback,
  platformStoppedCallback,
  platformConsoleCallback,
  platformErrorCallback,
  platformDisconnectCallback,
  fileRelativeUrl,
  collectNamespace,
  collectCoverage,
  executionId,
}) => {
  launchLogger.debug(`start a platform to execute a file.`)

  const launchOperation = createStoppableOperation({
    cancellationToken,
    start: async () => {
      const value = await launch({ cancellationToken, logger: launchLogger, collectCoverage })
      platformStartedCallback({ name: value.name, version: value.version })
      return value
    },
    stop: async (platform) => {
      // external code can cancel using cancellationToken at any time.
      // (hotreloading note: we would do that and listen for stoppedCallback before restarting an operation)
      // it is important to keep the code inside this stop function because once cancelled
      // all code after the operation won't execute because it will be rejected with
      // the cancellation error

      let forceStopped = false

      if (platform.stopForce) {
        const stopPromise = (async () => {
          await platform.stop()
          return false
        })()

        const stopForcePromise = (async () => {
          await new Promise(async (resolve) => {
            const timeoutId = setTimeout(resolve, allocatedMsBeforeForceStop)
            try {
              await stopPromise
            } finally {
              clearTimeout(timeoutId)
            }
          })
          await platform.stopForce()
          return true
        })()

        forceStopped = await Promise.all([stopPromise, stopForcePromise])
      } else {
        await platform.stop()
      }

      platformStoppedCallback({ forced: forceStopped })
      launchLogger.debug(`platform stopped.`)
    },
  })

  const {
    name: platformName,
    version: platformVersion,
    options,
    executeFile,
    registerErrorCallback,
    registerConsoleCallback,
    registerDisconnectCallback,
  } = await launchOperation

  launchLogger.debug(`${platformName}@${platformVersion} started.
--- options ---
options: ${JSON.stringify(options, null, "  ")}`)

  registerConsoleCallback(platformConsoleCallback)
  executeLogger.debug(`execute file ${fileRelativeUrl}`)

  const executeOperation = createOperation({
    cancellationToken,
    start: async () => {
      let timing = TIMING_BEFORE_EXECUTION

      const disconnected = new Promise((resolve) => {
        registerDisconnectCallback(() => {
          executeLogger.debug(`platform disconnected.`)
          platformDisconnectCallback({ timing })
          resolve()
        })
      })

      const executed = executeFile(fileRelativeUrl, {
        collectNamespace,
        collectCoverage,
        executionId,
      })
      timing = TIMING_DURING_EXECUTION

      registerErrorCallback((error) => {
        if (timing === "after-execution") {
          executeLogger.error(`error after execution
--- error stack ---
${error.stack}`)
        } else {
          executeLogger.error(`error during execution
--- error stack ---
${error.stack}`)
        }
        platformErrorCallback({ error, timing })
      })

      const raceResult = await promiseTrackRace([disconnected, executed])
      timing = TIMING_AFTER_EXECUTION

      if (raceResult.winner === disconnected) {
        return createDisconnectedExecutionResult({})
      }

      if (stopPlatformAfterExecute) {
        launchOperation.stop("stop after execute")
      }

      const executionResult = raceResult.value
      const { status } = executionResult
      if (status === "errored") {
        executeLogger.error(`execution errored.
--- error stack ---
${executionResult.error.stack}`)
        return createErroredExecutionResult(executionResult, { collectCoverage })
      }

      executeLogger.debug(`execution completed.`)
      return createCompletedExecutionResult(executionResult, { collectNamespace, collectCoverage })
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
