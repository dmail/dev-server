import { assert } from "@jsenv/assert"
import {
  resolveDirectoryUrl,
  urlToRelativeUrl,
  urlToBasename,
  resolveUrl,
  readFile,
} from "@jsenv/filesystem"

import { buildProject } from "@jsenv/core"
import { jsenvCoreDirectoryUrl } from "@jsenv/core/src/internal/jsenvCoreDirectoryUrl.js"
import { parseCssUrls } from "@jsenv/core/src/internal/building/css/parseCssUrls.js"
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
const entryPointMap = {
  [`./${testDirectoryRelativeUrl}${testDirectoryname}.html`]: "./main.html",
}
const { buildMappings } = await buildProject({
  ...GENERATE_ESMODULE_BUILD_TEST_PARAMS,
  jsenvDirectoryRelativeUrl,
  buildDirectoryRelativeUrl,
  entryPointMap,
  // minify: true,
  // logLevel: "debug",
})
const buildDirectoryUrl = resolveUrl(
  buildDirectoryRelativeUrl,
  jsenvCoreDirectoryUrl,
)
const importmapBuildRelativeUrl =
  buildMappings[`${testDirectoryRelativeUrl}import-map.importmap`]
const mainBuildRelativeUrl = buildMappings[`${testDirectoryRelativeUrl}main.js`]
const cssBuildRelativeUrl =
  buildMappings[`${testDirectoryRelativeUrl}style.css`]
const imgBuildRelativeUrl = buildMappings[`${testDirectoryRelativeUrl}img.png`]

// check importmap content
{
  const importmapBuildUrl = resolveUrl(
    importmapBuildRelativeUrl,
    buildDirectoryUrl,
  )
  const importmapString = await readFile(importmapBuildUrl)
  const importmap = JSON.parse(importmapString)

  const actual = importmap
  // importmap is the same because non js files are remapped
  const expected = {
    imports: {
      "./assets/img.png": `./${imgBuildRelativeUrl}`,
      // the importmap for img-remap is available
      "./main.js": `./${mainBuildRelativeUrl}`,
      // and nothing more because js is referencing only img-remap
    },
  }
  assert({ actual, expected })
}

// assert asset url is correct for css (hashed)
{
  const cssBuildUrl = resolveUrl(cssBuildRelativeUrl, buildDirectoryUrl)
  const imgBuildUrl = resolveUrl(imgBuildRelativeUrl, buildDirectoryUrl)
  const cssString = await readFile(cssBuildUrl)
  const cssUrls = await parseCssUrls(cssString, cssBuildUrl)

  const actual = cssUrls.urlDeclarations[0].specifier
  const expected = urlToRelativeUrl(imgBuildUrl, cssBuildUrl)
  assert({ actual, expected })
}

// assert asset url is correct for javascript (remapped + hashed)
{
  const { namespace, serverOrigin } = await browserImportEsModuleBuild({
    ...BROWSER_IMPORT_BUILD_TEST_PARAMS,
    testDirectoryRelativeUrl,
    jsFileRelativeUrl: `./${mainBuildRelativeUrl}`,
    // debug: true,
  })

  const actual = namespace
  const expected = {
    urlFromImportMetaNotation: resolveUrl(
      `dist/esmodule/${imgBuildRelativeUrl}`,
      serverOrigin,
    ),
  }
  assert({ actual, expected })
}
