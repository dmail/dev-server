import { assert } from "@jsenv/assert"
import { resolveDirectoryUrl, resolveUrl, urlToRelativeUrl } from "src/internal/urlUtils.js"
import { startCompileServer, convertCommonJsWithBabel } from "../../../index.js"
import { COMPILE_SERVER_TEST_PARAMS } from "../TEST_PARAMS.js"
import { fetch } from "../fetch.js"

const compileDirectoryUrl = resolveDirectoryUrl("./.dist", import.meta.url)
const fileUrl = resolveUrl("./file.js", import.meta.url)
const fileRelativeUrl = urlToRelativeUrl(
  fileUrl,
  COMPILE_SERVER_TEST_PARAMS.projectDirectoryUrl,
)
const compileDirectoryRelativeUrl = urlToRelativeUrl(
  compileDirectoryUrl,
  COMPILE_SERVER_TEST_PARAMS.projectDirectoryUrl,
)
const compileServer = await startCompileServer({
  ...COMPILE_SERVER_TEST_PARAMS,
  compileDirectoryUrl,
  convertMap: {
    [fileRelativeUrl]: (options) =>
      convertCommonJsWithBabel({ ...options, processEnvNodeEnv: "production" }),
  },
})
const fileServerUrl = `${compileServer.origin}/${compileDirectoryRelativeUrl}best/${fileRelativeUrl}`

const fileResponse = await fetch(fileServerUrl)
const actual = {
  status: fileResponse.status,
  statusText: fileResponse.statusText,
  headers: fileResponse.headers,
}
const expected = {
  status: 200,
  statusText: "OK",
  headers: {
    ...actual.headers,
    "content-type": ["application/javascript"],
  },
}
assert({ actual, expected })
