import { fork as forkChildProcess } from "child_process"
import { uneval } from "@dmail/uneval"
import { projectFolder } from "../../projectFolder.js"
import { createChildExecArgv } from "./createChildExecArgv.js"

const nodeClientFile = `${projectFolder}/dist/src/launchNode/client.js`

export const launchNode = async ({
  cancellationToken,
  compileInto,
  sourceOrigin,
  compileServerOrigin,
  debugMode,
  debugPort,
  remap = true,
}) => {
  const execArgv = await createChildExecArgv({
    cancellationToken,
    debugMode,
    debugPort,
    processExecArgv: process.execArgv,
    processDebugPort: process.debugPort,
  })

  const child = forkChildProcess(nodeClientFile, {
    execArgv,
    // silent: true
    stdio: "pipe",
  })

  const consoleCallbackArray = []
  const registerConsoleCallback = (callback) => {
    consoleCallbackArray.push(callback)
  }
  // beware that we may receive ansi output here, should not be a problem but keep that in mind
  child.stdout.on("data", (chunk) => {
    const text = String(chunk)
    consoleCallbackArray.forEach((callback) => {
      callback({
        type: "log",
        text,
      })
    })
  })
  child.stderr.on("data", (chunk) => {
    const text = String(chunk)
    consoleCallbackArray.forEach((callback) => {
      callback({
        type: "error",
        text,
      })
    })
  })

  const errorCallbackArray = []
  const registerErrorCallback = (callback) => {
    errorCallbackArray.push(callback)
  }
  const emitError = (error) => {
    errorCallbackArray.forEach((callback) => {
      callback(error)
    })
  }
  // https://nodejs.org/api/child_process.html#child_process_event_error
  const errorEventRegistration = registerChildEvent(child, "error", (error) => {
    errorEventRegistration.unregister()
    exitErrorRegistration.unregister()
    emitError(error)
  })
  // process.exit(1) from child
  const exitErrorRegistration = registerChildEvent(child, "exit", (code) => {
    if (code !== 0 && code !== null) {
      errorEventRegistration.unregister()
      exitErrorRegistration.unregister()
      emitError(createExitWithFailureCodeError(code))
    }
  })

  // https://nodejs.org/api/child_process.html#child_process_event_disconnect
  const registerDisconnectCallback = (callback) => {
    const registration = registerChildEvent(child, "disconnect", () => {
      callback()
    })
    return () => {
      registration.unregister()
    }
  }

  const stop = () => {
    const disconnectedPromise = new Promise((resolve) => {
      const unregister = registerDisconnectCallback(() => {
        unregister()
        resolve()
      })
    })
    child.kill("SIGINT")
    return disconnectedPromise
  }

  const stopForce = () => {
    const disconnectedPromise = new Promise((resolve) => {
      const unregister = registerDisconnectCallback(() => {
        unregister()
        resolve()
      })
    })
    child.kill()
    return disconnectedPromise
  }

  const executeFile = async (filenameRelative, { collectNamespace, collectCoverage }) => {
    const execute = () =>
      new Promise((resolve) => {
        const executResultRegistration = registerChildMessage(child, "execute-result", (value) => {
          executResultRegistration.unregister()
          resolve(value)
        })

        sendToChild(child, "execute", {
          sourceOrigin,
          compileServerOrigin,
          compileInto,

          filenameRelative,
          collectNamespace,
          collectCoverage,
          remap,
        })
      })

    const { status, coverageMap, error, namespace } = await execute()
    if (status === "rejected") {
      return {
        status,
        error: errorToSourceError(error, { filenameRelative, sourceOrigin }),
        coverageMap,
      }
    }
    return {
      status,
      coverageMap,
      namespace,
    }
  }

  return {
    name: "node",
    version: process.version.slice(1),
    options: { execArgv },
    stop,
    stopForce,
    registerDisconnectCallback,
    registerErrorCallback,
    registerConsoleCallback,
    executeFile,
  }
}

const sendToChild = (child, type, data) => {
  const source = uneval(data, { showFunctionBody: true })
  child.send({
    type,
    data: source,
  })
}

const registerChildMessage = (child, type, callback) => {
  return registerChildEvent(child, "message", (message) => {
    if (message.type === type) {
      callback(eval(`(${message.data})`))
    }
  })
}

const registerChildEvent = (child, type, callback) => {
  child.on(type, callback)

  const unregister = () => {
    child.removeListener(type, callback)
  }

  const registration = {
    unregister,
  }
  return registration
}

const createExitWithFailureCodeError = (code) => {
  if (code === 12) {
    return new Error(
      `child exited with 12: forked child wanted to use a non available port for debug`,
    )
  }
  return new Error(`child exited with ${code}`)
}

const errorToSourceError = (error, { filenameRelative, sourceOrigin }) => {
  if (error && error.code === "MODULE_PARSE_ERROR") {
    error.message = error.message.replace(filenameRelative, `${sourceOrigin}/${filenameRelative}`)
    return error
  }

  if (error && typeof error === "object") {
    return error
  }

  return error
}
