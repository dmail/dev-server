import { assert } from "@jsenv/assert"
import {
  resolveDirectoryUrl,
  urlToRelativeUrl,
  urlToBasename,
} from "@jsenv/filesystem"

import { buildProject } from "@jsenv/core"
import { jsenvCoreDirectoryUrl } from "@jsenv/core/src/internal/jsenvCoreDirectoryUrl.js"
import {
  GENERATE_ESMODULE_BUILD_TEST_PARAMS,
  BROWSER_IMPORT_BUILD_TEST_PARAMS,
} from "@jsenv/core/test/TEST_PARAMS_BUILD_ESMODULE.js"
import { browserImportEsModuleBuild } from "@jsenv/core/test/browserImportEsModuleBuild.js"

const testDirectoryUrl = resolveDirectoryUrl("./", import.meta.url)
const testDirectoryRelativeUrl = urlToRelativeUrl(
  testDirectoryUrl,
  jsenvCoreDirectoryUrl,
)
const testDirectoryname = urlToBasename(testDirectoryRelativeUrl)
const jsenvDirectoryRelativeUrl = `${testDirectoryRelativeUrl}.jsenv/`
const buildDirectoryRelativeUrl = `${testDirectoryRelativeUrl}dist/esmodule/`
const htmlFileRelativeUrl = `${testDirectoryRelativeUrl}${testDirectoryname}.html`
const jsFileRelativeUrl = `${testDirectoryRelativeUrl}main.js`
const entryPointMap = {
  [`./${htmlFileRelativeUrl}`]: "./main.html",
}

const { buildMappings } = await buildProject({
  ...GENERATE_ESMODULE_BUILD_TEST_PARAMS,
  // logLevel: "debug",
  jsenvDirectoryRelativeUrl,
  buildDirectoryRelativeUrl,
  entryPointMap,
  // minify: true,
})

// assert only 2 files, 1 html, 1 js, are generated even if there is two js file used
{
  const actual = Object.keys(buildMappings)
  const expected = [htmlFileRelativeUrl, jsFileRelativeUrl]
  assert({ actual, expected })
}

const getBuildRelativeUrl = (urlRelativeToTestDirectory) => {
  const relativeUrl = `${testDirectoryRelativeUrl}${urlRelativeToTestDirectory}`
  const buildRelativeUrl = buildMappings[relativeUrl]
  return buildRelativeUrl
}

{
  const mainJsRelativeUrl = getBuildRelativeUrl("main.js")
  const { namespace } = await browserImportEsModuleBuild({
    ...BROWSER_IMPORT_BUILD_TEST_PARAMS,
    testDirectoryRelativeUrl,
    jsFileRelativeUrl: `./${mainJsRelativeUrl}`,
    // debug: true,
  })

  const actual = namespace
  const expected = { value: 42 }
  assert({ actual, expected })
}
