import { basename } from "path"
import { assert } from "@jsenv/assert"
import { resolveDirectoryUrl, urlToRelativeUrl } from "@jsenv/util"
import { jsenvCoreDirectoryUrl } from "@jsenv/core/src/internal/jsenvCoreDirectoryUrl.js"
import { startCompileServer } from "@jsenv/core/src/internal/compiling/startCompileServer.js"
import { launchAndExecute } from "@jsenv/core/src/internal/executing/launchAndExecute.js"
import { launchNode } from "@jsenv/core"
import {
  START_COMPILE_SERVER_TEST_PARAMS,
  EXECUTE_TEST_PARAMS,
  LAUNCH_TEST_PARAMS,
} from "../TEST_PARAMS.js"

const testDirectoryUrl = resolveDirectoryUrl("./", import.meta.url)
const testDirectoryRelativeUrl = urlToRelativeUrl(testDirectoryUrl, jsenvCoreDirectoryUrl)
const testDirectoryname = basename(testDirectoryRelativeUrl)
const jsenvDirectoryRelativeUrl = `${testDirectoryRelativeUrl}.jsenv/`
const filename = `${testDirectoryname}.js`
const fileRelativeUrl = `${testDirectoryRelativeUrl}${filename}`
const { origin: compileServerOrigin, outDirectoryRelativeUrl } = await startCompileServer({
  ...START_COMPILE_SERVER_TEST_PARAMS,
  jsenvDirectoryRelativeUrl,
})

let errorCallbackArgValue
const actual = await launchAndExecute({
  ...EXECUTE_TEST_PARAMS,
  fileRelativeUrl,
  launch: (options) =>
    launchNode({
      ...LAUNCH_TEST_PARAMS,
      ...options,
      outDirectoryRelativeUrl,
      compileServerOrigin,
    }),
  runtimeErrorCallback: (value) => {
    errorCallbackArgValue = value
  },
})
const expected = {
  status: "completed",
  namespace: {},
}
assert({ actual, expected })

process.on("exit", () => {
  const actual = errorCallbackArgValue
  const expected = {
    error: new Error("child exited with 1"),
    timing: "after-execution",
  }
  assert({ actual, expected })
})
