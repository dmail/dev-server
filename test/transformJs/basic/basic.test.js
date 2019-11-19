import { readFileSync } from "fs"
import { basename } from "path"
import { assert } from "@jsenv/assert"
import { urlToRelativeUrl, resolveDirectoryUrl, fileUrlToPath } from "internal/urlUtils.js"
import { jsenvCoreDirectoryUrl } from "internal/jsenvCoreDirectoryUrl.js"
import { transformJs } from "internal/compiling/js-compilation-service/transformJs.js"
import { transformResultToCompilationResult } from "internal/compiling/js-compilation-service/transformResultToCompilationResult.js"
import { TRANSFORM_JS_TEST_PARAMS, TRANSFORM_RESULT_TEST_PARAMS } from "../TEST_PARAMS.js"

const testDirectoryUrl = resolveDirectoryUrl("./", import.meta.url)
const testDirectoryRelativePath = urlToRelativeUrl(testDirectoryUrl, jsenvCoreDirectoryUrl)
const testDirectoryBasename = basename(testDirectoryUrl)
const fileBasename = `${testDirectoryBasename}.js`
const originalFileUrl = import.meta.resolve(`./${fileBasename}`)
const compiledFileUrl = `${jsenvCoreDirectoryUrl}${testDirectoryRelativePath}.dist/${fileBasename}`
const sourcemapFileUrl = `${compiledFileUrl}.map`
const filePath = fileUrlToPath(originalFileUrl)
const originalFileContent = readFileSync(filePath).toString()

const transformResult = await transformJs({
  ...TRANSFORM_JS_TEST_PARAMS,
  code: originalFileContent,
  url: originalFileUrl,
})
const actual = transformResultToCompilationResult(transformResult, {
  ...TRANSFORM_RESULT_TEST_PARAMS,
  originalFileContent,
  originalFileUrl,
  compiledFileUrl,
  sourcemapFileUrl,
})
const expected = {
  compiledSource: actual.compiledSource,
  contentType: "application/javascript",
  sources: [`../${fileBasename}`],
  sourcesContent: [originalFileContent],
  assets: [`../${fileBasename}.map`],
  assetsContent: [actual.assetsContent[0]],
}
assert({ actual, expected })

{
  const actual = JSON.parse(actual.assetsContent[0])
  const expected = {
    version: 3,
    sources: [`../${fileBasename}`],
    names: actual.names,
    mappings: actual.mappings,
  }
  assert({ actual, expected })
}
