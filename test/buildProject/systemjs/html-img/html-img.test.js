import { basename } from "path"
import { assert } from "@jsenv/assert"
import {
  resolveDirectoryUrl,
  urlToRelativeUrl,
  readFile,
  resolveUrl,
  assertFilePresence,
} from "@jsenv/util"
import { buildProject } from "@jsenv/core/index.js"
import { jsenvCoreDirectoryUrl } from "@jsenv/core/src/internal/jsenvCoreDirectoryUrl.js"
import {
  findNodeByTagName,
  getHtmlNodeAttributeByName,
  parseSrcset,
} from "@jsenv/core/src/internal/compiling/compileHtml.js"
import { GENERATE_SYSTEMJS_BUILD_TEST_PARAMS } from "../TEST_PARAMS.js"

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
})

const getBuildRelativeUrl = (urlRelativeToTestDirectory) => {
  const relativeUrl = `${testDirectoryRelativeUrl}${urlRelativeToTestDirectory}`
  const buildRelativeUrl = buildMappings[relativeUrl]
  return buildRelativeUrl
}

const buildDirectoryUrl = resolveUrl(buildDirectoryRelativeUrl, jsenvCoreDirectoryUrl)
const htmlBuildUrl = resolveUrl("main.html", buildDirectoryUrl)
const htmlString = await readFile(htmlBuildUrl)
const img = findNodeByTagName(htmlString, "img")

// ensure src is properly updated
{
  const srcAttribute = getHtmlNodeAttributeByName(img, "src")
  const imgABuildRelativeUrl = getBuildRelativeUrl("img-a.png")
  const actual = srcAttribute.value
  const expected = imgABuildRelativeUrl
  assert({ actual, expected })
  // ensure corresponding file exists
  const imgABuildUrl = resolveUrl(imgABuildRelativeUrl, buildDirectoryUrl)
  await assertFilePresence(imgABuildUrl)
}

// ensure srcset is properly updated
{
  const srcsetAttribute = getHtmlNodeAttributeByName(img, "srcset")
  const imgBBuildRelativeUrl = getBuildRelativeUrl("img-b.png")
  const imgCBuildRelativeUrl = getBuildRelativeUrl("img-c.png")
  const actual = parseSrcset(srcsetAttribute.value)
  const expected = [
    {
      specifier: imgBBuildRelativeUrl,
      descriptor: "200w",
    },
    {
      specifier: imgCBuildRelativeUrl,
      descriptor: "400w",
    },
  ]
  // and corresponding file exists
  assert({ actual, expected })
  const imgBBuildUrl = resolveUrl(imgBBuildRelativeUrl, buildDirectoryUrl)
  await assertFilePresence(imgBBuildUrl)
  const imgCBuildUrl = resolveUrl(imgCBuildRelativeUrl, buildDirectoryUrl)
  await assertFilePresence(imgCBuildUrl)
}
