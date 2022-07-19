import { generateInlineContentUrl } from "@jsenv/urls"
import {
  parseHtmlString,
  stringifyHtmlAst,
  visitHtmlNodes,
  getHtmlNodeText,
  getHtmlNodePosition,
  analyzeScriptNode,
  setHtmlNodeAttributes,
  setHtmlNodeText,
  getHtmlNodeAttribute,
} from "@jsenv/ast"
import { CONTENT_TYPE } from "@jsenv/utils/src/content_type/content_type.js"

export const jsenvPluginHtmlInlineContent = ({ analyzeConvertedScripts }) => {
  return {
    name: "jsenv:html_inline_content",
    appliesDuring: "*",
    transformUrlContent: {
      html: async (urlInfo, context) => {
        const htmlAst = parseHtmlString(urlInfo.content)
        const actions = []
        const handleInlineStyle = (node) => {
          const htmlNodeText = getHtmlNodeText(node)
          if (!htmlNodeText) {
            return
          }
          actions.push(async () => {
            const { line, column, lineEnd, columnEnd, isOriginal } =
              getHtmlNodePosition(node, {
                preferOriginal: true,
              })
            const inlineStyleUrl = generateInlineContentUrl({
              url: urlInfo.url,
              extension: ".css",
              line,
              column,
              lineEnd,
              columnEnd,
            })
            const [inlineStyleReference, inlineStyleUrlInfo] =
              context.referenceUtils.foundInline({
                type: "link_href",
                expectedType: "css",
                isOriginalPosition: isOriginal,
                // we remove 1 to the line because imagine the following html:
                // <style>body { color: red; }</style>
                // -> content starts same line as <style>
                specifierLine: line - 1,
                specifierColumn: column,
                specifier: inlineStyleUrl,
                contentType: "text/css",
                content: htmlNodeText,
              })
            await context.cook(inlineStyleUrlInfo, {
              reference: inlineStyleReference,
            })
            setHtmlNodeText(node, inlineStyleUrlInfo.content)
            setHtmlNodeAttributes(node, {
              "generated-by": "jsenv:html_inline_content",
            })
          })
        }
        const handleInlineScript = (node) => {
          const htmlNodeText = getHtmlNodeText(node)
          if (!htmlNodeText) {
            return
          }
          // If the inline script was already handled by an other plugin, ignore it
          // - we want to preserve inline scripts generated by html supervisor during dev
          // - we want to avoid cooking twice a script during build
          const generatedBy = getHtmlNodeAttribute(node, "generated-by")
          if (
            generatedBy === "jsenv:as_js_classic_html" &&
            !analyzeConvertedScripts
          ) {
            return
          }
          if (generatedBy === "jsenv:html_supervisor") {
            return
          }
          actions.push(async () => {
            const { type, contentType } = analyzeScriptNode(node)
            const { line, column, lineEnd, columnEnd, isOriginal } =
              getHtmlNodePosition(node, {
                preferOriginal: true,
              })
            let inlineScriptUrl = generateInlineContentUrl({
              url: urlInfo.url,
              extension: CONTENT_TYPE.asFileExtension(contentType),
              line,
              column,
              lineEnd,
              columnEnd,
            })
            const [inlineScriptReference, inlineScriptUrlInfo] =
              context.referenceUtils.foundInline({
                node,
                type: "script_src",
                expectedType: type,
                // we remove 1 to the line because imagine the following html:
                // <script>console.log('ok')</script>
                // -> content starts same line as <script>
                specifierLine: line - 1,
                specifierColumn: column,
                isOriginalPosition: isOriginal,
                specifier: inlineScriptUrl,
                contentType,
                content: htmlNodeText,
              })

            await context.cook(inlineScriptUrlInfo, {
              reference: inlineScriptReference,
            })
            setHtmlNodeText(node, inlineScriptUrlInfo.content)
            setHtmlNodeAttributes(node, {
              "generated-by": "jsenv:html_inline_content",
            })
          })
        }
        visitHtmlNodes(htmlAst, {
          style: (node) => {
            handleInlineStyle(node)
          },
          script: (node) => {
            handleInlineScript(node)
          },
        })
        if (actions.length === 0) {
          return null
        }
        await Promise.all(actions.map((action) => action()))
        const htmlModified = stringifyHtmlAst(htmlAst)
        return {
          content: htmlModified,
        }
      },
    },
  }
}
