// https://github.com/avajs/ava/blob/576f534b345259055c95fa0c2b33bef10847a2af/lib/fork.js#L23
// https://nodejs.org/api/worker_threads.html
// https://github.com/avajs/ava/blob/576f534b345259055c95fa0c2b33bef10847a2af/lib/worker/base.js
import { Worker } from "node:worker_threads"
import { fileURLToPath } from "node:url"
import {
  Abort,
  createCallbackListNotifiedOnce,
  raceCallbacks,
} from "@jsenv/abort"
import { memoize } from "@jsenv/utils/src/memoize/memoize.js"

import { createChildExecOptions } from "./child_exec_options.js"
import { ExecOptions } from "./exec_options.js"
import { EXIT_CODES } from "./exit_codes.js"

const CONTROLLABLE_WORKER_THREAD_URL = new URL(
  "./controllable_worker_thread.mjs",
  import.meta.url,
).href

export const nodeWorkerThread = {
  type: "node",
  name: "node_worker_thread",
  version: process.version.slice(1),
}

nodeWorkerThread.run = async ({
  signal = new AbortController().signal,
  // logger,
  rootDirectoryUrl,
  fileRelativeUrl,

  keepRunning,
  gracefulStopAllocatedMs = 4000,
  stopSignal,
  onConsole,

  collectCoverage = false,
  coverageForceIstanbul,
  collectPerformance,

  env,
  debugPort,
  debugMode,
  debugModeInheritBreak,
  inheritProcessEnv = true,
  commandLineOptions = [],
}) => {
  if (env !== undefined && typeof env !== "object") {
    throw new TypeError(`env must be an object, got ${env}`)
  }
  env = {
    ...env,
    COVERAGE_ENABLED: collectCoverage,
    JSENV: true,
  }
  if (coverageForceIstanbul) {
    // if we want to force istanbul, we will set process.env.NODE_V8_COVERAGE = ''
    // into the worker_thread
    env.NODE_V8_COVERAGE = ""
  }

  const childExecOptions = await createChildExecOptions({
    signal,
    debugPort,
    debugMode,
    debugModeInheritBreak,
  })
  const execArgv = ExecOptions.toExecArgv({
    ...childExecOptions,
    ...ExecOptions.fromExecArgv(commandLineOptions),
  })
  const envForWorker = {
    ...(inheritProcessEnv ? process.env : {}),
    ...env,
  }

  const cleanupCallbackList = createCallbackListNotifiedOnce()
  const cleanup = async (reason) => {
    await cleanupCallbackList.notify({ reason })
  }
  const actionOperation = Abort.startOperation()
  actionOperation.addAbortSignal(signal)
  // https://nodejs.org/api/worker_threads.html#new-workerfilename-options
  const workerThread = new Worker(
    fileURLToPath(CONTROLLABLE_WORKER_THREAD_URL),
    {
      env: envForWorker,
      execArgv,
      // workerData: { options },
      trackUnmanagedFds: true,
      stdin: true,
      stdout: true,
      stderr: true,
    },
  )
  const removeOutputListener = installWorkerThreadOutputListener(
    workerThread,
    ({ type, text }) => {
      onConsole({ type, text })
    },
  )
  const workerThreadReadyPromise = new Promise((resolve) => {
    onceWorkerThreadMessage(workerThread, "ready", resolve)
  })

  const stop = memoize(async () => {
    try {
      await workerThreadReadyPromise
      await workerThread.terminate()
    } catch (e) {}
  })

  const winnerPromise = new Promise((resolve) => {
    raceCallbacks(
      {
        aborted: (cb) => {
          return actionOperation.addAbortCallback(cb)
        },
        error: (cb) => {
          return onceWorkerThreadEvent(workerThread, "error", cb)
        },
        exit: (cb) => {
          return onceWorkerThreadEvent(workerThread, "exit", (code, signal) => {
            cb({ code, signal })
          })
        },
        response: (cb) => {
          return onceWorkerThreadMessage(workerThread, "action-result", cb)
        },
      },
      resolve,
    )
  })

  const getResult = async () => {
    actionOperation.throwIfAborted()
    await workerThreadReadyPromise
    actionOperation.throwIfAborted()
    await sendToWorkerThread(workerThread, {
      type: "action",
      data: {
        actionType: "execute-using-dynamic-import",
        actionParams: {
          fileUrl: new URL(fileRelativeUrl, rootDirectoryUrl).href,
          collectPerformance,
          exitAfterAction: true,
        },
      },
    })
    const winner = await winnerPromise
    if (winner.name === "aborted") {
      return {
        status: "aborted",
      }
    }
    if (winner.name === "error") {
      const error = winner.data
      removeOutputListener()
      return {
        status: "errored",
        error,
      }
    }
    if (winner.name === "exit") {
      const { code } = winner.data
      await cleanup("process exit")
      if (code === 12) {
        return {
          status: "errored",
          error: new Error(
            `node process exited with 12 (the forked child process wanted to use a non-available port for debug)`,
          ),
        }
      }
      if (
        code === null ||
        code === 0 ||
        code === EXIT_CODES.SIGINT ||
        code === EXIT_CODES.SIGTERM ||
        code === EXIT_CODES.SIGABORT
      ) {
        return {
          status: "errored",
          error: new Error(`node worker thread exited during execution`),
        }
      }
      // process.exit(1) in child process or process.exitCode = 1 + process.exit()
      // means there was an error even if we don't know exactly what.
      return {
        status: "errored",
        error: new Error(
          `node worker thread exited with code ${code} during execution`,
        ),
      }
    }
    const { status, value } = winner.data
    if (status === "action-failed") {
      return {
        status: "errored",
        error: value,
      }
    }
    return {
      status: "completed",
      ...value,
    }
  }

  let result
  try {
    result = await getResult()
  } catch (e) {
    result = {
      status: "errored",
      error: e,
    }
  }
  if (keepRunning) {
    stopSignal.notify = stop
  } else {
    await stop({
      gracefulStopAllocatedMs,
    })
  }
  await actionOperation.end()
  return result
}

const installWorkerThreadOutputListener = (workerThread, callback) => {
  // beware that we may receive ansi output here, should not be a problem but keep that in mind
  const stdoutDataCallback = (chunk) => {
    callback({ type: "log", text: String(chunk) })
  }
  workerThread.stdout.on("data", stdoutDataCallback)
  const stdErrorDataCallback = (chunk) => {
    callback({ type: "error", text: String(chunk) })
  }
  workerThread.stderr.on("data", stdErrorDataCallback)
  return () => {
    workerThread.stdout.removeListener("data", stdoutDataCallback)
    workerThread.stderr.removeListener("data", stdoutDataCallback)
  }
}

const sendToWorkerThread = (worker, { type, data }) => {
  worker.postMessage({ jsenv: true, type, data })
}

const onceWorkerThreadMessage = (workerThread, type, callback) => {
  const onmessage = (message) => {
    if (message && message.jsenv && message.type === type) {
      workerThread.removeListener("message", onmessage)
      // eslint-disable-next-line no-eval
      callback(message.data ? eval(`(${message.data})`) : undefined)
    }
  }
  workerThread.on("message", onmessage)
  return () => {
    workerThread.removeListener("message", onmessage)
  }
}

const onceWorkerThreadEvent = (worker, type, callback) => {
  worker.once(type, callback)
  return () => {
    worker.removeListener(type, callback)
  }
}
