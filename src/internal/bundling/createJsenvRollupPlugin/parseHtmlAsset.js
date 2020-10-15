import { urlToBasename, urlToRelativeUrl, resolveUrl, urlToParentUrl } from "@jsenv/util"
import {
  parseHtmlString,
  parseHtmlAstRessources,
  replaceHtmlNode,
  stringifyHtmlAst,
  getHtmlNodeAttributeValue,
  getHtmlNodeTextContent,
  getHtmlNodeLocation,
  getUniqueNameForInlineHtmlNode,
} from "../../compiling/compileHtml.js"
import { minifyHtml } from "./minifyHtml.js"

export const parseHtmlAsset = async (
  { content, url },
  { notifyAssetFound, notifyInlineAssetFound, notifyJsFound, notifyInlineJsFound },
  {
    minify,
    minifyHtmlOptions,
    htmlStringToHtmlAst = (htmlString) => parseHtmlString(htmlString),
  } = {},
) => {
  const htmlString = String(content.value)
  const htmlAst = await htmlStringToHtmlAst(htmlString)
  const { links, styles, scripts } = parseHtmlAstRessources(htmlAst)

  const htmlMutationMap = new Map()
  scripts.forEach((script) => {
    const type = getHtmlNodeAttributeValue(script, "type") || "text/javascript"
    const src = getHtmlNodeAttributeValue(script, "src")
    const text = getHtmlNodeTextContent(script)

    // regular javascript are not parseable by rollup
    // and we don't really care about there content
    // we will handle them as regular asset
    // but we still want to inline/minify/hash them for performance
    if (type === "text/javascript" && src) {
      const remoteScriptReference = notifyAssetFound({
        specifier: src,
        contentType: "text/javascript",
        ...htmlNodeToReferenceParams(script),
      })
      htmlMutationMap.set(remoteScriptReference, ({ getReferenceUrlRelativeToImporter }) => {
        const { preferInline } = remoteScriptReference
        if (preferInline) {
          const { sourceAfterTransformation } = remoteScriptReference.target
          replaceHtmlNode(script, `<script>${sourceAfterTransformation}</script>`)
        } else {
          const urlRelativeToImporter = getReferenceUrlRelativeToImporter(remoteScriptReference)
          replaceHtmlNode(script, `<script src="${urlRelativeToImporter}"></script>`)
        }
      })
      return
    }
    if (type === "text/javascript" && text) {
      const inlineScriptReference = notifyInlineAssetFound({
        specifier: getUniqueNameForInlineHtmlNode(script, scripts, `${urlToBasename(url)}.[id].js`),
        ...htmlNodeToReferenceParams(script),
        content: {
          type: "text/javascript",
          value: text,
        },
      })
      htmlMutationMap.set(inlineScriptReference, () => {
        const { sourceAfterTransformation } = inlineScriptReference.target
        replaceHtmlNode(script, `<script>${sourceAfterTransformation}</script>`)
      })
      return
    }

    if (type === "module" && src) {
      const remoteScriptReference = notifyJsFound({
        specifier: src,
        contentType: "text/javascript",
        ...htmlNodeToReferenceParams(script),
      })

      htmlMutationMap.set(remoteScriptReference, ({ getReferenceUrlRelativeToImporter }) => {
        const urlRelativeToImporter = getReferenceUrlRelativeToImporter(remoteScriptReference)
        replaceHtmlNode(
          script,
          `<script>window.System.import(${JSON.stringify(
            ensureRelativeUrlNotation(urlRelativeToImporter),
          )})</script>`,
        )
      })
      return
    }
    if (type === "module" && text) {
      const inlineScriptReference = notifyInlineJsFound({
        specifier: getUniqueNameForInlineHtmlNode(script, scripts, `${urlToBasename(url)}.[id].js`),
        ...htmlNodeToReferenceParams(script),
        content: {
          type: "text/javascript",
          value: text,
        },
      })
      htmlMutationMap.set(inlineScriptReference, ({ getReferenceUrlRelativeToImporter }) => {
        const urlRelativeToImporter = getReferenceUrlRelativeToImporter(inlineScriptReference)
        replaceHtmlNode(
          script,
          `<script>window.System.import(${JSON.stringify(
            ensureRelativeUrlNotation(urlRelativeToImporter),
          )})</script>`,
        )
      })
      return
    }

    if (type === "importmap" && src) {
      const remoteImportmapReference = notifyAssetFound({
        specifier: src,
        contentType: "application/importmap+json",
        ...htmlNodeToReferenceParams(script),
        // here we want to force the fileName for the importmap
        // so that we don't have to rewrite its content
        // the goal is to put the importmap at the same relative path
        // than in the project
        fileNamePattern: () => {
          const importmapUrl = remoteImportmapReference.url
          const importmapRelativeUrl = urlToRelativeUrl(
            remoteImportmapReference.target.url,
            importmapUrl,
          )
          const importmapParentRelativeUrl = urlToRelativeUrl(
            urlToParentUrl(resolveUrl(importmapRelativeUrl, "file://")),
            "file://",
          )
          return `${importmapParentRelativeUrl}[name]-[hash][extname]`
        },
      })
      htmlMutationMap.set(remoteImportmapReference, ({ getReferenceUrlRelativeToImporter }) => {
        const { preferInline } = remoteImportmapReference
        if (preferInline) {
          // here put a awrning if we cannot inline importmap because it would mess
          // the remapping (note that it's feasible) but not yet supported
          const { sourceAfterTransformation } = remoteImportmapReference.target
          replaceHtmlNode(
            script,
            `<script type="systemjs-importmap">${sourceAfterTransformation}</script>`,
          )
        } else {
          const urlRelativeToImporter = getReferenceUrlRelativeToImporter(remoteImportmapReference)
          replaceHtmlNode(
            script,
            `<script type="systemjs-importmap" src="${urlRelativeToImporter}"></script>`,
          )
        }
      })
      return
    }
    if (type === "importmap" && text) {
      const inlineImportMapReference = notifyInlineAssetFound({
        specifier: getUniqueNameForInlineHtmlNode(
          script,
          scripts,
          `${urlToBasename(url)}.[id].importmap`,
        ),
        ...htmlNodeToReferenceParams(script),
        content: {
          type: "application/importmap+json",
          value: text,
        },
      })
      htmlMutationMap.set(inlineImportMapReference, () => {
        const { sourceAfterTransformation } = inlineImportMapReference.target
        replaceHtmlNode(
          script,
          `<script type="systemjs-importmap">${sourceAfterTransformation}</script>`,
        )
      })
      return
    }
  })
  links.forEach((link) => {
    const href = getHtmlNodeAttributeValue(link, "href")
    if (!href) {
      return
    }

    const type = getHtmlNodeAttributeValue(link, "type")
    let contentType
    if (type) {
      contentType = type
    } else {
      const rel = getHtmlNodeAttributeValue(link, "rel")
      if (rel === "stylesheet") {
        contentType = "text/css"
      } else {
        contentType = undefined
      }
    }
    const remoteLinkReference = notifyAssetFound({
      specifier: href,
      contentType,
      ...htmlNodeToReferenceParams(link),
    })
    htmlMutationMap.set(remoteLinkReference, ({ getReferenceUrlRelativeToImporter }) => {
      const { preferInline } = remoteLinkReference
      if (preferInline) {
        const { sourceAfterTransformation } = remoteLinkReference.target
        replaceHtmlNode(remoteLinkReference, `<style>${sourceAfterTransformation}</style>`)
      } else {
        const urlRelativeToImporter = getReferenceUrlRelativeToImporter(remoteLinkReference)
        replaceHtmlNode(remoteLinkReference, `<link href="${urlRelativeToImporter}" />`)
      }
    })
  })
  styles.forEach((style) => {
    const text = getHtmlNodeTextContent(style)
    if (!text) {
      return
    }

    const inlineStyleReference = notifyInlineAssetFound({
      specifier: getUniqueNameForInlineHtmlNode(style, styles, `${urlToBasename(url)}.[id].css`),
      ...htmlNodeToReferenceParams(style),
      content: {
        type: "text/css",
        value: text,
      },
    })
    htmlMutationMap.set(inlineStyleReference, () => {
      const { sourceAfterTransformation } = inlineStyleReference.target
      replaceHtmlNode(style, `<style>${sourceAfterTransformation}</style>`)
    })
  })

  return async ({ getReferenceUrlRelativeToImporter }) => {
    htmlMutationMap.forEach((mutationCallback) => {
      mutationCallback({ getReferenceUrlRelativeToImporter })
    })
    const htmlAfterTransformation = stringifyHtmlAst(htmlAst)
    const sourceAfterTransformation = minify
      ? minifyHtml(htmlAfterTransformation, minifyHtmlOptions)
      : htmlAfterTransformation
    return {
      sourceAfterTransformation,
    }
  }
}

const htmlNodeToReferenceParams = (htmlNode) => {
  const dataPreferInline = getHtmlNodeAttributeValue(htmlNode, "data-prefer-inline")

  return {
    preferInline: dataPreferInline === undefined ? undefined : true,
    ...getHtmlNodeLocation(htmlNode),
  }
}

// otherwise systemjs thinks it's a bare import
const ensureRelativeUrlNotation = (relativeUrl) => {
  if (relativeUrl.startsWith("../")) {
    return relativeUrl
  }
  return `./${relativeUrl}`
}
