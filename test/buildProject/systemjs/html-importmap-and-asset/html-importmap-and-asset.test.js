import { basename } from "path"
import { assert } from "@jsenv/assert"
import { resolveDirectoryUrl, urlToRelativeUrl, resolveUrl, readFile } from "@jsenv/util"
import { buildProject } from "@jsenv/core/index.js"
import { jsenvCoreDirectoryUrl } from "@jsenv/core/src/internal/jsenvCoreDirectoryUrl.js"
import { parseCssUrls } from "@jsenv/core/src/internal/building/css/parseCssUrls.js"
import { browserImportSystemJsBuild } from "../browserImportSystemJsBuild.js"
import {
  GENERATE_SYSTEMJS_BUILD_TEST_PARAMS,
  IMPORT_SYSTEM_JS_BUILD_TEST_PARAMS,
} from "../TEST_PARAMS.js"

const testDirectoryUrl = resolveDirectoryUrl("./", import.meta.url)
const testDirectoryRelativeUrl = urlToRelativeUrl(testDirectoryUrl, jsenvCoreDirectoryUrl)
const testDirectoryname = basename(testDirectoryRelativeUrl)
const jsenvDirectoryRelativeUrl = `${testDirectoryRelativeUrl}.jsenv/`
const buildDirectoryRelativeUrl = `${testDirectoryRelativeUrl}dist/systemjs/`
const mainFilename = `${testDirectoryname}.html`
const entryPointMap = {
  [`./${testDirectoryRelativeUrl}${mainFilename}`]: "./main.html",
}

const { buildMappings } = await buildProject({
  ...GENERATE_SYSTEMJS_BUILD_TEST_PARAMS,
  // logLevel: "info",
  jsenvDirectoryRelativeUrl,
  buildDirectoryRelativeUrl,
  entryPointMap,
  // minify: true,
})
const getBuildRelativeUrl = (urlRelativeToTestDirectory) => {
  const relativeUrl = `${testDirectoryRelativeUrl}${urlRelativeToTestDirectory}`
  const buildRelativeUrl = buildMappings[relativeUrl]
  return buildRelativeUrl
}

const buildDirectoryUrl = resolveUrl(buildDirectoryRelativeUrl, jsenvCoreDirectoryUrl)
const jsBundleRelativeUrl = getBuildRelativeUrl("file.js")
const imgRemapBundleRelativeUrl = getBuildRelativeUrl("img-remap.png")

// check importmap content
{
  const importmapBundleRelativeUrl = getBuildRelativeUrl("import-map.importmap")
  const importmapBundleUrl = resolveUrl(importmapBundleRelativeUrl, buildDirectoryUrl)
  const importmapString = await readFile(importmapBundleUrl)
  const importmap = JSON.parse(importmapString)
  const actual = importmap
  const expected = {
    imports: {
      // the original importmap remapping are still there
      // ideally it should target `./${imgRemapBundleRelativeUrl}` but for now it's not supported
      "./img.png": "./img-remap.png",
      // the importmap for img-remap is available
      "./assets/img-remap.png": `./${imgRemapBundleRelativeUrl}`,
      "./file.js": `./${jsBundleRelativeUrl}`,
      // and nothing more because js is referencing only img-remap
    },
  }
  assert({ actual, expected })
}

// assert asset url is correct for css (hashed)
{
  const imgRelativeUrl = getBuildRelativeUrl("img.png")
  const cssBuildRelativeUrl = getBuildRelativeUrl("style.css")
  const cssBundleUrl = resolveUrl(cssBuildRelativeUrl, buildDirectoryUrl)
  const imgBundleUrl = resolveUrl(imgRelativeUrl, buildDirectoryUrl)
  const cssString = await readFile(cssBundleUrl)
  const cssUrls = await parseCssUrls(cssString, cssBundleUrl)
  const actual = cssUrls.urlDeclarations[0].specifier
  const expected = urlToRelativeUrl(imgBundleUrl, cssBundleUrl)
  assert({ actual, expected })
}

// assert asset url is correct for javascript (remapped + hashed)
{
  const mainRelativeUrl = getBuildRelativeUrl("file.js")
  const { namespace, serverOrigin } = await browserImportSystemJsBuild({
    ...IMPORT_SYSTEM_JS_BUILD_TEST_PARAMS,
    testDirectoryRelativeUrl,
    mainRelativeUrl: `./${mainRelativeUrl}`,
    // debug: true,
  })
  const actual = namespace
  const expected = {
    default: resolveUrl(`dist/systemjs/${imgRemapBundleRelativeUrl}`, serverOrigin),
  }
  assert({ actual, expected })
}
