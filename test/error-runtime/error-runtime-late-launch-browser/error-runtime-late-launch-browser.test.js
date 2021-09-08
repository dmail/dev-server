import { createCancellationSource } from "@jsenv/cancellation"
import { assert } from "@jsenv/assert"
import { resolveDirectoryUrl, urlToRelativeUrl, urlToBasename } from "@jsenv/filesystem"

import { launchChromium } from "@jsenv/core"
import { jsenvCoreDirectoryUrl } from "@jsenv/core/src/internal/jsenvCoreDirectoryUrl.js"
import { startCompileServer } from "@jsenv/core/src/internal/compiling/startCompileServer.js"
import { launchAndExecute } from "@jsenv/core/src/internal/executing/launchAndExecute.js"
import {
  START_COMPILE_SERVER_TEST_PARAMS,
  EXECUTION_TEST_PARAMS,
  LAUNCH_TEST_PARAMS,
} from "@jsenv/core/test/TEST_PARAMS_LAUNCH_BROWSER.js"

const testDirectoryUrl = resolveDirectoryUrl("./", import.meta.url)
const testDirectoryRelativePath = urlToRelativeUrl(testDirectoryUrl, jsenvCoreDirectoryUrl)
const testDirectoryBasename = urlToBasename(testDirectoryRelativePath)
const jsenvDirectoryRelativeUrl = `${testDirectoryRelativePath}.jsenv/`
const filename = `${testDirectoryBasename}.html`
const fileRelativeUrl = `${testDirectoryRelativePath}${filename}`
const { origin: compileServerOrigin, outDirectoryRelativeUrl } = await startCompileServer({
  ...START_COMPILE_SERVER_TEST_PARAMS,
  jsenvDirectoryRelativeUrl,
})
const { cancel, token: cancellationToken } = createCancellationSource()

let errorCallbackArg
const actual = await launchAndExecute({
  ...EXECUTION_TEST_PARAMS,
  launchAndExecuteLogLevel: "off",
  cancellationToken,
  launch: (options) =>
    launchChromium({
      ...LAUNCH_TEST_PARAMS,
      ...options,
      outDirectoryRelativeUrl,
      compileServerOrigin,
    }),
  executeParams: {
    fileRelativeUrl,
  },
  stopAfterExecute: false,
  runtimeErrorCallback: (argValue) => {
    errorCallbackArg = argValue
    cancel("error") // kill chromium browser to let process end
  },
})

const expected = {
  status: "completed",
  namespace: {
    [`./${testDirectoryBasename}.js`]: {
      status: "completed",
      namespace: {},
    },
  },
}
assert({ actual, expected })

process.on("beforeExit", () => {
  const actual = {
    errorMessage: errorCallbackArg.error.message,
    timing: errorCallbackArg.timing,
  }
  const expected = {
    errorMessage: actual.errorMessage,
    timing: "after-execution",
  }
  assert({ actual, expected })
})
