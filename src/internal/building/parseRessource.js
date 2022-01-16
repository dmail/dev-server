import { readFile, urlToRelativeUrl } from "@jsenv/filesystem"

import {
  parseHtmlString,
  findHtmlNode,
  htmlNodeIsScriptModule,
  getHtmlNodeAttributeByName,
  getHtmlNodeTextNode,
  manipulateHtmlAst,
  findFirstImportMapNode,
} from "@jsenv/core/src/internal/compiling/compileHtml.js"
import {
  jsenvSystemJsFileInfo,
  jsenvResolveImportUrlHelper,
} from "@jsenv/core/src/internal/jsenvInternalFiles.js"

import { parseHtmlRessource } from "./html/parseHtmlRessource.js"
import { parseImportmapRessource } from "./importmap/parseImportmapRessource.js"
import { parseSvgRessource } from "./svg/parseSvgRessource.js"
import { parseCssRessource } from "./css/parseCssRessource.js"
import { parseJsRessource } from "./js/parseJsRessource.js"
import { parseJsonRessource } from "./json/parseJsonRessource.js"
import { parseWebmanifestRessource } from "./webmanifest/parseWebmanifestRessource.js"

export const parseRessource = async (
  ressource,
  notifiers,
  {
    projectDirectoryUrl,
    jsenvRemoteDirectory,
    format,
    systemJsUrl,
    asProjectUrl,
    asOriginalUrl,
    asOriginalServerUrl,
    ressourceHintNeverUsedCallback,
    useImportMapToMaximizeCacheReuse,
    createImportMapForFilesUsedInJs,
    minify,
    minifyJs,
    minifyHtml,
    minifyCssOptions,
    cssConcatenation,
  },
) => {
  const { contentType } = ressource
  if (!contentType) {
    return null
  }

  if (contentType === "text/html") {
    return parseHtmlRessource(ressource, notifiers, {
      minify,
      minifyHtml,
      htmlStringToHtmlAst: async (htmlString) => {
        const htmlAst = parseHtmlString(htmlString)

        const { hasModuleScript, hasInlineModuleScript } =
          getHtmlModuleScriptInfo(htmlAst)

        if (hasModuleScript && format === "systemjs") {
          // force presence of systemjs script if html contains a module script
          // use our own version of systemjs by default
          if (typeof systemJsUrl === "undefined") {
            systemJsUrl = `/${urlToRelativeUrl(
              jsenvSystemJsFileInfo.url,
              projectDirectoryUrl,
            )}`
          }

          manipulateHtmlAst(htmlAst, {
            scriptInjections: [
              {
                id: "jsenv_inject_systemjs",
                src: systemJsUrl,
                ...(hasInlineModuleScript
                  ? { "data-jsenv-force-inline": true }
                  : {}),
              },
            ],
          })
        }

        if (useImportMapToMaximizeCacheReuse) {
          if (hasModuleScript && format === "esmodule") {
            // inject an inline script helper to resolve url
            manipulateHtmlAst(htmlAst, {
              scriptInjections: [
                {
                  id: "jsenv_import_url_resolution_helper",
                  text: await readFile(jsenvResolveImportUrlHelper.url),
                },
              ],
            })
          }

          if (!findFirstImportMapNode(htmlAst)) {
            // force the presence of a fake+inline+empty importmap script
            // if html contains no importmap and we useImportMapToMaximizeCacheReuse
            // this inline importmap will be transformed later to have top level remapping
            // required to target hashed js urls
            manipulateHtmlAst(htmlAst, {
              scriptInjections: [
                {
                  type: "importmap",
                  id: "jsenv_inject_importmap",
                  text: "{}",
                },
              ],
            })
          }
        }

        return htmlAst
      },
      ressourceHintNeverUsedCallback: (info) => {
        ressourceHintNeverUsedCallback({
          ...info,
          htmlSource: String(ressource.bufferBeforeBuild),
          htmlUrl: asOriginalUrl(ressource.url),
          htmlAttributeName: "href",
        })
      },
    })
  }

  if (contentType === "text/css") {
    return parseCssRessource(ressource, notifiers, {
      jsenvRemoteDirectory,
      asProjectUrl,
      asOriginalUrl,
      asOriginalServerUrl,
      minify,
      minifyCssOptions,
      cssConcatenation,
    })
  }

  if (contentType === "application/importmap+json") {
    return parseImportmapRessource(ressource, notifiers, {
      minify,
      importMapToInject: useImportMapToMaximizeCacheReuse
        ? createImportMapForFilesUsedInJs()
        : undefined,
    })
  }

  if (
    contentType === "application/manifest+json" ||
    ressource.references[0].contentTypeExpected === "application/manifest+json"
  ) {
    return parseWebmanifestRessource(ressource, notifiers, { minify })
  }

  if (
    contentType === "application/javascript" ||
    contentType === "text/javascript"
  ) {
    return parseJsRessource(ressource, notifiers, {
      projectDirectoryUrl,
      asProjectUrl,
      asOriginalUrl,
      asOriginalServerUrl,
      minify,
      minifyJs,
    })
  }

  if (contentType === "image/svg+xml") {
    return parseSvgRessource(ressource, notifiers, {
      minify,
      minifyHtml,
    })
  }

  if (contentType === "application/json" || contentType.endsWith("+json")) {
    return parseJsonRessource(ressource, notifiers, { minify })
  }

  return null
}

const getHtmlModuleScriptInfo = (htmlAst) => {
  let hasModuleScript = false
  let hasInlineModuleScript = false
  findHtmlNode(htmlAst, (htmlNode) => {
    const isScriptModule = htmlNodeIsScriptModule(htmlNode)
    if (!isScriptModule) {
      return false
    }

    hasModuleScript = true

    const isInline =
      getHtmlNodeAttributeByName(htmlNode, "data-jsenv-force-inline") ||
      (!getHtmlNodeAttributeByName(htmlNode, "src") &&
        getHtmlNodeTextNode(htmlNode))
    if (!isInline) {
      return false
    }
    hasInlineModuleScript = true
    return true
  })

  return { hasModuleScript, hasInlineModuleScript }
}
