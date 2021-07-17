import {
  createCancellationToken,
  createOperation,
  createStoppableOperation,
  createCancellationSource,
  composeCancellationToken,
  errorToCancelReason,
} from "@jsenv/cancellation"
import { createLogger, createDetailedMessage } from "@jsenv/logger"

import { composeIstanbulCoverages } from "./coverage/composeIstanbulCoverages.js"

const TIMING_BEFORE_EXECUTION = "before-execution"
const TIMING_DURING_EXECUTION = "during-execution"
const TIMING_AFTER_EXECUTION = "after-execution"

export const launchAndExecute = async ({
  launchAndExecuteLogLevel,
  cancellationToken = createCancellationToken(),

  launch,
  launchParams,
  executeParams,

  allocatedMs,
  measureDuration = false,
  mirrorConsole = false,
  captureConsole = false, // rename collectConsole ?
  collectRuntimeName = false,
  collectRuntimeVersion = false,
  inheritCoverage = false,
  collectCoverage = false,
  measurePerformance,
  collectPerformance = false,

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

  coverageV8MergeConflictIsExpected,
} = {}) => {
  const logger = createLogger({ logLevel: launchAndExecuteLogLevel })

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
    runtimeStartedCallback = composeCallback(runtimeStartedCallback, ({ runtimeName }) => {
      executionResultTransformer = composeTransformer(
        executionResultTransformer,
        (executionResult) => {
          executionResult.runtimeName = runtimeName
          return executionResult
        },
      )
    })
  }

  if (collectRuntimeVersion) {
    runtimeStartedCallback = composeCallback(runtimeStartedCallback, ({ runtimeVersion }) => {
      executionResultTransformer = composeTransformer(
        executionResultTransformer,
        (executionResult) => {
          executionResult.runtimeVersion = runtimeVersion
          return executionResult
        },
      )
    })
  }

  if (
    inheritCoverage &&
    // NODE_V8_COVERAGE is doing the coverage propagation for us
    !process.env.NODE_V8_COVERAGE
  ) {
    const collectCoverageSaved = collectCoverage
    collectCoverage = true
    executionResultTransformer = composeTransformer(
      executionResultTransformer,
      (executionResult) => {
        const { coverage, ...rest } = executionResult
        // ensure the coverage of the executed file is taken into account
        global.__coverage__ = composeIstanbulCoverages([global.__coverage__ || {}, coverage || {}])
        if (collectCoverageSaved) {
          return executionResult
        }
        return rest
      },
    )
  }

  // indirectCoverage is a feature making possible to collect
  // coverage generated by executing a node process which executes
  // a browser. The coverage coming the browser executionwould be lost
  // if not propagated somehow.
  // This is possible if the node process collect the browser coverage
  // and write it into global.__indirectCoverage__
  // This is used by jsenv during tests execution
  if (collectCoverage) {
    executionResultTransformer = composeTransformer(
      executionResultTransformer,
      (executionResult) => {
        const { coverage, indirectCoverage } = executionResult
        if (indirectCoverage) {
          executionResult.coverage = composeIstanbulCoverages([coverage, indirectCoverage], {
            coverageV8MergeConflictIsExpected,
          })
        }
        return executionResult
      },
    )
  } else {
    executionResultTransformer = composeTransformer(
      executionResultTransformer,
      (executionResult) => {
        // as collectCoverage is disabled
        // executionResult.coverage is undefined or {}
        // we delete it just to have a cleaner object
        delete executionResult.coverage
        return executionResult
      },
    )
  }

  let executionResult
  const executionParams = {
    logger,
    cancellationToken,

    launch,
    launchParams: {
      measurePerformance,
      collectPerformance,
      ...launchParams,
    },
    executeParams,

    stopAfterExecute,
    stopAfterExecuteReason,
    gracefulStopAllocatedMs,
    runtimeConsoleCallback,
    runtimeErrorCallback,
    runtimeDisconnectCallback,
    runtimeStartedCallback,
    runtimeStoppedCallback,
  }
  const hasAllocatedMs = typeof allocatedMs === "number" && allocatedMs !== Infinity
  if (hasAllocatedMs) {
    const TIMEOUT_CANCEL_REASON = "timeout"

    const timeoutCancellationSource = createCancellationSource()

    const id = setTimeout(() => {
      // here if allocatedMs is very big
      // setTimeout may be called immediatly
      // in that case we should just throw that hte number is too big
      timeoutCancellationSource.cancel(TIMEOUT_CANCEL_REASON)
    }, allocatedMs)
    const timeoutCancel = () => clearTimeout(id)

    cancellationToken.register(timeoutCancel)

    const externalOrTimeoutCancellationToken = composeCancellationToken(
      cancellationToken,
      timeoutCancellationSource.token,
    )

    try {
      executionResult = await computeExecutionResult({
        ...executionParams,
        cancellationToken: externalOrTimeoutCancellationToken,
      })
      timeoutCancel()
    } catch (e) {
      if (errorToCancelReason(e) === TIMEOUT_CANCEL_REASON) {
        executionResult = createTimedoutExecutionResult()
      } else {
        throw e
      }
    }
  } else {
    executionResult = await computeExecutionResult(executionParams)
  }

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

