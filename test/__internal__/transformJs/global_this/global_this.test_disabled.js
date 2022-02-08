import { assert } from "@jsenv/assert"
import { urlToRelativeUrl, resolveUrl, readFile } from "@jsenv/filesystem"

import { jsenvCoreDirectoryUrl } from "@jsenv/core/src/jsenv_file_urls.js"
import { asCompilationResult } from "@jsenv/core/src/internal/compile_server/jsenv_directory/compilation_result.js"
import { transformWithBabel } from "@jsenv/core/src/internal/transform_js/transform_with_babel.js"
import {
  TRANSFORM_JS_TEST_PARAMS,
  TRANSFORM_RESULT_TEST_PARAMS,
} from "../TEST_PARAMS_TRANSFORM_JS.js"

const testDirectoryUrl = resolveUrl("./", import.meta.url)
const testDirectoryRelativeUrl = urlToRelativeUrl(
  testDirectoryUrl,
  jsenvCoreDirectoryUrl,
)
const filename = `global_this.js`
const sourceFileUrl = resolveUrl(`./${filename}`, testDirectoryUrl)
const compiledFileUrl = `${jsenvCoreDirectoryUrl}${testDirectoryRelativeUrl}.jsenv/out/${filename}`
const sourcemapFileUrl = `${compiledFileUrl}.map`
const originalFileContent = await readFile(sourceFileUrl)

const transformResult = await transformWithBabel({
  ...TRANSFORM_JS_TEST_PARAMS,
  url: sourceFileUrl,
  content: originalFileContent,
})
const actual = await asCompilationResult(
  {
    contentType: "application/javascript",
    ...transformResult,
  },
  {
    ...TRANSFORM_RESULT_TEST_PARAMS,
    originalFileContent,
    sourceFileUrl,
    compiledFileUrl,
    sourcemapFileUrl,
  },
)
const expected = {
  contentType: "application/javascript",
  content: actual.content,
  sourcemap: assert.any(Object),
  sources: [sourceFileUrl],
  sourcesContent: [originalFileContent],
  assets: [sourcemapFileUrl],
  assetsContent: [actual.assetsContent[0]],
}
assert({ actual, expected })
