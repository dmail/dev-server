import { basename } from "path"
import { assert } from "@dmail/assert"
import { generateCommonJsBundle } from "../../../index.js"
import { resolveDirectoryUrl, fileUrlToRelativePath } from "src/private/urlUtils.js"
import { jsenvCoreDirectoryUrl } from "src/private/jsenvCoreDirectoryUrl.js"
import { requireCommonJsBundle } from "../require-commonjs-bundle.js"
import {
  GENERATE_COMMONJS_BUNDLE_TEST_PARAMS,
  REQUIRE_COMMONJS_BUNDLE_TEST_PARAMS,
} from "../TEST_PARAMS.js"

const testDirectoryUrl = resolveDirectoryUrl("./", import.meta.url)
const testDirectoryRelativePath = fileUrlToRelativePath(testDirectoryUrl, jsenvCoreDirectoryUrl)
const testDirectoryBasename = basename(testDirectoryRelativePath)
const bundleDirectoryRelativePath = `${testDirectoryRelativePath}dist/commonjs`
const mainFileBasename = `${testDirectoryBasename}.js`

await generateCommonJsBundle({
  ...GENERATE_COMMONJS_BUNDLE_TEST_PARAMS,
  bundleDirectoryRelativePath,
  entryPointMap: {
    main: `${testDirectoryRelativePath}${mainFileBasename}`,
  },
})

const {
  namespace: { ask },
} = await requireCommonJsBundle({
  ...REQUIRE_COMMONJS_BUNDLE_TEST_PARAMS,
  bundleDirectoryRelativePath,
})
const actual = await ask()
const expected = 42
assert({ actual, expected })
