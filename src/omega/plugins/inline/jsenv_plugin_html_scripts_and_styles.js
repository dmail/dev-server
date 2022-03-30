import { urlToFilename } from "@jsenv/filesystem"

import {
  parseHtmlString,
  stringifyHtmlAst,
  visitHtmlAst,
  getHtmlNodeTextNode,
  getIdForInlineHtmlNode,
  htmlNodePosition,
  parseScriptNode,
  setHtmlNodeText,
  assignHtmlNodeAttributes,
  getHtmlNodeAttributeByName,
} from "@jsenv/utils/html_ast/html_ast.js"
import { stringifyUrlSite } from "@jsenv/utils/urls/url_trace.js"
import { injectQueryParamsIntoSpecifier } from "@jsenv/utils/urls/url_utils.js"

export const jsenvPluginHtmlInlineScriptsAndStyles = ({
  skipHtmlInlineLoad = false,
}) => {
  return {
    name: "jsenv:inline_scripts_and_styles",
    appliesDuring: "*",
    load: skipHtmlInlineLoad
      ? null
      : ({ data }) => {
          if (!data.inlineContent) {
            return null
          }
          return {
            contentType: data.inlineContentType,
            content: data.inlineContent,
          }
        },
    transform: {
      html: async (
        { url, originalContent, content },
        { cook, addReference, urlGraph },
      ) => {
        const htmlAst = parseHtmlString(content)
        const actions = []
        const addInlineReference = ({
          node,
          type,
          specifier,
          inlineContentType,
          inlineContent,
        }) => {
          const { line, column } = htmlNodePosition.readNodePosition(node, {
            preferOriginal: true,
          })
          const inlineReference = addReference({
            trace: stringifyUrlSite({
              url,
              content: originalContent,
              line,
              column,
            }),
            type,
            specifier,
            isInline: true,
          })
          const inlineUrlInfo = urlGraph.getUrlInfo(inlineReference.url)
          inlineUrlInfo.data.inlineContentType = inlineContentType
          inlineUrlInfo.data.inlineContent = inlineContent
          inlineUrlInfo.inlineUrlSite = {
            url,
            content: originalContent, // original because it's the origin line and column
            // we remove 1 to the line because imagine the following html:
            // <script>console.log('ok')</script>
            // -> code starts at the same line than script tag
            line: line - 1,
            column,
          }
          return inlineReference
        }
        const handleInlineStyle = (node) => {
          if (node.nodeName !== "style") {
            return
          }
          const textNode = getHtmlNodeTextNode(node)
          if (!textNode) {
            return
          }
          actions.push(async () => {
            const inlineStyleId = getIdForInlineHtmlNode(htmlAst, node)
            const inlineStyleSpecifier = `./${urlToFilename(
              url,
            )}@${inlineStyleId}.css`
            const inlineStyleReference = addInlineReference({
              node,
              type: "link_href",
              specifier: inlineStyleSpecifier,
              inlineContentType: "text/css",
              inlineContent: textNode.value,
            })
            const inlineUrlInfo = urlGraph.getUrlInfo(inlineStyleReference.url)
            await cook({
              reference: inlineStyleReference,
              urlInfo: inlineUrlInfo,
            })
            setHtmlNodeText(node, inlineUrlInfo.content)
          })
        }
        const handleInlineScript = (node) => {
          if (node.nodeName !== "script") {
            return
          }
          const textNode = getHtmlNodeTextNode(node)
          if (!textNode) {
            return
          }
          const contentSrc = getHtmlNodeAttributeByName(node, "content-src")
          if (contentSrc) {
            // it's inline but there is a corresponding "src" somewhere
            // - for instance the importmap was inlined by importmap plugin
            //   in that case the content is already cooked and can be kept as it is
            // - any other logic that would turn a remote script into some content
            //   but don't want to cook the content
            return
          }
          actions.push(async () => {
            const scriptCategory = parseScriptNode(node)
            const inlineScriptId = getIdForInlineHtmlNode(htmlAst, node)
            const inlineScriptSpecifier = `./${urlToFilename(
              url,
            )}@${inlineScriptId}${
              scriptCategory === "importmap" ? ".importmap" : ".js"
            }`
            const inlineScriptReference = addInlineReference({
              node,
              type: "script_src",
              specifier:
                scriptCategory === "classic"
                  ? injectQueryParamsIntoSpecifier(inlineScriptSpecifier, {
                      js_classic: "",
                    })
                  : inlineScriptSpecifier,
              inlineContentType:
                scriptCategory === "importmap"
                  ? "application/importmap+json"
                  : "application/javascript",
              inlineContent: textNode.value,
            })
            const inlineUrlInfo = urlGraph.getUrlInfo(inlineScriptReference.url)
            await cook({
              reference: inlineScriptReference,
              urlInfo: inlineUrlInfo,
            })
            assignHtmlNodeAttributes(node, {
              "original-inline-id": inlineScriptId,
            })
            setHtmlNodeText(node, inlineUrlInfo.content)
          })
        }
        visitHtmlAst(htmlAst, (node) => {
          handleInlineStyle(node)
          handleInlineScript(node)
        })
        if (actions.length === 0) {
          return null
        }
        await Promise.all(
          actions.map(async (action) => {
            await action()
          }),
        )
        const htmlModified = stringifyHtmlAst(htmlAst)
        return {
          content: htmlModified,
        }
      },
    },
  }
}
