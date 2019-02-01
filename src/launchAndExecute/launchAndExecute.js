import {
  createCancellationToken,
  createOperation,
  createStoppableOperation,
  createCancellationSource,
  cancellationTokenCompose,
  errorToCancelReason,
} from "@dmail/cancellation"
import { promiseTrackRace } from "@dmail/helper"

export const launchAndExecute = async (
  launchPlatform,
  file,
  {
    cancellationToken = createCancellationToken(),
    allocatedMs,
    captureConsole = false,
    mirrorConsole = false,
    ...rest
  } = {},
) => {
  let platformLog = ""
  const consoleCallback = ({ type, text }) => {
    if (captureConsole) {
      platformLog += text
    }
    if (mirrorConsole) {
      if (type === "error") {
        process.stderr.write(text)
      } else {
        process.stdout.write(text)
      }
    }
  }

  const hasAllocatedMs = typeof allocatedMs === "number"

  const computeExecutionResultWithoutPlatformLog = async () => {
    if (!hasAllocatedMs) {
      return computeExecutionResult({
        launchPlatform,
        file,
        cancellationToken,
        consoleCallback,
        ...rest,
      })
    }

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
        launchPlatform,
        file,
        cancellationToken: externalOrTimeoutCancellationToken,
        consoleCallback,
        ...rest,
      })
      timeoutCancel()
      return executionResult
    } catch (e) {
      if (errorToCancelReason(e) === TIMEOUT_CANCEL_REASON) {
        return createTimedoutExecutionResult({
          allocatedMs,
        })
      }
      throw e
    }
  }

  const executionResult = await computeExecutionResultWithoutPlatformLog()
  executionResult.platformLog = platformLog
  return platformLog
}

// when launchPlatform returns { disconnected, stop, stopForce }
// the launched platform have that amount of ms for disconnected to resolve
// before we call stopForce
const ALLOCATED_MS_BEFORE_FORCE_STOP = 10 * 60 * 10 * 1000

const computeExecutionResult = async ({
  cancellationToken,
  launchPlatform,
  file,
  platformTypeForLog = "platform", // should be 'node', 'chromium', 'firefox'
  verbose = false,
  // stopOnceExecuted false by default because you want to keep browser alive
  // or nodejs process
  // however unit test will pass true because they want to move on
  stopOnceExecuted = false,
  // stopOnError is false by default because it's better to keep process/browser alive
  // to debug the error to the its consequences
  // however unit test will pass true because they want to move on
  stopOnError = false,
  errorAfterExecutedCallback = (error) => {
    console.log(`${platformTypeForLog} error ${error.stack}`)
  },
  disconnectAfterExecutedCallback = () => {
    console.log(`${platformTypeForLog} disconnected`)
  },
  startedCallback = () => {},
  stoppedCallback = () => {},
  consoleCallback = () => {},
  ...executionOptions
}) => {
  const startMs = Date.now()

  const log = (...args) => {
    if (verbose) {
      console.log(...args)
    }
  }

  log(`launch ${platformTypeForLog} to execute ${file}`)
  const launchOperation = createStoppableOperation({
    cancellationToken,
    start: async () => {
      const value = await launchPlatform()
      startedCallback()
      return value
    },
    stop: ({ stop, stopForce, registerDisconnectCallback }) => {
      // external code can cancel using canlleationToken
      // and listen for stoppedCallback before restarting the launchAndExecute operation.
      // it is important to keep that code here because once cancelled
      // all code after the operation won't execute because it will be rejected with
      // the cancellation error
      registerDisconnectCallback(stoppedCallback)

      log(`stop ${platformTypeForLog}`)
      stop()

      if (stopForce) {
        const id = setTimeout(stopForce, ALLOCATED_MS_BEFORE_FORCE_STOP)
        registerDisconnectCallback(() => {
          clearTimeout(id)
        })
      }

      return new Promise((resolve) => {
        registerDisconnectCallback(resolve)
      })
    },
  })

  const {
    options,
    executeFile,
    registerErrorCallback,
    registerConsoleCallback,
    registerDisconnectCallback,
  } = await launchOperation

  log(`${platformTypeForLog} started ${JSON.stringify(options)}`)

  registerConsoleCallback(consoleCallback)

  const onError = () => {
    if (stopOnError) {
      launchOperation.stop("stopOnError")
    }
  }

  log(`execute ${file} on ${platformTypeForLog}`)
  const executionResult = await createOperation({
    cancellationToken,
    start: async () => {
      const disconnected = new Promise((resolve) => {
        registerDisconnectCallback(resolve)
      })

      const errored = new Promise((resolve) => {
        registerErrorCallback(resolve)
      })

      const executionPromise = executeFile(file, executionOptions)
      const executionCompleted = new Promise((resolve) => {
        executionPromise.then(
          (value) => {
            resolve(value)
          },
          () => {},
        )
      })

      const executionErrored = new Promise((resolve) => {
        executionPromise.catch((error) => {
          resolve(error)
        })
      })

      const { winner, value } = await promiseTrackRace([
        disconnected,
        errored,
        executionErrored,
        executionCompleted,
      ])

      if (winner === disconnected) {
        return createDisconnectedExecutionResult({
          startMs,
          endMs: Date.now(),
        })
      }

      if (winner === errored) {
        onError(value)
        return createErroredExecutionResult({
          startMs,
          endMs: Date.now(),
          error: value,
        })
      }

      if (winner === executionErrored) {
        onError(value)
        return createErroredExecutionResult({
          startMs,
          endMs: Date.now(),
          error: value,
        })
      }

      log(`${file} execution on ${platformTypeForLog} done with ${value}`)
      registerErrorCallback((error) => {
        errorAfterExecutedCallback(error)
        onError(error)
      })
      registerDisconnectCallback(() => {
        disconnectAfterExecutedCallback()
      })

      if (stopOnceExecuted) {
        launchOperation.stop("stopOnceExecuted")
      }

      const { status, coverageMap, error, namespace } = value
      if (status === "rejected") {
        return createErroredExecutionResult({
          startMs,
          endMs: Date.now(),
          error,
          coverageMap,
        })
      }

      return createCompletedExecutionResult({
        startMs,
        endMs: Date.now(),
        coverageMap,
        namespace,
      })
    },
  })

  return executionResult
}

const createTimedoutExecutionResult = ({ startMs, endMs }) => {
  return {
    status: "timedout",
    startMs,
    endMs,
  }
}

const createDisconnectedExecutionResult = ({ startMs, endMs }) => {
  return {
    status: "disconnected",
    startMs,
    endMs,
  }
}

const createErroredExecutionResult = ({ startMs, endMs, coverageMap, error }) => {
  return {
    status: "errored",
    startMs,
    endMs,

    coverageMap,
    error,
  }
}

const createCompletedExecutionResult = ({
  startMs,
  endMs,

  coverageMap,
  namespace,
}) => {
  return {
    status: "completed",
    startMs,
    endMs,

    coverageMap,
    namespace,
  }
}

// well this is unexpected but haven't decided yet how we will handle that
// const createDisconnectedDuringExecutionError = (file, platformType) => {
//   const error = new Error(`${platformType} disconnected while executing ${file}`)
//   error.code = "PLATFORM_DISCONNECTED_DURING_EXECUTION_ERROR"
//   return error
// }
