/* eslint-disable import/max-dependencies */
import { Script } from "vm"
import { fork as forkChildProcess } from "child_process"
import { uneval } from "@jsenv/uneval"
import { createCancellationToken } from "@jsenv/cancellation"
import { fetchUrl } from "@jsenv/server"
import { COMPILE_ID_COMMONJS_BUNDLE } from "./internal/CONSTANTS.js"
import { urlToFileSystemPath, resolveUrl, urlToRelativeUrl, assertFilePresence } from "@jsenv/util"
import { jsenvCoreDirectoryUrl } from "./internal/jsenvCoreDirectoryUrl.js"
import { escapeRegexpSpecialCharacters } from "./internal/escapeRegexpSpecialCharacters.js"
import { createChildExecArgv } from "./internal/node-launcher/createChildExecArgv.js"

const EVALUATION_STATUS_OK = "evaluation-ok"

export const launchNode = async ({
  cancellationToken = createCancellationToken(),
  // logger,

  projectDirectoryUrl,
  outDirectoryRelativeUrl,
  compileServerOrigin,

  debugPort = 0,
  debugMode = "inherit",
  debugModeInheritBreak = true,
  remap = true,
  traceWarnings = true,
  collectCoverage = false,
  env,
}) => {
  if (typeof projectDirectoryUrl !== "string") {
    throw new TypeError(`projectDirectoryUrl must be a string, got ${projectDirectoryUrl}`)
  }
  if (typeof compileServerOrigin !== "string") {
    throw new TypeError(`compileServerOrigin must be a string, got ${compileServerOrigin}`)
  }
  if (typeof outDirectoryRelativeUrl !== "string") {
    throw new TypeError(`outDirectoryRelativeUrl must be a string, got ${outDirectoryRelativeUrl}`)
  }
  if (env === undefined) {
    env = { ...process.env }
  } else if (typeof env !== "object") {
    throw new TypeError(`env must be an object, got ${env}`)
  }

  const nodeControllableFileUrl = resolveUrl(
    "./src/internal/node-launcher/nodeControllableFile.cjs",
    jsenvCoreDirectoryUrl,
  )
  await assertFilePresence(nodeControllableFileUrl)

  const execArgv = await createChildExecArgv({
    cancellationToken,
    debugPort,
    debugMode,
    debugModeInheritBreak,
    processExecArgv: process.execArgv,
    processDebugPort: process.debugPort,
  })
  if (traceWarnings && !execArgv.includes("--trace-warnings")) {
    execArgv.push("--trace-warnings")
  }

  env.COVERAGE_ENABLED = collectCoverage

  const child = forkChildProcess(urlToFileSystemPath(nodeControllableFileUrl), {
    execArgv,
    // silent: true
    stdio: "pipe",
    env,
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

  const executeFile = async (
    fileRelativeUrl,
    { collectNamespace, collectCoverage, executionId },
  ) => {
    const execute = async () => {
      const nodeJsFileUrl = resolveUrl(
        "./src/internal/node-launcher/node-js-file.js",
        jsenvCoreDirectoryUrl,
      )
      const nodeJsFileRelativeUrl = urlToRelativeUrl(nodeJsFileUrl, projectDirectoryUrl)
      const nodeBundledJsFileRelativeUrl = `${outDirectoryRelativeUrl}${COMPILE_ID_COMMONJS_BUNDLE}/${nodeJsFileRelativeUrl}`
      const nodeBundledJsFileUrl = `${projectDirectoryUrl}${nodeBundledJsFileRelativeUrl}`
      const nodeBundledJsFileRemoteUrl = `${compileServerOrigin}/${nodeBundledJsFileRelativeUrl}`
      await fetchUrl(nodeBundledJsFileRemoteUrl, {
        cancellationToken,
      })

      return new Promise((resolve, reject) => {
        const evaluationResultRegistration = registerChildMessage(
          child,
          "evaluate-result",
          ({ status, value }) => {
            evaluationResultRegistration.unregister()
            if (status === EVALUATION_STATUS_OK) resolve(value)
            else reject(value)
          },
        )

        sendToChild(
          child,
          "evaluate",
          createNodeIIFEString({
            nodeJsFileUrl,
            nodeBundledJsFileUrl,
            projectDirectoryUrl,
            outDirectoryRelativeUrl,
            fileRelativeUrl,
            compileServerOrigin,

            collectNamespace,
            collectCoverage,
            executionId,
            remap,
          }),
        )
      })
    }

    const executionResult = await execute()
    const { status } = executionResult
    if (status === "errored") {
      const { exceptionSource, coverageMap } = executionResult
      return {
        status,
        error: evalException(exceptionSource, { compileServerOrigin, projectDirectoryUrl }),
        coverageMap,
      }
    }

    const { namespace, coverageMap } = executionResult
    return {
      status,
      namespace,
      coverageMap,
    }
  }

  return {
    name: "node",
    version: process.version.slice(1),
    options: { execArgv, env },
    stop,
    stopForce,
    registerDisconnectCallback,
    registerErrorCallback,
    registerConsoleCallback,
    executeFile,
  }
}

const evalException = (exceptionSource, { compileServerOrigin, projectDirectoryUrl }) => {
  const error = evalSource(exceptionSource)
  if (error && error instanceof Error) {
    const compileServerOriginRegexp = new RegExp(
      escapeRegexpSpecialCharacters(`${compileServerOrigin}/`),
      "g",
    )

    error.stack = error.stack.replace(compileServerOriginRegexp, projectDirectoryUrl)
    error.message = error.message.replace(compileServerOriginRegexp, projectDirectoryUrl)

    // const projectDirectoryPath = urlToFileSystemPath(projectDirectoryUrl)
    // const projectDirectoryPathRegexp = new RegExp(
    //   `(?<!file:\/\/)${escapeRegexpSpecialCharacters(projectDirectoryPath)}`,
    //   "g",
    // )
    // error.stack = error.stack.replace(projectDirectoryPathRegexp, projectDirectoryUrl)
    // error.message = error.message.replace(projectDirectoryPathRegexp, projectDirectoryUrl)
  }

  return error
}

const sendToChild = (child, type, data) => {
  const source = uneval(data, { functionAllowed: true })
  child.send({
    type,
    data: source,
  })
}

const registerChildMessage = (child, type, callback) => {
  return registerChildEvent(child, "message", (message) => {
    if (message.type === type) {
      // eslint-disable-next-line no-eval
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

const createNodeIIFEString = ({
  nodeJsFileUrl,
  nodeBundledJsFileUrl,
  projectDirectoryUrl,
  outDirectoryRelativeUrl,
  fileRelativeUrl,
  compileServerOrigin,

  collectNamespace,
  collectCoverage,
  executionId,
  remap,
}) => `(() => {
  const fs = require('fs')
  const Module = require('module')
  const nodeFilePath = ${JSON.stringify(urlToFileSystemPath(nodeJsFileUrl))}
  const nodeBundledJsFilePath = ${JSON.stringify(urlToFileSystemPath(nodeBundledJsFileUrl))}
  const fileContent = String(fs.readFileSync(nodeBundledJsFilePath))
  const moduleObject = new Module(nodeBundledJsFilePath)
  moduleObject.paths = Module._nodeModulePaths(require('path').dirname(nodeFilePath));
  moduleObject._compile(fileContent, nodeBundledJsFilePath)
  const { execute } = moduleObject.exports

  return execute(${JSON.stringify(
    {
      jsenvCoreDirectoryUrl,
      projectDirectoryUrl,
      outDirectoryRelativeUrl,
      fileRelativeUrl,
      compileServerOrigin,

      collectNamespace,
      collectCoverage,
      executionId,
      remap,
    },
    null,
    "    ",
  )})
})()`

const evalSource = (code, href) => {
  const script = new Script(code, { filename: href })
  return script.runInThisContext()
}
