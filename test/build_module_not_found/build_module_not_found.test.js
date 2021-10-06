import { assert } from "@jsenv/assert"
import {
  resolveDirectoryUrl,
  urlToRelativeUrl,
  resolveUrl,
  urlToFileSystemPath,
} from "@jsenv/filesystem"

import { buildProject } from "@jsenv/core"
import { jsenvCoreDirectoryUrl } from "@jsenv/core/src/internal/jsenvCoreDirectoryUrl.js"
import { GENERATE_ESMODULE_BUILD_TEST_PARAMS } from "@jsenv/core/test/TEST_PARAMS_BUILD_ESMODULE.js"

const testDirectoryUrl = resolveDirectoryUrl("./", import.meta.url)
const testDirectoryRelativeUrl = urlToRelativeUrl(
  testDirectoryUrl,
  jsenvCoreDirectoryUrl,
)
const jsenvDirectoryRelativeUrl = `${testDirectoryRelativeUrl}.jsenv/`
const buildDirectoryRelativeUrl = `${testDirectoryRelativeUrl}dist/systemjs/`
const mainFilename = `build_module_not_found.html`
const entryPointMap = {
  [`./${testDirectoryRelativeUrl}${mainFilename}`]: "./main.html",
}
const jsFileUrl = resolveUrl("./404.js", testDirectoryUrl)
const htmlFileUrl = resolveUrl(`./${mainFilename}`, testDirectoryUrl)

try {
  await buildProject({
    ...GENERATE_ESMODULE_BUILD_TEST_PARAMS,
    // logLevel: "debug",
    jsenvDirectoryRelativeUrl,
    buildDirectoryRelativeUrl,
    entryPointMap,
  })
  throw new Error("should throw")
} catch (e) {
  const actual = e.message
  const expected = `404 on js url
--- js url ---
${jsFileUrl}
--- import trace ---
${urlToFileSystemPath(htmlFileUrl)}`
  assert({ actual, expected })
}
