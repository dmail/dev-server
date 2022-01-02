import { assert } from "@jsenv/assert"
import {
  resolveDirectoryUrl,
  urlToRelativeUrl,
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
import {
  findHtmlNodeById,
  getHtmlNodeTextNode,
} from "@jsenv/core/src/internal/compiling/compileHtml.js"
import { browserImportEsModuleBuild } from "@jsenv/core/test/browserImportEsModuleBuild.js"

const testDirectoryUrl = resolveDirectoryUrl("./", import.meta.url)
const testDirectoryRelativeUrl = urlToRelativeUrl(
  testDirectoryUrl,
  jsenvCoreDirectoryUrl,
)
const jsenvDirectoryRelativeUrl = `${testDirectoryRelativeUrl}.jsenv/`
const buildDirectoryRelativeUrl = `${testDirectoryRelativeUrl}dist/esmodule/`
const { buildMappings } = await buildProject({
  ...GENERATE_ESMODULE_BUILD_TEST_PARAMS,
  jsenvDirectoryRelativeUrl,
  buildDirectoryRelativeUrl,
  entryPointMap: {
    [`./${testDirectoryRelativeUrl}importmap_and_assets.html`]: "main.html",
  },
  // minify: true,
  // logLevel: "debug",
})
const buildDirectoryUrl = resolveUrl(
  buildDirectoryRelativeUrl,
  jsenvCoreDirectoryUrl,
)
const mainBuildRelativeUrl = buildMappings[`${testDirectoryRelativeUrl}main.js`]
const cssBuildRelativeUrl =
  buildMappings[`${testDirectoryRelativeUrl}style.css`]
const imgBuildRelativeUrl = buildMappings[`${testDirectoryRelativeUrl}img.png`]

// check importmap content
{
  const htmlBuildFileUrl = resolveUrl("main.html", buildDirectoryUrl)
  const htmlBuildFileContent = await readFile(htmlBuildFileUrl)
  const importmapHtmlNode = findHtmlNodeById(htmlBuildFileContent, "importmap")
  const importmapTextNode = getHtmlNodeTextNode(importmapHtmlNode)
  const importmapString = importmapTextNode.value
  const importmap = JSON.parse(importmapString)

  const actual = importmap
  // importmap is the same because non js files are remapped
  const expected = {
    imports: {
      // the importmap for img-remap is available
      "./test/entry_html/importmap_and_assets/.jsenv/build/best/test/entry_html/importmap_and_assets/img.png": `./${imgBuildRelativeUrl}`,
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
  const cssUrls = await parseCssUrls({ code: cssString, url: cssBuildUrl })

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
    imgUrlIsInstanceOfUrl: true,
    imgUrlString: resolveUrl(
      `dist/esmodule/${imgBuildRelativeUrl}`,
      serverOrigin,
    ),
  }
  assert({ actual, expected })
}
