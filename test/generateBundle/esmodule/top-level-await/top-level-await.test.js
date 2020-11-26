import { SourceMap } from "module"
import { basename } from "path"
import { assert } from "@jsenv/assert"
import { resolveUrl, urlToRelativeUrl } from "@jsenv/util"
import { jsenvCoreDirectoryUrl } from "@jsenv/core/src/internal/jsenvCoreDirectoryUrl.js"
import { generateBundle } from "@jsenv/core/index.js"
import {
  GENERATE_ESMODULE_BUNDLE_TEST_PARAMS,
  BROWSER_IMPORT_BUNDLE_TEST_PARAMS,
  NODE_IMPORT_BUNDLE_TEST_PARAMS,
} from "../TEST_PARAMS.js"
import { browserImportBundle } from "../browserImportBundle.js"
import { nodeImportBundle } from "../nodeImportBundle.js"

const testDirectoryUrl = resolveUrl("./", import.meta.url)
const testDirectoryRelativeUrl = urlToRelativeUrl(testDirectoryUrl, jsenvCoreDirectoryUrl)
const testDirectoryname = basename(testDirectoryRelativeUrl)
const jsenvDirectoryRelativeUrl = `${testDirectoryRelativeUrl}.jsenv/`
const buildDirectoryRelativeUrl = `${testDirectoryRelativeUrl}dist/esmodule/`
const mainFilename = `${testDirectoryname}.js`

await generateBundle({
  ...GENERATE_ESMODULE_BUNDLE_TEST_PARAMS,
  jsenvDirectoryRelativeUrl,
  buildDirectoryRelativeUrl,
  entryPointMap: {
    [`./${testDirectoryRelativeUrl}${mainFilename}`]: "./main.js",
  },
})
// top level await not supported in pupeteer for now
try {
  await browserImportBundle({
    ...BROWSER_IMPORT_BUNDLE_TEST_PARAMS,
    buildDirectoryRelativeUrl,
  })
  throw new Error("should throw")
} catch (actual) {
  const expected = new Error(
    "page.evaluate: Evaluation failed: SyntaxError: Unexpected reserved word",
  )
  assert({ actual, expected })
}
// top level await not supported in node 13.8 for now (SourceMap test because added in 13.7)
if (SourceMap) {
  try {
    await nodeImportBundle({
      ...NODE_IMPORT_BUNDLE_TEST_PARAMS,
      buildDirectoryRelativeUrl,
    })
    throw new Error("should throw")
  } catch (error) {
    const actual = {
      name: error.name,
      message: error.message,
    }
    const expected = {
      name: "SyntaxError",
      message: "Unexpected reserved word",
    }
    assert({ actual, expected })
  }
}
