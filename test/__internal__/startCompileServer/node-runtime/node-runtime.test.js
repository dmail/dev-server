import { assert } from "@jsenv/assert"
import { resolveUrl, urlToRelativeUrl, urlToFileSystemPath } from "@jsenv/util"
import { fetchUrl } from "@jsenv/server"
import { require } from "@jsenv/core/src/internal/require.js"
import { COMPILE_ID_BUILD_COMMONJS } from "@jsenv/core/src/internal/CONSTANTS.js"
import { jsenvCoreDirectoryUrl } from "@jsenv/core/src/internal/jsenvCoreDirectoryUrl.js"
import { startCompileServer } from "@jsenv/core/src/internal/compiling/startCompileServer.js"
import { COMPILE_SERVER_TEST_PARAMS } from "../TEST_PARAMS_COMPILE_SERVER.js"

const testDirectoryUrl = resolveUrl("./", import.meta.url)
const testDirectoryRelativeUrl = urlToRelativeUrl(testDirectoryUrl, jsenvCoreDirectoryUrl)
const jsenvDirectoryRelativeUrl = `${testDirectoryRelativeUrl}.jsenv/`

;(async () => {
  const { origin: compileServerOrigin, outDirectoryRelativeUrl } = await startCompileServer({
    ...COMPILE_SERVER_TEST_PARAMS,
    compileServerLogLevel: "warn",
    jsenvDirectoryRelativeUrl,
  })
  const compiledFileRelativeUrl = `${outDirectoryRelativeUrl}${COMPILE_ID_BUILD_COMMONJS}/src/nodeRuntime.js`
  const fileServerUrl = `${compileServerOrigin}/${compiledFileRelativeUrl}`
  const { url, status, statusText, headers } = await fetchUrl(fileServerUrl, {
    ignoreHttpsError: true,
  })
  {
    const actual = {
      url,
      status,
      statusText,
      contentType: headers.get("content-type"),
    }
    const expected = {
      url,
      status: 200,
      statusText: "OK",
      contentType: "application/javascript",
    }
    assert({ actual, expected })
  }
  {
    const compiledFileUrl = resolveUrl(
      `./.jsenv/out/${COMPILE_ID_BUILD_COMMONJS}/src/nodeRuntime.js`,
      testDirectoryUrl,
    )

    // note the require below would fail on node 13+
    // (but we would not build a node runtime file in that case)
    // eslint-disable-next-line import/no-dynamic-require
    const { nodeRuntime } = require(urlToFileSystemPath(compiledFileUrl))
    const actual = typeof nodeRuntime.create
    const expected = "function"
    assert({ actual, expected })
  }
})()
