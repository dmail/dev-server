import { assert } from "@jsenv/assert"
import {
  resolveUrl,
  urlToRelativeUrl,
  urlToFileSystemPath,
} from "@jsenv/filesystem"

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
const mainFilename = `import_not_found.js`
const fileRelativeUrl = `${testDirectoryRelativeUrl}${mainFilename}`
const entryPointMap = {
  [`./${fileRelativeUrl}`]: "./main.js",
}
const mainFileUrl = resolveUrl(mainFilename, import.meta.url)
const intermediateFileUrl = resolveUrl("./intermediate.js", import.meta.url)
const fooFileUrl = resolveUrl("foo.js", import.meta.url)

try {
  await buildProject({
    ...GENERATE_ESMODULE_BUILD_TEST_PARAMS,
    jsenvDirectoryRelativeUrl,
    buildDirectoryRelativeUrl,
    entryPointMap,
  })
  throw new Error("should throw")
} catch (e) {
  const actual = e.message
  const expected = `Invalid response status on url
--- reponse status ---
404
--- js url ---
${fooFileUrl}
--- url trace ---
${urlToFileSystemPath(intermediateFileUrl)}
  imported by ${urlToFileSystemPath(mainFileUrl)}
  imported by ${urlToFileSystemPath(jsenvCoreDirectoryUrl)}`
  assert({ actual, expected })
}