const computeExecutionResult = async ({
  logger,
  cancellationToken,

  launch,
  launchParams,
  executeParams,

  stopAfterExecute,
  stopAfterExecuteReason,
  gracefulStopAllocatedMs,
  runtimeStartedCallback,
  runtimeStoppedCallback,
  runtimeConsoleCallback,
  runtimeErrorCallback,
  runtimeDisconnectCallback,
}) => {
  logger.debug(`launch a runtime to execute something in it`)

  const launchOperation = createStoppableOperation({
    cancellationToken,
    start: async () => {
      const value = await launch({
        logger,
        cancellationToken,
        stopAfterExecute,
        ...launchParams,
      })
      runtimeStartedCallback({
        runtimeName: value.runtimeName,
        runtimeVersion: value.runtimeVersion,
      })
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
        logger.debug(`${runtime}: runtime.gracefulStop() because ${reason}`)

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
            `${runtime}: runtime.stop() because gracefulStop still pending after ${gracefulStopAllocatedMs}ms`,
          )
          await stop({ reason, gracefulFailed: true })
          return false
        })()

        stoppedGracefully = await Promise.race([gracefulStopPromise, stopPromise])
      } else {
        await stop({ reason, gracefulFailed: false })
        stoppedGracefully = false
      }

      logger.debug(`${runtime}: runtime stopped${stoppedGracefully ? " gracefully" : ""}`)
      runtimeStoppedCallback({ stoppedGracefully })
    },
  })

  const launchReturnValue = await launchOperation
  validateLaunchReturnValue(launchReturnValue)
  const {
    runtimeName,
    runtimeVersion,
    execute,
    disconnected,
    registerErrorCallback = () => {},
    registerConsoleCallback = () => {},
    finalizeExecutionResult = (executionResult) => executionResult,
  } = launchReturnValue

  const runtime = `${runtimeName}/${runtimeVersion}`

  logger.debug(createDetailedMessage(`${runtime}: runtime launched.`))

  logger.debug(`${runtime}: start execution.`)
  registerConsoleCallback(runtimeConsoleCallback)

  const executeOperation = createOperation({
    cancellationToken,
    start: async () => {
      let timing = TIMING_BEFORE_EXECUTION

      disconnected.then(() => {
        logger.debug(`${runtime}: runtime disconnected ${timing}.`)
        runtimeDisconnectCallback({ timing })
      })

      const executed = execute(executeParams)

      timing = TIMING_DURING_EXECUTION

      registerErrorCallback((error) => {
        logger.error(
          createDetailedMessage(`error ${timing}.`, {
            ["error stack"]: error.stack,
            ["execute params"]: JSON.stringify(executeParams, null, "  "),
            ["runtime"]: runtime,
          }),
        )
        runtimeErrorCallback({ error, timing })
      })

      const raceResult = await promiseTrackRace([disconnected, executed])
      timing = TIMING_AFTER_EXECUTION

      if (raceResult.winner === disconnected) {
        return createDisconnectedExecutionResult()
      }

      if (stopAfterExecute) {
        launchOperation.stop(stopAfterExecuteReason)
      }

      const executionResult = raceResult.value
      const { status } = executionResult

      if (status === "errored") {
        // debug log level because this error happens during execution
        // there is no need to log it.
        // the code will know the execution errored because it receives
        // an errored execution result
        logger.debug(
          createDetailedMessage(`error ${TIMING_DURING_EXECUTION}.`, {
            ["error stack"]: executionResult.error.stack,
            ["execute params"]: JSON.stringify(executeParams, null, "  "),
            ["runtime"]: runtime,
          }),
        )
        return finalizeExecutionResult(createErroredExecutionResult(executionResult))
      }

      logger.debug(`${runtime}: execution completed.`)
      return finalizeExecutionResult(createCompletedExecutionResult(executionResult))
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

const createErroredExecutionResult = (executionResult) => {
  return {
    ...executionResult,
    status: "errored",
  }
}

const createCompletedExecutionResult = (executionResult) => {
  return {
    ...executionResult,
    status: "completed",
    namespace: normalizeNamespace(executionResult.namespace),
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

const validateLaunchReturnValue = (launchReturnValue) => {
  if (launchReturnValue === null) {
    throw new Error(`launch must return an object, got null`)
  }

  if (typeof launchReturnValue !== "object") {
    throw new Error(`launch must return an object, got ${launchReturnValue}`)
  }

  const { runtimeName } = launchReturnValue
  if (typeof runtimeName !== "string") {
    throw new Error(`launch must return a runtimeName string, got ${runtimeName}`)
  }

  const { runtimeVersion } = launchReturnValue
  if (typeof runtimeVersion !== "string" && typeof runtimeVersion !== "number") {
    throw new Error(`launch must return a runtimeVersion, got ${runtimeName}`)
  }

  const { execute } = launchReturnValue
  if (typeof execute !== "function") {
    throw new Error(`launch must return an execute function, got ${execute}`)
  }

  const { disconnected } = launchReturnValue
  if (!disconnected || typeof disconnected.then !== "function") {
    throw new Error(`launch must return a disconnected promise, got ${execute}`)
  }
}
