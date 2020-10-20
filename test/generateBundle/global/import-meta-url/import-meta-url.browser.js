import { basename } from "path"
import { assert } from "@jsenv/assert"
import { resolveDirectoryUrl, urlToRelativeUrl } from "@jsenv/util"
import { jsenvCoreDirectoryUrl } from "@jsenv/core/src/internal/jsenvCoreDirectoryUrl.js"
import { generateBundle } from "@jsenv/core/index.js"
import { scriptLoadGlobalBundle } from "../scriptLoadGlobalBundle.js"
import {
  GENERATE_GLOBAL_BUNDLE_TEST_PARAMS,
  SCRIPT_LOAD_GLOBAL_BUNDLE_TEST_PARAMS,
} from "../TEST_PARAMS.js"

const testDirectoryUrl = resolveDirectoryUrl("./", import.meta.url)
const testDirectoryRelativeUrl = urlToRelativeUrl(testDirectoryUrl, jsenvCoreDirectoryUrl)
const testDirectoryname = basename(testDirectoryRelativeUrl)
const jsenvDirectoryRelativeUrl = `${testDirectoryRelativeUrl}.jsenv/`
const bundleDirectoryRelativeUrl = `${testDirectoryRelativeUrl}dist/commonjs/`
const mainFilename = `${testDirectoryname}.js`

await generateBundle({
  ...GENERATE_GLOBAL_BUNDLE_TEST_PARAMS,
  jsenvDirectoryRelativeUrl,
  bundleDirectoryRelativeUrl,
  importMapFileRelativeUrl: `${testDirectoryRelativeUrl}test.importmap`,
  entryPointMap: {
    [`./${testDirectoryRelativeUrl}${mainFilename}`]: "./main.js",
  },
})
const { globalValue: actual, serverOrigin } = await scriptLoadGlobalBundle({
  ...SCRIPT_LOAD_GLOBAL_BUNDLE_TEST_PARAMS,
  bundleDirectoryRelativeUrl,
})
const expected = `${serverOrigin}/main.js`
assert({ actual, expected })
