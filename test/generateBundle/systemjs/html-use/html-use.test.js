import { basename } from "path"
import { resolveDirectoryUrl, urlToRelativeUrl } from "@jsenv/util"
import { generateBundle } from "@jsenv/core/index.js"
import { jsenvCoreDirectoryUrl } from "@jsenv/core/src/internal/jsenvCoreDirectoryUrl.js"
import { GENERATE_SYSTEMJS_BUNDLE_TEST_PARAMS } from "../TEST_PARAMS.js"

const testDirectoryUrl = resolveDirectoryUrl("./", import.meta.url)
const testDirectoryRelativeUrl = urlToRelativeUrl(testDirectoryUrl, jsenvCoreDirectoryUrl)
const testDirectoryname = basename(testDirectoryRelativeUrl)
const jsenvDirectoryRelativeUrl = `${testDirectoryRelativeUrl}.jsenv/`
const bundleDirectoryRelativeUrl = `${testDirectoryRelativeUrl}dist/systemjs/`
const mainFilename = `${testDirectoryname}.html`
const entryPointMap = {
  [`./${testDirectoryRelativeUrl}${mainFilename}`]: "./main.html",
}

await generateBundle({
  ...GENERATE_SYSTEMJS_BUNDLE_TEST_PARAMS,
  // logLevel: "info",
  jsenvDirectoryRelativeUrl,
  bundleDirectoryRelativeUrl,
  entryPointMap,
  minify: true,
})

// const { namespace: actual } = await browserImportSystemJsBundle({
//   ...IMPORT_SYSTEM_JS_BUNDLE_TEST_PARAMS,
//   testDirectoryRelativeUrl,
// })
// const expected = {
//   htmlText: `<button>Hello world</button>`,
//   innerText: "Hello world",
// }
// assert({ actual, expected })
