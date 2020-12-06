import { basename } from "path"
import { assert } from "@jsenv/assert"
import { resolveDirectoryUrl, urlToRelativeUrl, resolveUrl, readFile } from "@jsenv/util"
import { buildProject } from "@jsenv/core"
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
const jsBuildRelativeUrl = getBuildRelativeUrl("file.js")
const imgRemapBuildRelativeUrl = getBuildRelativeUrl("img-remap.png")

// check importmap content
{
  const importmapBuildRelativeUrl = getBuildRelativeUrl("import-map.importmap")
  const importmapBuildUrl = resolveUrl(importmapBuildRelativeUrl, buildDirectoryUrl)
  const importmapString = await readFile(importmapBuildUrl)
  const importmap = JSON.parse(importmapString)
  const actual = importmap
  const expected = {
    imports: {
      // the original importmap remapping are still there
      // ideally it should target `./${imgRemapBuildRelativeUrl}` but for now it's not supported
      "./img.png": "./img-remap.png",
      // the importmap for img-remap is available
      "./assets/img-remap.png": `./${imgRemapBuildRelativeUrl}`,
      "./file.js": `./${jsBuildRelativeUrl}`,
      // and nothing more because js is referencing only img-remap
    },
  }
  assert({ actual, expected })
}

// assert asset url is correct for css (hashed)
{
  const imgRelativeUrl = getBuildRelativeUrl("img.png")
  const cssBuildRelativeUrl = getBuildRelativeUrl("style.css")
  const cssBuildUrl = resolveUrl(cssBuildRelativeUrl, buildDirectoryUrl)
  const imgBuildUrl = resolveUrl(imgRelativeUrl, buildDirectoryUrl)
  const cssString = await readFile(cssBuildUrl)
  const cssUrls = await parseCssUrls(cssString, cssBuildUrl)
  const actual = cssUrls.urlDeclarations[0].specifier
  const expected = urlToRelativeUrl(imgBuildUrl, cssBuildUrl)
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
    default: resolveUrl(`dist/systemjs/${imgRemapBuildRelativeUrl}`, serverOrigin),
  }
  assert({ actual, expected })
}
