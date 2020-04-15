import { basename } from "path"
import { assert } from "@jsenv/assert"
import { resolveUrl, urlToRelativeUrl, urlToFileSystemPath } from "@jsenv/util"
import { jsenvCoreDirectoryUrl } from "../../../src/internal/jsenvCoreDirectoryUrl.js"
import { startCompileServer } from "../../../src/internal/compiling/startCompileServer.js"
import { launchAndExecute } from "../../../src/internal/executing/launchAndExecute.js"
import { launchNode } from "../../../index.js"
import {
  START_COMPILE_SERVER_TEST_PARAMS,
  EXECUTE_TEST_PARAMS,
  LAUNCH_TEST_PARAMS,
} from "../TEST_PARAMS.js"

const testDirectoryUrl = resolveUrl("./", import.meta.url)
const testDirectoryRelativeUrl = urlToRelativeUrl(testDirectoryUrl, jsenvCoreDirectoryUrl)
const testDirectoryname = basename(testDirectoryRelativeUrl)
const jsenvDirectoryRelativeUrl = `${testDirectoryRelativeUrl}.jsenv/`
const filename = `${testDirectoryname}.js`
const fileRelativeUrl = `${testDirectoryRelativeUrl}${filename}`
const fileUrl = resolveUrl(fileRelativeUrl, jsenvCoreDirectoryUrl)
const filePath = urlToFileSystemPath(fileUrl)
const compileId = "best"
const { origin: compileServerOrigin, outDirectoryRelativeUrl } = await startCompileServer({
  ...START_COMPILE_SERVER_TEST_PARAMS,
  jsenvDirectoryRelativeUrl,
})
const compiledFileUrl = `${jsenvCoreDirectoryUrl}${outDirectoryRelativeUrl}${compileId}/${fileRelativeUrl}`

const actual = await launchAndExecute({
  ...EXECUTE_TEST_PARAMS,
  executionLogLevel: "off",
  fileRelativeUrl,
  launch: (options) =>
    launchNode({
      ...LAUNCH_TEST_PARAMS,
      ...options,
      outDirectoryRelativeUrl,
      compileServerOrigin,
    }),
})
const expectedError = new Error(`Module file cannot be parsed.
--- parsing error message ---
${filePath}: Unexpected token (1:14)

> 1 | const node = (
    |               ^
--- file ---
${fileRelativeUrl}
--- file url ---
${compiledFileUrl}`)
expectedError.parsingError = {
  message: `${filePath}: Unexpected token (1:14)

> 1 | const node = (
    |               ^`,
  messageHTML: `${filePath}: Unexpected token (1:14)

> 1 | const node = (
    |               ^`,
  filename: filePath,
  lineNumber: 1,
  columnNumber: 14,
}
const expected = {
  status: "errored",
  error: expectedError,
}
assert({ actual, expected })
