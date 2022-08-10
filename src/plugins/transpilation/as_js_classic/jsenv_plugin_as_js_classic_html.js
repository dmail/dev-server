/*
 * when <script type="module"> cannot be used:
 * - ?as_js_classic is injected into the src of <script type="module">
 * - js inside <script type="module"> is transformed into classic js
 * - <link rel="modulepreload"> are converted to <link rel="preload">
 */

import {
  generateInlineContentUrl,
  injectQueryParamsIntoSpecifier,
} from "@jsenv/urls"
import {
  parseHtmlString,
  visitHtmlNodes,
  stringifyHtmlAst,
  getHtmlNodeAttribute,
  getHtmlNodeText,
  getHtmlNodePosition,
  setHtmlNodeAttributes,
  setHtmlNodeText,
  analyzeScriptNode,
  injectScriptNodeAsEarlyAsPossible,
  createHtmlNode,
} from "@jsenv/ast"

export const jsenvPluginAsJsClassicHtml = ({
  systemJsInjection,
  systemJsClientFileUrl,
}) => {
  return {
    name: "jsenv:as_js_classic_html",
    appliesDuring: "*",
    transformUrlContent: {
      html: async (urlInfo, context) => {
        const shouldTransformScriptTypeModule =
          !context.isSupportedOnCurrentClients("script_type_module") ||
          !context.isSupportedOnCurrentClients("import_dynamic") ||
          !context.isSupportedOnCurrentClients("import_meta")
        const htmlAst = parseHtmlString(urlInfo.content)
        const preloadAsScriptNodes = []
        const modulePreloadNodes = []
        const moduleScriptNodes = []
        const classicScriptNodes = []
        const visitLinkNodes = (node) => {
          const rel = getHtmlNodeAttribute(node, "rel")
          if (rel === "modulepreload") {
            modulePreloadNodes.push(node)
            return
          }
          if (rel === "preload") {
            const asValue = getHtmlNodeAttribute(node, "as")
            if (asValue === "script") {
              preloadAsScriptNodes.push(node)
            }
            return
          }
        }
        const visitScriptNodes = (node) => {
          const { type } = analyzeScriptNode(node)
          if (type === "js_module") {
            moduleScriptNodes.push(node)
            return
          }
          if (type === "js_classic") {
            classicScriptNodes.push(node)
            return
          }
        }
        visitHtmlNodes(htmlAst, {
          link: (node) => {
            visitLinkNodes(node)
          },
          script: (node) => {
            visitScriptNodes(node)
          },
        })

        const actions = []
        const jsModuleUrls = []
        const convertedUrls = []
        const turnIntoJsClassicProxy = async (
          reference,
          {
            // we don't cook resource hints
            // because they might refer to resource that will be modified during build
            // It also means something else HAVE to reference that url in order to cook it
            // so that the preload is deleted by "resync_resource_hints.js" otherwise
            cookIt = false,
          } = {},
        ) => {
          const [jsClassicReference, jsClassicUrlInfo] =
            context.referenceUtils.update(reference, {
              specifier: injectQueryParamsIntoSpecifier(reference.specifier, {
                as_js_classic: "",
              }),
            })
          const jsClassicUrl = jsClassicUrlInfo.url
          if (!convertedUrls.includes(jsClassicUrl)) {
            convertedUrls.push(jsClassicUrl)
          }
          if (cookIt) {
            // during dev it means js modules will be cooked before server sends the HTML
            // it's ok because:
            // - during dev script_type_module are supported (dev use a recent browser)
            // - even if browser is not supported it still works it's jus a bit slower
            //   because it needs to decide if systemjs will be injected or not
            await context.cook(jsClassicUrlInfo, {
              reference: jsClassicReference,
            })
          }
          return [jsClassicReference, jsClassicUrlInfo]
        }

        classicScriptNodes.forEach((classicScriptNode) => {
          const src = getHtmlNodeAttribute(classicScriptNode, "src")
          if (src !== undefined) {
            const reference = context.referenceUtils.find(
              (ref) =>
                ref.generatedSpecifier === src && ref.type === "script_src",
            )
            const urlObject = new URL(reference.url)
            if (urlObject.searchParams.has("as_js_classic")) {
              const convertedUrl = urlObject.href
              convertedUrls.push(convertedUrl)
              urlObject.searchParams.delete("as_js_classic")
              const jsModuleUrl = urlObject.href
              jsModuleUrls.push(jsModuleUrl)
              actions.push(async () => {
                const urlInfo = context.urlGraph.getUrlInfo(convertedUrl)
                await context.cook(urlInfo, { reference })
              })
            }
          }
        })
        moduleScriptNodes.forEach((moduleScriptNode) => {
          const src = getHtmlNodeAttribute(moduleScriptNode, "src")
          if (src !== undefined) {
            const reference = context.referenceUtils.find(
              (ref) =>
                ref.generatedSpecifier === src &&
                ref.type === "script_src" &&
                ref.expectedType === "js_module",
            )
            jsModuleUrls.push(reference.url)
            if (shouldTransformScriptTypeModule) {
              actions.push(async () => {
                const [jsClassicReference] = await turnIntoJsClassicProxy(
                  reference,
                  {
                    cookIt: true,
                  },
                )
                setHtmlNodeAttributes(moduleScriptNode, {
                  type: undefined,
                  src: jsClassicReference.generatedSpecifier,
                })
              })
            }
            return
          }
          if (shouldTransformScriptTypeModule) {
            const htmlNodeText = getHtmlNodeText(moduleScriptNode)
            actions.push(async () => {
              const { line, column, lineEnd, columnEnd, isOriginal } =
                getHtmlNodePosition(moduleScriptNode, {
                  preferOriginal: true,
                })
              let inlineScriptUrl = generateInlineContentUrl({
                url: urlInfo.url,
                extension: ".js",
                line,
                column,
                lineEnd,
                columnEnd,
              })
              const [inlineReference] = context.referenceUtils.foundInline({
                node: moduleScriptNode,
                type: "script_src",
                expectedType: "js_module",
                isOriginalPosition: isOriginal,
                // we remove 1 to the line because imagine the following html:
                // <script>console.log('ok')</script>
                // -> content starts same line as <script>
                specifierLine: line - 1,
                specifierColumn: column,
                specifier: inlineScriptUrl,
                contentType: "text/javascript",
                content: htmlNodeText,
              })
              const [, jsClassicUrlInfo] = await turnIntoJsClassicProxy(
                inlineReference,
                { cookIt: true },
              )
              setHtmlNodeText(moduleScriptNode, jsClassicUrlInfo.content)
              setHtmlNodeAttributes(moduleScriptNode, {
                "type": undefined,
                "jsenv-plugin-owner": "jsenv:as_js_classic_html",
                "jsenv-plugin-action": "content_cooked",
              })
            })
          }
        })
        if (shouldTransformScriptTypeModule) {
          preloadAsScriptNodes.forEach((preloadAsScriptNode) => {
            const href = getHtmlNodeAttribute(preloadAsScriptNode, "href")
            const reference = context.referenceUtils.find(
              (ref) =>
                ref.generatedSpecifier === href &&
                ref.type === "link_href" &&
                ref.expectedType === "js_module",
            )
            const expectedScriptType = jsModuleUrls.includes(reference.url)
              ? "module"
              : "classic"
            if (expectedScriptType === "module") {
              actions.push(async () => {
                // reference modified by <script type="module"> conversion
                let jsClassicReference
                if (reference.next) {
                  jsClassicReference = reference.next
                } else {
                  // when the url is not referenced by a <script type="module">
                  // we assume we want to preload "classic" but it might not be the case
                  // but it's unlikely to happen and people should use "modulepreload" in that case anyway
                  ;[jsClassicReference] = await turnIntoJsClassicProxy(
                    reference,
                  )
                }
                setHtmlNodeAttributes(preloadAsScriptNode, {
                  href: jsClassicReference.generatedSpecifier,
                  crossorigin: undefined,
                })
              })
            }
          })
          modulePreloadNodes.forEach((modulePreloadNode) => {
            const href = getHtmlNodeAttribute(modulePreloadNode, "href")
            const reference = context.referenceUtils.find(
              (ref) =>
                ref.generatedSpecifier === href &&
                ref.type === "link_href" &&
                ref.expectedType === "js_module",
            )
            actions.push(async () => {
              let jsClassicReference
              if (reference.next) {
                jsClassicReference = reference.next
              } else {
                ;[jsClassicReference] = await turnIntoJsClassicProxy(reference)
              }
              setHtmlNodeAttributes(modulePreloadNode, {
                rel: "preload",
                as: "script",
                href: jsClassicReference.generatedSpecifier,
              })
            })
          })
        }

        if (actions.length === 0) {
          return null
        }
        await Promise.all(actions.map((action) => action()))
        if (systemJsInjection) {
          const needsSystemJs = convertedUrls.some(
            (convertedUrl) =>
              context.urlGraph.getUrlInfo(convertedUrl).data.jsClassicFormat ===
              "system",
          )
          if (needsSystemJs) {
            const [systemJsReference] = context.referenceUtils.inject({
              type: "script_src",
              expectedType: "js_classic",
              specifier: systemJsClientFileUrl,
            })
            injectScriptNodeAsEarlyAsPossible(
              htmlAst,
              createHtmlNode({
                tagName: "script",
                src: systemJsReference.generatedSpecifier,
              }),
              "jsenv:as_js_classic_html",
            )
          }
        }
        return stringifyHtmlAst(htmlAst)
      },
    },
  }
}
