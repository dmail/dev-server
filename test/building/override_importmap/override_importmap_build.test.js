import { assert } from "@jsenv/assert"
import { resolveDirectoryUrl, urlToRelativeUrl } from "@jsenv/filesystem"

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
const jsenvDirectoryRelativeUrl = `${testDirectoryRelativeUrl}.jsenv/`
const buildDirectoryRelativeUrl = `${testDirectoryRelativeUrl}dist/esmodule/`
const entryPointMap = {
  [`./${testDirectoryRelativeUrl}override_importmap.html`]: "./main.html",
}

const { buildMappings } = await buildProject({
  ...GENERATE_ESMODULE_BUILD_TEST_PARAMS,
  jsenvDirectoryRelativeUrl,
  buildDirectoryRelativeUrl,
  entryPointMap,
  urlMappings: {
    [`./${testDirectoryRelativeUrl}dev.importmap`]: `./${testDirectoryRelativeUrl}prod.importmap`,
  },
  // minify: true,
  // logLevel: "debug",
})

{
  const actual = buildMappings
  const expected = {
    // the importmap is not in buildMappings as it was inlined by the build
    [`${testDirectoryRelativeUrl}main.js`]: "main-2e94c91c.js",
    [`${testDirectoryRelativeUrl}override_importmap.html`]: "main.html",
  }
  assert({ actual, expected })
}

{
  const { namespace } = await browserImportEsModuleBuild({
    ...BROWSER_IMPORT_BUILD_TEST_PARAMS,
    testDirectoryRelativeUrl,
    jsFileRelativeUrl: `./${
      buildMappings[`${testDirectoryRelativeUrl}main.js`]
    }`,
    // debug: true,
  })
  const actual = namespace
  const expected = {
    env: "prod",
  }
  assert({ actual, expected })
}
