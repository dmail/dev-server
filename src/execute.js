import { Abort, raceProcessTeardownEvents } from "@jsenv/abort"

import { normalizeRuntimeSupport } from "@jsenv/core/src/internal/runtime_support/runtime_support.js"
import {
  assertProjectDirectoryUrl,
  assertProjectDirectoryExists,
} from "./internal/argUtils.js"
import { startCompileServer } from "./internal/compile_server/compile_server.js"
import { launchAndExecute } from "./internal/executing/launch_and_execute.js"

export const execute = async ({
  signal = new AbortController().signal,
  handleSIGINT = true,

  logLevel = "warn",
  compileServerLogLevel = logLevel,
  launchAndExecuteLogLevel = logLevel,

  projectDirectoryUrl,
  jsenvDirectoryRelativeUrl,
  jsenvDirectoryClean,

  importDefaultExtension,

  fileRelativeUrl,
  runtime,
  runtimeParams,

  allocatedMs,
  mirrorConsole = true,
  captureConsole,
  inheritCoverage,
  collectCoverage,
  measurePerformance,
  collectPerformance,
  collectCompileServerInfo = false,
  stopAfterExecute = false,
  stopAfterExecuteReason,
  gracefulStopAllocatedMs,
  ignoreError = false,

  protocol,
  privateKey,
  certificate,
  ip,
  port,
  babelPluginMap,
  customCompilers,
  preservedUrls,
  workers,
  serviceWorkers,
  importMapInWebWorkers,
  compileServerCanReadFromFilesystem,
  compileServerCanWriteOnFilesystem,

  runtimeConsoleCallback,
  runtimeStartedCallback,
  runtimeStoppedCallback,
  runtimeErrorAfterExecutionCallback,
  runtimeDisconnectCallback,
}) => {
  projectDirectoryUrl = assertProjectDirectoryUrl({ projectDirectoryUrl })
  await assertProjectDirectoryExists({ projectDirectoryUrl })
  if (typeof fileRelativeUrl !== "string") {
    throw new TypeError(
      `fileRelativeUrl must be a string, got ${fileRelativeUrl}`,
    )
  }
  fileRelativeUrl = fileRelativeUrl.replace(/\\/g, "/")
  if (typeof runtime !== "object") {
    throw new TypeError(`runtime must be an object, got ${runtime}`)
  }
  if (typeof runtime.launch !== "function") {
    throw new TypeError(
      `runtime.launch must be a function, got ${runtime.launch}`,
    )
  }
  const executeOperation = Abort.startOperation()
  executeOperation.addAbortSignal(signal)
  if (handleSIGINT) {
    executeOperation.addAbortSource((abort) => {
      return raceProcessTeardownEvents(
        {
          SIGINT: true,
        },
        abort,
      )
    })
  }
  try {
    const compileServer = await startCompileServer({
      signal: executeOperation.signal,
      logLevel: compileServerLogLevel,

      projectDirectoryUrl,
      jsenvDirectoryRelativeUrl,
      jsenvDirectoryClean,

      importDefaultExtension,

      protocol,
      privateKey,
      certificate,
      ip,
      port,
      babelPluginMap,
      runtimeSupport: normalizeRuntimeSupport({
        [runtime.name]: runtime.version,
      }),
      customCompilers,
      preservedUrls,
      workers,
      serviceWorkers,
      importMapInWebWorkers,
      compileServerCanReadFromFilesystem,
      compileServerCanWriteOnFilesystem,
    })
    executeOperation.addEndCallback(async () => {
      await compileServer.stop("execution done")
    })

    const result = await launchAndExecute({
      signal: executeOperation.signal,
      launchAndExecuteLogLevel,

      runtime,
      runtimeParams: {
        projectDirectoryUrl,
        compileServerOrigin: compileServer.origin,
        compileServerId: compileServer.id,
        jsenvDirectoryRelativeUrl: compileServer.jsenvDirectoryRelativeUrl,
        ...runtimeParams,
      },
      executeParams: {
        fileRelativeUrl,
      },

      allocatedMs,
      mirrorConsole,
      captureConsole,
      inheritCoverage,
      collectCoverage,
      measurePerformance,
      collectPerformance,

      stopAfterExecute,
      stopAfterExecuteReason,
      gracefulStopAllocatedMs,

      runtimeConsoleCallback,
      runtimeStartedCallback,
      runtimeStoppedCallback,
      runtimeErrorAfterExecutionCallback,
      runtimeDisconnectCallback,
    })

    if (collectCompileServerInfo) {
      result.compileServerOrigin = compileServer.origin
      result.jsenvDirectoryRelativeUrl = compileServer.jsenvDirectoryRelativeUrl
    }

    if (result.status === "errored") {
      if (ignoreError) {
        return result
      }
      /*
    Warning: when node launched with --unhandled-rejections=strict, despites
    this promise being rejected by throw result.error node will compltely ignore it.

    The error can be logged by doing
    ```js
    process.setUncaughtExceptionCaptureCallback((error) => {
      console.error(error.stack)
    })
    ```
    But it feels like a hack.
    */
      throw result.error
    }
    return result
  } finally {
    await executeOperation.end()
  }
}
