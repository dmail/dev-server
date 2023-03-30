/*
 * Export a function capable to execute a file on a runtime (browser or node) and return how it goes.
 *
 * - can be useful to execute a file in a browser/node.js programmatically
 * - not documented
 * - the most importants parts:
 *   - fileRelativeUrl: the file to execute inside rootDirectoryUrl
 *   - runtime: an object with a "run" method.
 *   The run method will start a browser/node process and execute file in it
 * - Most of the logic lives in "./run.js" used by executeTestPlan to run tests
 */

import { Abort, raceProcessTeardownEvents } from "@jsenv/abort"
import { assertAndNormalizeDirectoryUrl } from "@jsenv/filesystem"
import { createLogger } from "@jsenv/log"

import { pingServer } from "../ping_server.js"
import { basicFetch } from "../basic_fetch.js"
import { run } from "./run.js"

export const execute = async ({
  signal = new AbortController().signal,
  handleSIGINT = true,
  logLevel,
  rootDirectoryUrl,
  serverOrigin,
  serverRootDirectoryUrl = rootDirectoryUrl,

  fileRelativeUrl,
  allocatedMs,
  mirrorConsole = true,
  keepRunning = false,

  collectConsole,
  collectCoverage,
  coverageTempDirectoryUrl,
  collectPerformance = false,
  runtime,
  runtimeParams,

  ignoreError = false,
}) => {
  const logger = createLogger({ logLevel })
  rootDirectoryUrl = assertAndNormalizeDirectoryUrl(
    rootDirectoryUrl,
    "rootDirectoryUrl",
  )
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

  let serverIsJsenvDevServer = false
  if (runtime.type === "browser") {
    if (!serverOrigin) {
      throw new TypeError(
        `serverOrigin is required to execute file on a browser`,
      )
    }
    const serverStarted = await pingServer(serverOrigin)
    if (!serverStarted) {
      throw new Error(
        `no server listening at ${serverOrigin}. It is required to execute file`,
      )
    }
    const { status } = await basicFetch(`${serverOrigin}/__params__.json`, {
      rejectUnauthorized: false,
    })
    if (status === 200) {
      serverIsJsenvDevServer = true
    }
  }

  let resultTransformer = (result) => result
  runtimeParams = {
    rootDirectoryUrl,
    serverRootDirectoryUrl,
    serverOrigin,
    serverIsJsenvDevServer,
    fileRelativeUrl,
    ...runtimeParams,
  }

  let result = await run({
    signal: executeOperation.signal,
    logger,
    allocatedMs,
    keepRunning,
    mirrorConsole,
    collectConsole,
    collectCoverage,
    coverageTempDirectoryUrl,
    collectPerformance,
    runtime,
    runtimeParams,
  })
  result = resultTransformer(result)

  try {
    if (result.status === "failed") {
      if (ignoreError) {
        return result
      }
      /*
  Warning: when node launched with --unhandled-rejections=strict, despites
  this promise being rejected by throw result.error node will completely ignore it.

  The error can be logged by doing
  ```js
  process.setUncaughtExceptionCaptureCallback((error) => {
    console.error(error.stack)
  })
  ```
  But it feels like a hack.
  */
      throw result.errors[result.errors.length - 1]
    }
    return result
  } finally {
    await executeOperation.end()
  }
}
