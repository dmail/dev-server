// https://github.com/rollup/rollup/tree/dba6f13132a1d7dac507d5056399d8af0eed6375/test/function/samples/preserve-modules-circular-order

import { resolveUrl, urlToRelativeUrl } from "@jsenv/filesystem"
import { assert } from "@jsenv/assert"

import { buildProject } from "@jsenv/core"
import { jsenvCoreDirectoryUrl } from "@jsenv/core/src/internal/jsenvCoreDirectoryUrl.js"
import { GENERATE_ESMODULE_BUILD_TEST_PARAMS } from "@jsenv/core/test/TEST_PARAMS_BUILD_ESMODULE.js"

const testDirectoryUrl = resolveUrl("./", import.meta.url)
const testDirectoryRelativeUrl = urlToRelativeUrl(
  testDirectoryUrl,
  jsenvCoreDirectoryUrl,
)
const jsenvDirectoryRelativeUrl = `${testDirectoryRelativeUrl}.jsenv/`
const buildDirectoryRelativeUrl = `${testDirectoryRelativeUrl}dist/esmodule/`
await buildProject({
  ...GENERATE_ESMODULE_BUILD_TEST_PARAMS,
  logLevel: "error", // to disable CIRCULAR_DEPENDENCY warning
  jsenvDirectoryRelativeUrl,
  buildDirectoryRelativeUrl,
  entryPoints: {
    [`./${testDirectoryRelativeUrl}main.js`]: "main.js",
  },
})
// eslint-disable-next-line import/no-unresolved
const namespace = await import("./dist/esmodule/main.js")
const actual = { ...namespace }
const expected = {
  executionOrder: ["index", "tag", "data", "main: Tag: Tag data Tag data"],
}
assert({ actual, expected })
