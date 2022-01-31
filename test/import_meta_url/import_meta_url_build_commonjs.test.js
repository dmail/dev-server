import { assert } from "@jsenv/assert"
import {
  resolveDirectoryUrl,
  resolveUrl,
  urlToRelativeUrl,
} from "@jsenv/filesystem"

import { buildProject } from "@jsenv/core"
import { jsenvCoreDirectoryUrl } from "@jsenv/core/src/jsenv_file_urls.js"
import {
  GENERATE_COMMONJS_BUILD_TEST_PARAMS,
  REQUIRE_COMMONJS_BUILD_TEST_PARAMS,
} from "@jsenv/core/test/TEST_PARAMS_BUILD_COMMONJS.js"
import { requireCommonJsBuild } from "@jsenv/core/test/requireCommonJsBuild.js"

const testDirectoryUrl = resolveDirectoryUrl("./", import.meta.url)
const testDirectoryRelativeUrl = urlToRelativeUrl(
  testDirectoryUrl,
  jsenvCoreDirectoryUrl,
)
const jsenvDirectoryRelativeUrl = `${testDirectoryRelativeUrl}.jsenv`
const buildDirectoryRelativeUrl = `${testDirectoryRelativeUrl}dist/commonjs`
const mainFileBasename = `import_meta_url.js`
await buildProject({
  ...GENERATE_COMMONJS_BUILD_TEST_PARAMS,
  jsenvDirectoryRelativeUrl,
  buildDirectoryRelativeUrl,
  entryPoints: {
    [`./${testDirectoryRelativeUrl}${mainFileBasename}`]: "main.cjs",
  },
})
const { namespace } = await requireCommonJsBuild({
  ...REQUIRE_COMMONJS_BUILD_TEST_PARAMS,
  buildDirectoryRelativeUrl,
})

const actual = namespace
const expected = {
  isInstanceOfUrl: false,
  urlString: resolveUrl(
    `${buildDirectoryRelativeUrl}/main.cjs`,
    jsenvCoreDirectoryUrl,
  ),
}
assert({ actual, expected })
