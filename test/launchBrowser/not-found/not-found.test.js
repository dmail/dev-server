import { basename } from "path"
import { assert } from "@jsenv/assert"
import { resolveUrl, resolveDirectoryUrl, urlToRelativeUrl } from "@jsenv/util"
import { jsenvCoreDirectoryUrl } from "../../../src/internal/jsenvCoreDirectoryUrl.js"
import { startCompileServer } from "../../../src/internal/compiling/startCompileServer.js"
import { launchAndExecute } from "../../../src/internal/executing/launchAndExecute.js"
import { launchChromium, launchFirefox, launchWebkit } from "../../../index.js"
import { launchBrowsers } from "../launchBrowsers.js"
import {
  START_COMPILE_SERVER_TEST_PARAMS,
  EXECUTION_TEST_PARAMS,
  LAUNCH_TEST_PARAMS,
} from "../TEST_PARAMS.js"

const testDirectoryUrl = resolveDirectoryUrl("./", import.meta.url)
const testDirectoryRelativeUrl = urlToRelativeUrl(testDirectoryUrl, jsenvCoreDirectoryUrl)
const testDirectoryname = basename(testDirectoryRelativeUrl)
const jsenvDirectoryRelativeUrl = `${testDirectoryRelativeUrl}.jsenv`
const htmlFilename = `${testDirectoryname}.html`
const htmlFileRelativeUrl = `${testDirectoryRelativeUrl}${htmlFilename}`
const importerFileRelativeUrl = `${testDirectoryRelativeUrl}${testDirectoryname}.js`
const compileId = "otherwise"
const { origin: compileServerOrigin, outDirectoryRelativeUrl } = await startCompileServer({
  ...START_COMPILE_SERVER_TEST_PARAMS,
  jsenvDirectoryRelativeUrl,
  compileGroupCount: 1, // force otherwise compileId
})
const importedFileRelativeUrl = `${testDirectoryRelativeUrl}foo.js`
const importedFileUrl = resolveUrl(
  `${outDirectoryRelativeUrl}${compileId}/${importedFileRelativeUrl}`,
  jsenvCoreDirectoryUrl,
)

await launchBrowsers([launchChromium, launchFirefox, launchWebkit], async (launchBrowser) => {
  const result = await launchAndExecute({
    ...EXECUTION_TEST_PARAMS,
    executionLogLevel: "off",
    fileRelativeUrl: htmlFileRelativeUrl,
    launch: (options) =>
      launchBrowser({
        ...LAUNCH_TEST_PARAMS,
        ...options,
        outDirectoryRelativeUrl,
        compileServerOrigin,
      }),
  })
  const actual = {
    status: result.status,
    errorMessage: result.error.message,
  }
  const expected = {
    status: "errored",
    errorMessage: `Module file cannot be found.
--- import declared in ---
${importerFileRelativeUrl}
--- file ---
${importedFileRelativeUrl}
--- file url ---
${importedFileUrl}`,
  }
  assert({ actual, expected })
})
