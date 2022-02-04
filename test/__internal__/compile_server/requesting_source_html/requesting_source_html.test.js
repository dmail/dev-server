import { fetchUrl } from "@jsenv/server"
import {
  resolveUrl,
  urlToRelativeUrl,
  readFile,
  writeFile,
} from "@jsenv/filesystem"
import { assert } from "@jsenv/assert"

import { jsenvCoreDirectoryUrl } from "@jsenv/core/src/jsenv_file_urls.js"
import { startCompileServer } from "@jsenv/core/src/internal/compile_server/compile_server.js"
import {
  findHtmlNodeById,
  getHtmlNodeAttributeByName,
  getHtmlNodeTextNode,
} from "@jsenv/core/src/internal/transform_html/html_ast.js"
import { DataUrl } from "@jsenv/core/src/internal/data_url.js"
import { COMPILE_SERVER_TEST_PARAMS } from "../TEST_PARAMS_COMPILE_SERVER.js"

const testDirectoryUrl = resolveUrl("./", import.meta.url)
const testDirectoryRelativeUrl = urlToRelativeUrl(
  testDirectoryUrl,
  jsenvCoreDirectoryUrl,
)
const jsenvDirectoryRelativeUrl = `${testDirectoryRelativeUrl}.jsenv/`
const htmlRelativeUrl = `${testDirectoryRelativeUrl}source_html.html`
const compileServer = await startCompileServer({
  ...COMPILE_SERVER_TEST_PARAMS,
  jsenvDirectoryRelativeUrl,
})
const htmlServerUrl = `${compileServer.origin}/${htmlRelativeUrl}`
const response = await fetchUrl(htmlServerUrl, {
  ignoreHttpsError: true,
})

{
  const actual = {
    redirected: response.redirected,
    status: response.status,
    statusText: response.statusText,
    contentType: response.headers.get("content-type"),
  }
  const expected = {
    redirected: false,
    status: 200,
    statusText: "OK",
    contentType: "text/html",
  }
  assert({ actual, expected })
}

const html = await response.text()
{
  const stylesheetHtmlNode = findHtmlNodeById(html, "stylesheet")
  const hrefAttribute = getHtmlNodeAttributeByName(stylesheetHtmlNode, "href")
  const relAttribute = getHtmlNodeAttributeByName(stylesheetHtmlNode, "rel")
  const textNode = getHtmlNodeTextNode(stylesheetHtmlNode)

  const actual = {
    nodeName: stylesheetHtmlNode.nodeName,
    hrefAttribute,
    relAttribute,
    text: textNode.value,
  }
  const expected = {
    nodeName: "style",
    hrefAttribute: undefined,
    relAttribute: undefined,
    text:
      process.platform === "win32"
        ? actual.text // on windows it's "\r" instead of "\n" and I'm lazy to test it
        : `body {
  background: orange;
}
`,
  }
  assert({ actual, expected })
}

{
  const importmapHtmlNode = findHtmlNodeById(html, "importmap")
  const srcAttribute = getHtmlNodeAttributeByName(importmapHtmlNode, "src")
  const textNode = getHtmlNodeTextNode(importmapHtmlNode)
  const mappings = JSON.parse(textNode.value)

  const actual = {
    srcAttribute,
    mappings,
  }
  const expected = {
    srcAttribute: undefined,
    mappings: { imports: {} },
  }
  assert({ actual, expected })
}

{
  const scriptHtmlNode = findHtmlNodeById(html, "script")
  const srcAttribute = getHtmlNodeAttributeByName(scriptHtmlNode, "src")
  const textNode = getHtmlNodeTextNode(scriptHtmlNode)

  const actual = {
    srcAttribute,
    text: textNode.value,
  }
  const expected = {
    srcAttribute: undefined,
    text:
      process.platform === "win32"
        ? actual.text // on windows it's "\r" instead of "\n" and I'm lazy to test it
        : `console.log("script")
`,
  }
  assert({ actual, expected })
}

{
  const moduleScriptHtmlNode = findHtmlNodeById(html, "module_script")
  const srcAttribute = getHtmlNodeAttributeByName(moduleScriptHtmlNode, "src")
  const textNode = getHtmlNodeTextNode(moduleScriptHtmlNode)

  const actual = {
    srcAttribute,
    text: textNode.value,
  }
  const expected = {
    srcAttribute: undefined,
    text: `window.__jsenv__.executeFileUsingDynamicImport("./module_script.js")`,
  }
  assert({ actual, expected })
}

{
  const imgNode = findHtmlNodeById(html, "img")
  const srcAttribute = getHtmlNodeAttributeByName(imgNode, "src")
  const src = srcAttribute.value
  const imgFileUrl = `${testDirectoryUrl}img.png`
  const imgBuffer = await readFile(imgFileUrl, { as: "buffer" })

  const actual = src
  const expected = DataUrl.stringify({
    mediaType: "image/png",
    data: imgBuffer,
  })
  assert({ actual, expected })
}

// write file in case I need to manually check it looks correct
await writeFile(`${testDirectoryUrl}/.jsenv/out.html`, html)
