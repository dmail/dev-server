import { basename } from "path"
import { assert } from "@jsenv/assert"
import { resolveDirectoryUrl, urlToRelativeUrl } from "internal/urlUtils.js"
import { jsenvCoreDirectoryUrl } from "internal/jsenvCoreDirectoryUrl.js"
import { generateGlobalBundle } from "../../../index.js"
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

await generateGlobalBundle({
  ...GENERATE_GLOBAL_BUNDLE_TEST_PARAMS,
  jsenvDirectoryRelativeUrl,
  bundleDirectoryRelativeUrl,
  importMapFileRelativeUrl: `${testDirectoryRelativeUrl}importMap.json`,
  entryPointMap: {
    main: `./${testDirectoryRelativeUrl}${mainFilename}`,
  },
})
const { globalValue: actual, serverOrigin } = await scriptLoadGlobalBundle({
  ...SCRIPT_LOAD_GLOBAL_BUNDLE_TEST_PARAMS,
  bundleDirectoryRelativeUrl,
})
const expected = {
  basic: `${serverOrigin}/file.js`,
  remapped: `${serverOrigin}/bar`,
}
assert({ actual, expected })
