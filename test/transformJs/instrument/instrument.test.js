import { readFileSync } from "fs"
import { basename } from "path"
import { assert } from "@jsenv/assert"
import { urlToRelativeUrl, resolveDirectoryUrl, urlToFileSystemPath } from "@jsenv/util"
import { jsenvCoreDirectoryUrl } from "internal/jsenvCoreDirectoryUrl.js"
import { createInstrumentBabelPlugin } from "internal/executing/coverage/createInstrumentBabelPlugin.js"
import { transformJs } from "internal/compiling/js-compilation-service/transformJs.js"
import { transformResultToCompilationResult } from "internal/compiling/js-compilation-service/transformResultToCompilationResult.js"
import { TRANSFORM_JS_TEST_PARAMS, TRANSFORM_RESULT_TEST_PARAMS } from "../TEST_PARAMS.js"

const testDirectoryUrl = resolveDirectoryUrl("./", import.meta.url)
const testDirectoryRelativeUrl = urlToRelativeUrl(testDirectoryUrl, jsenvCoreDirectoryUrl)
const testDirectoryname = basename(testDirectoryUrl)
const filename = `${testDirectoryname}.js`
const originalFileUrl = import.meta.resolve(`./${filename}`)
const compiledFileUrl = `${jsenvCoreDirectoryUrl}${testDirectoryRelativeUrl}.jsenv/out/${filename}`
const sourcemapFileUrl = `${compiledFileUrl}.map`
const filePath = urlToFileSystemPath(originalFileUrl)
const originalFileContent = readFileSync(filePath).toString()

const transformResult = await transformJs({
  ...TRANSFORM_JS_TEST_PARAMS,
  code: originalFileContent,
  url: originalFileUrl,
  babelPluginMap: {
    ...TRANSFORM_RESULT_TEST_PARAMS.babelPluginMap,
    "transform-instrument": [createInstrumentBabelPlugin()],
  },
})
const actual = await transformResultToCompilationResult(transformResult, {
  ...TRANSFORM_RESULT_TEST_PARAMS,
  originalFileContent,
  originalFileUrl,
  compiledFileUrl,
  sourcemapFileUrl,
})
const expected = {
  compiledSource: actual.compiledSource,
  contentType: "application/javascript",
  sources: [`../../../${filename}`],
  sourcesContent: [originalFileContent],
  assets: [`../${filename}.map`, "coverage.json"],
  assetsContent: [actual.assetsContent[0], actual.assetsContent[1]],
}
assert({ actual, expected })
