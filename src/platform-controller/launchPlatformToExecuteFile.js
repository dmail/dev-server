import {
  createCancellationToken,
  cancellationTokenCompose,
  cancellationTokenToPromise,
  createOperation,
} from "@dmail/cancellation"
import { promiseTrackRace } from "../promiseHelper.js"
import { createRestartSignal } from "./restartController.js"

/*
hot reloading will work that way:

we listen for file change.
we track file currently being executed.
we create a restart controller per file execution
we create a cancel token per file execution

if the file is modified while being executed we call the restart controller.
if the file is executed we call cancel on file execution in case platform must be closed.
Because the current running file may have side effect until it's completely closed
we wait for cancel to resolve before calling executeFile.
*/

// when launchPlatform returns close/closeForce
// the launched platform have that amount of ms to close
// before we call closeForce
const ALLOCATED_MS_FOR_CLOSE = 10 * 60 * 10 * 1000

export const launchPlatformToExecuteFile = (
  launchPlatform,
  {
    cancellationToken = createCancellationToken(),
    platformTypeForLog = "platform", // should be 'node', 'chromium', 'firefox'
    verbose = false,
  } = {},
) => {
  const log = (...args) => {
    if (verbose) {
      console.log(...args)
    }
  }

  const platformCancellationToken = cancellationToken

  const executeFile = (
    file,
    {
      cancellationToken = createCancellationToken(),
      restartSignal = createRestartSignal(),
      instrument = false,
      setup = () => {},
      teardown = () => {},
    } = {},
  ) => {
    const executionCancellationToken = cancellationTokenCompose(
      platformCancellationToken,
      cancellationToken,
    )

    const createPlatformClosedDuringExecutionError = () => {
      const error = new Error(`${platformTypeForLog} unexpectedtly closed while executing ${file}`)
      error.code = "PLATFORM_CLOSED_DURING_EXECUTION_ERROR"
      return error
    }

    const startPlatform = async () => {
      executionCancellationToken.throwIfRequested()

      log(`launch ${platformTypeForLog} to execute ${file}`)
      let { opened, closed, close, closeForce, fileToExecuted } = await launchPlatform()

      closed = closed.catch((e) => {
        log(`${platformTypeForLog} error: ${e}`)
        return Promise.reject(e)
      })

      const platformOperation = createOperation({
        cancellationToken: executionCancellationToken,
        promise: opened,
        stop: (reason) => {
          log(`stop ${platformTypeForLog}`)
          close(reason)

          if (closeForce) {
            const id = setTimeout(closeForce, ALLOCATED_MS_FOR_CLOSE)
            closed.finally(() => clearTimeout(id))
          }
          return closed
        },
      })

      await platformOperation

      log(`execute ${file} on ${platformTypeForLog}`)
      const executed = fileToExecuted(file, { instrument, setup, teardown })

      // canceled will reject in case of cancellation
      const canceled = cancellationTokenToPromise(executionCancellationToken)

      const restarted = new Promise((resolve) => {
        restartSignal.onrestart = resolve
      })

      const { winner, value } = await promiseTrackRace([canceled, restarted, closed, executed])

      if (winner === restarted) {
        return platformOperation.stop(value).then(startPlatform)
      }

      if (winner === closed) {
        log(`${platformTypeForLog} closed`)
        return Promise.reject(createPlatformClosedDuringExecutionError())
      }

      // executed
      // should I call child.disconnect() at some point ?
      // https://nodejs.org/api/child_process.html#child_process_subprocess_disconnect
      log(`${file} execution on ${platformTypeForLog} done with ${value}`)
      return value
    }

    return startPlatform()
  }

  return executeFile
}
