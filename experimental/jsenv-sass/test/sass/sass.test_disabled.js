// disabled until npm link works again in github workflow

import { assert } from "@jsenv/assert"
import { resolveUrl, urlToRelativeUrl, urlToBasename } from "@jsenv/filesystem"
import { fetchUrl } from "@jsenv/server"

import { jsenvCoreDirectoryUrl } from "@jsenv/core/src/internal/jsenvCoreDirectoryUrl.js"
import { startCompileServer } from "@jsenv/core/src/internal/compiling/startCompileServer.js"
import { getCssSourceMappingUrl } from "@jsenv/core/src/internal/sourceMappingURLUtils.js"
import { compileScss } from "../../src/compileScss.js"
import { COMPILE_SERVER_TEST_PARAMS } from "@jsenv/core/test/__internal__/compile_server/TEST_PARAMS_COMPILE_SERVER.js"

const testDirectoryUrl = resolveUrl("./", import.meta.url)
const testDirectoryRelativeUrl = urlToRelativeUrl(
  testDirectoryUrl,
  jsenvCoreDirectoryUrl,
)
const testDirectoryname = urlToBasename(testDirectoryRelativeUrl.slice(0, -1))
const filename = `${testDirectoryname}.scss`
const fileRelativeUrl = `${testDirectoryRelativeUrl}${filename}`
const jsenvDirectoryRelativeUrl = `${testDirectoryRelativeUrl}.jsenv/`
// const fileUrl = resolveUrl(fileRelativeUrl, jsenvCoreDirectoryUrl)
const compiledFileRelativeUrl = `${jsenvDirectoryRelativeUrl}out/${fileRelativeUrl}`
// const compiledFileUrl = `${jsenvCoreDirectoryUrl}${compiledFileRelativeUrl}`

const fetchSourceAsText = async (urlRelativeToSourcemap, sourceMapUrl) => {
  const sourceUrl = resolveUrl(urlRelativeToSourcemap, sourceMapUrl)
  const response = await fetchUrl(sourceUrl)
  const text = await response.text()
  return text
}

{
  const { origin: compileServerOrigin } = await startCompileServer({
    ...COMPILE_SERVER_TEST_PARAMS,
    jsenvDirectoryRelativeUrl,
    customCompilers: {
      "**/*.scss": compileScss,
    },
  })
  const cssServerUrl = `${compileServerOrigin}/${compiledFileRelativeUrl}`
  const response = await fetchUrl(cssServerUrl, { ignoreHttpsError: true })
  {
    const actual = {
      status: response.status,
      contentType: response.headers.get("content-type"),
    }
    const expected = {
      status: 200,
      contentType: "text/css",
    }
    assert({ actual, expected })
  }
  const css = await response.text()
  // css is the concatenation of sass files
  {
    const actual = css.includes("background-color: yellow")
    const expected = true
    assert({ actual, expected })
  }
  // sourcemap points the sass files
  const cssMapRelativeUrl = getCssSourceMappingUrl(css)
  const cssMapUrl = resolveUrl(cssMapRelativeUrl, cssServerUrl)
  const cssMapResponse = await fetchUrl(cssMapUrl)
  const cssMap = await cssMapResponse.json()
  {
    const actual = {
      file: cssMap.file,
      sources: ["../../../../../dep.scss", "../../../../../sass.scss"],
    }
    const expected = actual
    assert({ actual, expected })
  }
  {
    const actual = cssMap.sourcesContent
    const expected = [
      await fetchSourceAsText(cssMap.sources[0], cssMapUrl),
      await fetchSourceAsText(cssMap.sources[1], cssMapUrl),
    ]
    assert({ actual, expected })
  }
}
