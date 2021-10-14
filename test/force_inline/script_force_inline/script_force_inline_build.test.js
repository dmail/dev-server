import { assert } from "@jsenv/assert"
import { resolveUrl, urlToRelativeUrl, readFile } from "@jsenv/filesystem"

import { buildProject } from "@jsenv/core"
import { jsenvCoreDirectoryUrl } from "@jsenv/core/src/internal/jsenvCoreDirectoryUrl.js"
import { GENERATE_ESMODULE_BUILD_TEST_PARAMS } from "@jsenv/core/test/TEST_PARAMS_BUILD_ESMODULE.js"
import {
  findNodeByTagName,
  getHtmlNodeAttributeByName,
  getHtmlNodeTextNode,
} from "@jsenv/core/src/internal/compiling/compileHtml.js"

const testDirectoryUrl = resolveUrl("./", import.meta.url)
const testDirectoryRelativeUrl = urlToRelativeUrl(
  testDirectoryUrl,
  jsenvCoreDirectoryUrl,
)
const jsenvDirectoryRelativeUrl = `${testDirectoryRelativeUrl}.jsenv/`
const buildDirectoryRelativeUrl = `${testDirectoryRelativeUrl}dist/esmodule/`
const mainFilename = `main.html`
const fileRelativeUrl = `${testDirectoryRelativeUrl}${mainFilename}`
const entryPointMap = {
  [`./${fileRelativeUrl}`]: "./main.html",
}
await buildProject({
  ...GENERATE_ESMODULE_BUILD_TEST_PARAMS,
  // logLevel: "debug",
  jsenvDirectoryRelativeUrl,
  buildDirectoryRelativeUrl,
  entryPointMap,
})

// ensure src is properly inlined
{
  const buildDirectoryUrl = resolveUrl(
    buildDirectoryRelativeUrl,
    jsenvCoreDirectoryUrl,
  )
  const htmlBuildUrl = resolveUrl("main.html", buildDirectoryUrl)
  const htmlString = await readFile(htmlBuildUrl)
  const script = findNodeByTagName(htmlString, "script")
  const srcAttribute = getHtmlNodeAttributeByName(script, "src")
  const forceInlineAttribute = getHtmlNodeAttributeByName(
    script,
    "data-jsenv-force-inline",
  )
  const textNode = getHtmlNodeTextNode(script)

  const actual = {
    srcAttribute,
    forceInlineAttribute,
    textNodeValue: textNode.value,
  }
  const expected = {
    srcAttribute: undefined,
    forceInlineAttribute: undefined,
    textNodeValue:
      // on windows the sourcemap.sourcesContent contains "\r\n" and not "\n"
      // which creates an other hash on the sourcemap
      process.platform === "win32"
        ? actual.textNodeValue
        : `const answer = 42;
console.log(answer);
//# sourceMappingURL=assets/file.js-ebc40214.map`,
  }
  assert({ actual, expected })
}
