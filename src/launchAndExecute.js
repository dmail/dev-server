import {
  createCancellationToken,
  createOperation,
  createStoppableOperation,
  createCancellationSource,
  cancellationTokenCompose,
  errorToCancelReason,
} from "@dmail/cancellation"
import { promiseTrackRace } from "@dmail/helper"
import { createLogger } from "@jsenv/logger"
import { coverageMapCompose } from "./coverageMapCompose.js"

const TIMING_BEFORE_EXECUTION = "before-execution"
const TIMING_DURING_EXECUTION = "during-execution"
const TIMING_AFTER_EXECUTION = "after-execution"

export const launchAndExecute = async ({
  cancellationToken = createCancellationToken(),
  launch,
  allocatedMs,
  captureConsole = false,
  mirrorConsole = false,
  measureDuration = false,
  // stopOnceExecuted false by default because you want to keep browser alive
  // or nodejs process
  // however unit test will pass true because they want to move on
  stopOnceExecuted = false,
  logLevel = "off",
  launchLogLevel = logLevel,
  executeLogLevel = logLevel,
  consoleCallback = () => {},
  startedCallback = () => {},
  stoppedCallback = () => {},
  errorCallback = () => {},
  disconnectCallback = () => {},
  fileRelativePath,
  collectNamespace = false,
  collectCoverage = false,
  executionId,
  inheritCoverage = false,
  collectPlatformNameAndVersion = false,
} = {}) => {
  if (typeof launch !== "function") {
    throw new TypeError(`launchAndExecute launch must be a function, got ${launch}`)
  }
  if (typeof fileRelativePath !== "string") {
    throw new TypeError(
      `launchAndExecute fileRelativePath must be a string, got ${fileRelativePath}`,
    )
  }

  let executionResultTransformer = (executionResult) => executionResult

  if (captureConsole) {
    let platformLog = ""
    consoleCallback = composeCallback(consoleCallback, ({ text }) => {
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

  if (mirrorConsole) {
    consoleCallback = composeCallback(consoleCallback, ({ type, text }) => {
      if (type === "error") {
        process.stderr.write(text)
      } else {
        process.stdout.write(text)
      }
    })
  }

  if (collectPlatformNameAndVersion) {
    startedCallback = composeCallback(startedCallback, ({ name, version }) => {
      executionResultTransformer = composeTransformer(
        executionResultTransformer,
        (executionResult) => {
          executionResult.platformName = name
          executionResult.platformVersion = version
          return executionResult
        },
      )
    })
  }

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

  if (inheritCoverage) {
    const savedCollectCoverage = collectCoverage
    collectCoverage = true
    executionResultTransformer = composeTransformer(
      executionResultTransformer,
      (executionResult) => {
        const { coverageMap, ...rest } = executionResult
        // ensure the coverage of the launched stuff
        // is accounted as coverage for this
        global.__coverage__ = coverageMapCompose(global.__coverage__ || {}, coverageMap || {})
        return savedCollectCoverage ? executionResult : rest
      },
    )
  }

  const executionResult = await computeRawExecutionResult({
    launch,
    cancellationToken,
    allocatedMs,
    launchLogLevel,
    executeLogLevel,
    consoleCallback,
    stopOnceExecuted,
    errorCallback,
    disconnectCallback,
    startedCallback,
    stoppedCallback,
    fileRelativePath,
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

const computeRawExecutionResult = async ({
  launch,
  cancellationToken,
  allocatedMs,
  consoleCallback,
  fileRelativePath,
  ...rest
}) => {
  const hasAllocatedMs = typeof allocatedMs === "number" && allocatedMs !== Infinity

  if (!hasAllocatedMs) {
    return computeExecutionResult({
      launch,
      cancellationToken,
      consoleCallback,
      fileRelativePath,
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
  const externalOrTimeoutCancellationToken = cancellationTokenCompose(
    cancellationToken,
    timeoutCancellationSource.token,
  )

  try {
    const executionResult = await computeExecutionResult({
      launch,
      cancellationToken: externalOrTimeoutCancellationToken,
      consoleCallback,
      fileRelativePath,
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

// when launchPlatform returns { disconnected, stop, stopForce }
// the launched platform have that amount of ms for disconnected to resolve
// before we call stopForce
const ALLOCATED_MS_BEFORE_FORCE_STOP = 8000

const computeExecutionResult = async ({
  launch,
  cancellationToken,
  launchLogLevel,
  executeLogLevel,
  startedCallback,
  stoppedCallback,
  consoleCallback,
  errorCallback,
  disconnectCallback,
  stopOnceExecuted,
  fileRelativePath,
  collectNamespace,
  collectCoverage,
  executionId,
}) => {
  const launchLogger = createLogger({ logLevel: launchLogLevel })
  const executeLogger = createLogger({ logLevel: executeLogLevel })

  launchLogger.debug(createStartingPlatformMessage({ fileRelativePath }))

  const launchOperation = createStoppableOperation({
    cancellationToken,
    start: async () => {
      const value = await launch({ cancellationToken, logLevel: launchLogLevel })
      startedCallback({ name: value.name, version: value.version })
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
            const timeoutId = setTimeout(resolve, ALLOCATED_MS_BEFORE_FORCE_STOP)
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

      stoppedCallback({ forced: forceStopped })
      launchLogger.debug(createPlatformStoppedMessage())
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

  launchLogger.debug(createPlatformStartedMessage({ platformName, platformVersion, options }))
  registerConsoleCallback(consoleCallback)
  executeLogger.debug(createStartExecutionMessage({ fileRelativePath }))

  const executeOperation = createOperation({
    cancellationToken,
    start: async () => {
      let timing = TIMING_BEFORE_EXECUTION

      const disconnected = new Promise((resolve) => {
        registerDisconnectCallback(() => {
          executeLogger.debug(createDisconnectedLog())
          disconnectCallback({ timing })
          resolve()
        })
      })

      const executed = executeFile(fileRelativePath, {
        collectNamespace,
        collectCoverage,
        executionId,
      })
      timing = TIMING_DURING_EXECUTION

      registerErrorCallback((error) => {
        executeLogger.error(createErrorLog({ error, timing }))
        errorCallback({ error, timing })
      })

      const raceResult = await promiseTrackRace([disconnected, executed])
      timing = TIMING_AFTER_EXECUTION

      if (raceResult.winner === disconnected) {
        return createDisconnectedExecutionResult({})
      }

      if (stopOnceExecuted) {
        launchOperation.stop("stopOnceExecuted")
      }

      const executionResult = raceResult.value
      const { status } = executionResult
      if (status === "errored") {
        executeLogger.error(createErroredLog(executionResult))
        return createErroredExecutionResult(executionResult, { collectCoverage })
      }

      executeLogger.debug(createCompletedLog(executionResult))
      return createCompletedExecutionResult(executionResult, { collectNamespace, collectCoverage })
    },
  })

  const executionResult = await executeOperation

  return executionResult
}

const createStartingPlatformMessage = () => `
start a platform to execute a file.`

const createPlatformStartedMessage = ({
  platformName,
  platformVersion,
  options,
}) => `${platformName}@${platformVersion} started.
--- options ---
options: ${JSON.stringify(options, null, "  ")}`

const createPlatformStoppedMessage = () => `platform stopped.`

const createStartExecutionMessage = ({ fileRelativePath }) => `execute file ${fileRelativePath}`

const createErrorLog = ({ error, timing }) =>
  timing === "after-execution"
    ? `error after execution.
stack: ${error.stack}`
    : `error during execution.
stack: ${error.stack}`

const createErroredLog = ({ error }) => `execution errored.
error: ${error}`

const createCompletedLog = () => `execution completed.`

const createDisconnectedLog = () => `platform disconnected.`

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
