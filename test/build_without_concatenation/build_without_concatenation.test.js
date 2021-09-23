// see also https://github.com/rollup/rollup/issues/3882

import { assert } from "@jsenv/assert"
import { resolveUrl, urlToRelativeUrl, urlToBasename } from "@jsenv/filesystem"

import { buildProject } from "@jsenv/core"
import { jsenvCoreDirectoryUrl } from "@jsenv/core/src/internal/jsenvCoreDirectoryUrl.js"
import {
  GENERATE_ESMODULE_BUILD_TEST_PARAMS,
  BROWSER_IMPORT_BUILD_TEST_PARAMS,
} from "@jsenv/core/test/TEST_PARAMS_BUILD_ESMODULE.js"
import { browserImportEsModuleBuild } from "@jsenv/core/test/browserImportEsModuleBuild.js"

const testDirectoryUrl = resolveUrl("./", import.meta.url)
const testDirectoryRelativeUrl = urlToRelativeUrl(
  testDirectoryUrl,
  jsenvCoreDirectoryUrl,
)
const testDirectoryname = urlToBasename(testDirectoryRelativeUrl)
const jsenvDirectoryRelativeUrl = `${testDirectoryRelativeUrl}.jsenv/`
const buildDirectoryRelativeUrl = `${testDirectoryRelativeUrl}dist/esmodule/`
const { buildMappings } = await buildProject({
  ...GENERATE_ESMODULE_BUILD_TEST_PARAMS,
  jsenvDirectoryRelativeUrl,
  buildDirectoryRelativeUrl,
  entryPointMap: {
    [`./${testDirectoryRelativeUrl}${testDirectoryname}.html`]: "./main.html",
  },
  jsConcatenation: false,
  // logLevel: "debug",
})

{
  const actual = buildMappings
  const expected = {
    [`${testDirectoryRelativeUrl}${testDirectoryname}.html`]: "main.html",
    [`${testDirectoryRelativeUrl}file.js`]: "file-d4d10f0c.js",
    [`${testDirectoryRelativeUrl}main.js`]: "main-a10d6b06.js",
  }
  assert({ actual, expected })
}

{
  const mainJsFileRelativeUrl =
    buildMappings[`${testDirectoryRelativeUrl}main.js`]
  const { namespace } = await browserImportEsModuleBuild({
    ...BROWSER_IMPORT_BUILD_TEST_PARAMS,
    testDirectoryRelativeUrl,
    htmlFileRelativeUrl: "./dist/esmodule/main.html",
    jsFileRelativeUrl: `./${mainJsFileRelativeUrl}`,
    // debug: true,
  })

  const actual = namespace
  const expected = { default: 42 }
  assert({ actual, expected })
}
