/*
 * Things happening here
 * - html supervisor module injection
 * - scripts are wrapped to be supervised
 */

import { injectQueryParams } from "@jsenv/core/src/utils/url_utils.js"
import {
  parseHtmlString,
  stringifyHtmlAst,
  visitHtmlAst,
  getHtmlNodeAttributeByName,
  removeHtmlNodeAttributeByName,
  setHtmlNodeText,
  assignHtmlNodeAttributes,
  parseScriptNode,
  injectScriptAsEarlyAsPossible,
  createHtmlNode,
} from "@jsenv/core/src/utils/html_ast/html_ast.js"

export const jsenvPluginHtmlSupervisor = () => {
  const htmlSupervisorSetupFileUrl = new URL(
    "./client/html_supervisor_setup.js",
    import.meta.url,
  ).href
  const htmlSupervisorFileUrl = new URL(
    "./client/html_supervisor.js",
    import.meta.url,
  ).href

  return {
    name: "jsenv:html_supervisor",
    appliesDuring: {
      dev: true,
      test: true,
    },
    transform: {
      html: async ({
        projectDirectoryUrl,
        resolve,
        asClientUrl,
        url,
        content,
      }) => {
        const htmlAst = parseHtmlString(content)
        const scriptsToSupervise = []
        visitHtmlAst(htmlAst, (node) => {
          if (node.nodeName !== "script") {
            return
          }
          const scriptCategory = parseScriptNode(node)
          if (scriptCategory !== "classic" && scriptCategory !== "module") {
            return
          }
          const dataInjectedAttribute = getHtmlNodeAttributeByName(
            node,
            "data-injected",
          )
          if (dataInjectedAttribute) {
            return
          }
          const srcAttribute = getHtmlNodeAttributeByName(node, "src")
          if (!srcAttribute) {
            return
          }
          let src = srcAttribute ? srcAttribute.value : undefined
          const integrityAttribute = getHtmlNodeAttributeByName(
            node,
            "integrity",
          )
          const integrity = integrityAttribute
            ? integrityAttribute.value
            : undefined
          const crossoriginAttribute = getHtmlNodeAttributeByName(
            node,
            "crossorigin",
          )
          const crossorigin = crossoriginAttribute
            ? crossoriginAttribute.value
            : undefined
          scriptsToSupervise.push({
            node,
            type: scriptCategory,
            src,
            integrity,
            crossorigin,
          })
        })
        if (scriptsToSupervise.length === 0) {
          return null
        }
        let htmlSupervisorSetupResolvedUrl = await resolve({
          parentUrl: projectDirectoryUrl,
          specifierType: "js_import_export",
          specifier: htmlSupervisorSetupFileUrl,
        })
        htmlSupervisorSetupResolvedUrl = injectQueryParams(
          htmlSupervisorSetupResolvedUrl,
          { js_classic: "" },
        )
        injectScriptAsEarlyAsPossible(
          htmlAst,
          createHtmlNode({
            tagName: "script",
            src: asClientUrl(htmlSupervisorSetupResolvedUrl),
          }),
        )
        const htmlSupervisorResolvedUrl = await resolve({
          parentUrl: projectDirectoryUrl,
          specifierType: "js_import_export",
          specifier: htmlSupervisorFileUrl,
        })
        const htmlSupervisorClientUrl = asClientUrl(htmlSupervisorResolvedUrl)
        injectScriptAsEarlyAsPossible(
          htmlAst,
          createHtmlNode({
            tagName: "script",
            type: "module",
            src: htmlSupervisorClientUrl,
          }),
        )
        await scriptsToSupervise.reduce(
          async (previous, { node, type, src, integrity, crossorigin }) => {
            await previous
            let scriptUrl = await resolve({
              parentUrl: url,
              specifierType: "script_src",
              specifier: src,
            })
            if (type === "classic") {
              scriptUrl = injectQueryParams(scriptUrl, { js_classic: "" })
            }
            removeHtmlNodeAttributeByName(node, "src")
            assignHtmlNodeAttributes(node, {
              "content-src": scriptUrl,
            })
            setHtmlNodeText(
              node,
              generateCodeToSuperviseScript({
                type,
                src: asClientUrl(scriptUrl),
                integrity,
                crossorigin,
                htmlSupervisorClientUrl,
              }),
            )
          },
          Promise.resolve(),
        )
        const htmlModified = stringifyHtmlAst(htmlAst)
        return {
          content: htmlModified,
        }
      },
    },
  }
}

// Ideally jsenv should take into account eventual
// "integrity" and "crossorigin" attribute during supervision
const generateCodeToSuperviseScript = ({
  type,
  src,
  integrity,
  crossorigin,
  htmlSupervisorClientUrl,
}) => {
  const paramsAsJson = JSON.stringify({ src, integrity, crossorigin })
  if (type === "module") {
    return `import { superviseScriptTypeModule } from "${htmlSupervisorClientUrl}"
superviseScriptTypeModule(${paramsAsJson})`
  }
  return `window.__html_supervisor__.superviseScript(${paramsAsJson})`
}
