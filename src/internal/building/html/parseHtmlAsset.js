/**

Finds all asset reference in html then update all references to target the files in dist/ when needed.

There is some cases where the asset won't be found and updated:
- inline styles
- inline attributes

Don't write the following for instance:

<div style="background:url('img.png')"></div>

Or be sure to also reference this url somewhere in the html file like

<link rel="preload" href="img.png" />

*/

import {
  urlToBasename,
  urlToRelativeUrl,
  resolveUrl,
  urlToParentUrl,
} from "@jsenv/filesystem"

import {
  parseHtmlString,
  parseHtmlAstRessources,
  replaceHtmlNode,
  getHtmlNodeAttributeByName,
  stringifyHtmlAst,
  getUniqueNameForInlineHtmlNode,
  removeHtmlNodeAttribute,
  setHtmlNodeText,
  getHtmlNodeTextNode,
  parseSrcset,
  stringifySrcset,
} from "@jsenv/core/src/internal/compiling/compileHtml.js"
import {
  getJavaScriptSourceMappingUrl,
  setJavaScriptSourceMappingUrl,
  getCssSourceMappingUrl,
  setCssSourceMappingUrl,
} from "@jsenv/core/src/internal/sourceMappingURLUtils.js"
import {
  getTargetAsBase64Url,
  targetIsReferencedOnlyByRessourceHint,
} from "../asset-builder.util.js"
import {
  collectNodesMutations,
  htmlNodeToReferenceLocation,
} from "../parsing.utils.js"
import { collectSvgMutations } from "../svg/parseSvgAsset.js"
import { minifyHtml } from "./minifyHtml.js"

export const parseHtmlAsset = async (
  htmlTarget,
  notifiers,
  {
    minify,
    minifyHtmlOptions,
    htmlStringToHtmlAst = (htmlString) => parseHtmlString(htmlString),
    htmlAstToHtmlString = (htmlAst) => stringifyHtmlAst(htmlAst),
    ressourceHintNeverUsedCallback = () => {},
  } = {},
) => {
  const htmlString = String(htmlTarget.bufferBeforeBuild)
  const htmlAst = await htmlStringToHtmlAst(htmlString)
  const { links, styles, scripts, imgs, images, uses, sources } =
    parseHtmlAstRessources(htmlAst)

  const linksMutations = collectNodesMutations(links, notifiers, htmlTarget, [
    linkStylesheetHrefVisitor,
    (link, notifiers) =>
      linkHrefVisitor(link, {
        ...notifiers,
        ressourceHintNeverUsedCallback,
      }),
  ])
  const scriptsMutations = collectNodesMutations(
    scripts,
    notifiers,
    htmlTarget,
    [
      // regular javascript are not parseable by rollup
      // and we don't really care about there content
      // we will handle them as regular asset
      // but we still want to inline/minify/hash them for performance
      regularScriptSrcVisitor,
      regularScriptTextNodeVisitor,
      moduleScriptSrcVisitor,
      moduleScriptTextNodeVisitor,
      importmapScriptSrcVisitor,
      importmapScriptTextNodeVisitor,
    ],
  )
  const stylesMutations = collectNodesMutations(styles, notifiers, htmlTarget, [
    styleTextNodeVisitor,
  ])
  const imgsSrcMutations = collectNodesMutations(imgs, notifiers, htmlTarget, [
    imgSrcVisitor,
  ])
  const imgsSrcsetMutations = collectNodesMutations(
    imgs,
    notifiers,
    htmlTarget,
    [srcsetVisitor],
  )
  const sourcesSrcMutations = collectNodesMutations(
    sources,
    notifiers,
    htmlTarget,
    [sourceSrcVisitor],
  )
  const sourcesSrcsetMutations = collectNodesMutations(
    sources,
    notifiers,
    htmlTarget,
    [srcsetVisitor],
  )
  const svgMutations = collectSvgMutations(
    { images, uses },
    notifiers,
    htmlTarget,
  )

  const htmlMutations = [
    ...linksMutations,
    ...scriptsMutations,
    ...stylesMutations,
    ...imgsSrcMutations,
    ...imgsSrcsetMutations,
    ...sourcesSrcMutations,
    ...sourcesSrcsetMutations,
    ...svgMutations,
  ]

  return async (params) => {
    htmlMutations.forEach((mutationCallback) => {
      mutationCallback({
        ...params,
      })
    })

    const htmlAfterTransformation = htmlAstToHtmlString(htmlAst)
    return minify
      ? minifyHtml(htmlAfterTransformation, minifyHtmlOptions)
      : htmlAfterTransformation
  }
}

const regularScriptSrcVisitor = (
  script,
  { notifyReferenceFound },
  htmlTarget,
) => {
  const typeAttribute = getHtmlNodeAttributeByName(script, "type")
  if (
    typeAttribute &&
    (typeAttribute.value !== "text/javascript" ||
      typeAttribute.value !== "application/javascript")
  ) {
    return null
  }
  const srcAttribute = getHtmlNodeAttributeByName(script, "src")
  if (!srcAttribute) {
    return null
  }

  const remoteScriptReference = notifyReferenceFound({
    referenceExpectedContentType: "application/javascript",
    referenceRessourceSpecifier: srcAttribute.value,
    ...htmlNodeToReferenceLocation(script),
  })
  return ({ getReferenceUrlRelativeToImporter }) => {
    if (remoteScriptReference.target.isExternal) {
      return
    }

    if (shouldInline({ reference: remoteScriptReference, htmlNode: script })) {
      removeHtmlNodeAttribute(script, srcAttribute)
      const { target } = remoteScriptReference
      const { bufferAfterBuild } = target
      let jsString = String(bufferAfterBuild)

      const sourcemapRelativeUrl = getJavaScriptSourceMappingUrl(jsString)
      if (sourcemapRelativeUrl) {
        const { targetBuildRelativeUrl } = target
        const jsBuildUrl = resolveUrl(targetBuildRelativeUrl, "file:///")
        const sourcemapBuildUrl = resolveUrl(sourcemapRelativeUrl, jsBuildUrl)
        const htmlUrl = resolveUrl(htmlTarget.targetFileNamePattern, "file:///")
        const sourcemapInlineUrl = urlToRelativeUrl(sourcemapBuildUrl, htmlUrl)
        jsString = setJavaScriptSourceMappingUrl(jsString, sourcemapInlineUrl)
      }

      setHtmlNodeText(script, jsString)
      return
    }

    const urlRelativeToImporter = getReferenceUrlRelativeToImporter(
      remoteScriptReference,
    )
    srcAttribute.value = urlRelativeToImporter
  }
}

const regularScriptTextNodeVisitor = (
  script,
  { notifyReferenceFound },
  htmlTarget,
  scripts,
) => {
  const typeAttribute = getHtmlNodeAttributeByName(script, "type")
  if (
    typeAttribute &&
    (typeAttribute.value !== "text/javascript" ||
      typeAttribute.value !== "application/javascript")
  ) {
    return null
  }
  const srcAttribute = getHtmlNodeAttributeByName(script, "src")
  if (srcAttribute) {
    return null
  }
  const textNode = getHtmlNodeTextNode(script)
  if (!textNode) {
    return null
  }

  const jsReference = notifyReferenceFound({
    referenceExpectedContentType: "application/javascript",
    referenceRessourceSpecifier: getUniqueNameForInlineHtmlNode(
      script,
      scripts,
      `${urlToBasename(htmlTarget.targetUrl)}.[id].js`,
    ),
    ...htmlNodeToReferenceLocation(script),

    ressourceContentType: "application/javascript",
    bufferBeforeBuild: Buffer.from(textNode.value),
    isInline: true,
  })
  return () => {
    const { bufferAfterBuild } = jsReference.target
    textNode.value = bufferAfterBuild
  }
}

const moduleScriptSrcVisitor = (script, { format, notifyReferenceFound }) => {
  const typeAttribute = getHtmlNodeAttributeByName(script, "type")
  if (!typeAttribute) {
    return null
  }
  if (typeAttribute.value !== "module") {
    return null
  }
  const srcAttribute = getHtmlNodeAttributeByName(script, "src")
  if (!srcAttribute) {
    return null
  }

  const remoteScriptReference = notifyReferenceFound({
    referenceExpectedContentType: "application/javascript",
    referenceRessourceSpecifier: srcAttribute.value,
    ...htmlNodeToReferenceLocation(script),

    isJsModule: true,
  })
  return ({ getReferenceUrlRelativeToImporter }) => {
    if (format === "systemjs") {
      typeAttribute.value = "systemjs-module"
    }

    if (remoteScriptReference.target.isExternal) {
      return
    }

    if (shouldInline({ reference: remoteScriptReference, htmlNode: script })) {
      // here put a warning if we cannot inline importmap because it would mess
      // the remapping (note that it's feasible) but not yet supported
      removeHtmlNodeAttribute(script, srcAttribute)
      const { target } = remoteScriptReference
      const { bufferAfterBuild } = target
      let jsString = String(bufferAfterBuild)

      // at this stage, for some reason the sourcemap url is not in the js
      // (it will be added sshortly after by "injectSourcemapInRollupBuild")
      // but we know that a script type module have a sourcemap
      // and will be next to html file
      // with these assumptions we can force the sourcemap url
      const sourcemapUrl = `${target.targetBuildRelativeUrl}.map`
      jsString = setJavaScriptSourceMappingUrl(jsString, sourcemapUrl)

      setHtmlNodeText(script, jsString)
      return
    }

    const urlRelativeToImporter = getReferenceUrlRelativeToImporter(
      remoteScriptReference,
    )
    const relativeUrlNotation = ensureRelativeUrlNotation(urlRelativeToImporter)
    srcAttribute.value = relativeUrlNotation
  }
}

const moduleScriptTextNodeVisitor = (
  script,
  { format, notifyReferenceFound },
  htmlTarget,
  scripts,
) => {
  const typeAttribute = getHtmlNodeAttributeByName(script, "type")
  if (!typeAttribute) {
    return null
  }
  if (typeAttribute.value !== "module") {
    return null
  }
  const srcAttribute = getHtmlNodeAttributeByName(script, "src")
  if (srcAttribute) {
    return null
  }
  const textNode = getHtmlNodeTextNode(script)
  if (!textNode) {
    return null
  }

  const jsReference = notifyReferenceFound({
    referenceExpectedContentType: "application/javascript",
    referenceRessourceSpecifier: getUniqueNameForInlineHtmlNode(
      script,
      scripts,
      `${urlToBasename(htmlTarget.targetUrl)}.[id].js`,
    ),
    ...htmlNodeToReferenceLocation(script),

    ressourceContentType: "application/javascript",
    bufferBeforeBuild: textNode.value,
    isJsModule: true,
    isInline: true,
  })
  return () => {
    if (format === "systemjs") {
      typeAttribute.value = "systemjs-module"
    }
    const { bufferAfterBuild } = jsReference.target
    textNode.value = bufferAfterBuild
  }
}

const importmapScriptSrcVisitor = (
  script,
  { format, notifyReferenceFound },
) => {
  const typeAttribute = getHtmlNodeAttributeByName(script, "type")
  if (!typeAttribute) {
    return null
  }
  if (typeAttribute.value !== "importmap") {
    return null
  }
  const srcAttribute = getHtmlNodeAttributeByName(script, "src")
  if (!srcAttribute) {
    return null
  }

  const importmapReference = notifyReferenceFound({
    referenceExpectedContentType: "application/importmap+json",
    referenceRessourceSpecifier: srcAttribute.value,
    ...htmlNodeToReferenceLocation(script),

    // here we want to force the fileName for the importmap
    // so that we don't have to rewrite its content
    // the goal is to put the importmap at the same relative path
    // than in the project
    targetFileNamePattern: () => {
      const importmapReferenceUrl = importmapReference.referenceUrl
      const importmapTargetUrl = importmapReference.target.targetUrl
      const importmapUrlRelativeToImporter = urlToRelativeUrl(
        importmapTargetUrl,
        importmapReferenceUrl,
      )
      const importmapParentRelativeUrl = urlToRelativeUrl(
        urlToParentUrl(resolveUrl(importmapUrlRelativeToImporter, "file://")),
        "file://",
      )
      return `${importmapParentRelativeUrl}[name]-[hash][extname]`
    },
  })
  return ({ getReferenceUrlRelativeToImporter }) => {
    if (format === "systemjs") {
      typeAttribute.value = "systemjs-importmap"
    }

    if (importmapReference.target.isExternal) {
      return
    }

    if (shouldInline({ reference: importmapReference, htmlNode: script })) {
      // here put a warning if we cannot inline importmap because it would mess
      // the remapping (note that it's feasible) but not yet supported
      removeHtmlNodeAttribute(script, srcAttribute)
      const { bufferAfterBuild } = importmapReference.target

      const jsString = String(bufferAfterBuild)

      setHtmlNodeText(script, jsString)
      return
    }

    const urlRelativeToImporter =
      getReferenceUrlRelativeToImporter(importmapReference)
    srcAttribute.value = urlRelativeToImporter
  }
}

const importmapScriptTextNodeVisitor = (
  script,
  { format, notifyReferenceFound },
  htmlTarget,
  scripts,
) => {
  const typeAttribute = getHtmlNodeAttributeByName(script, "type")
  if (!typeAttribute) {
    return null
  }
  if (typeAttribute.value !== "importmap") {
    return null
  }
  const srcAttribute = getHtmlNodeAttributeByName(script, "src")
  if (srcAttribute) {
    return null
  }
  const textNode = getHtmlNodeTextNode(script)
  if (!textNode) {
    return null
  }

  const importmapReference = notifyReferenceFound({
    referenceExpectedContentType: "application/importmap+json",
    referenceRessourceSpecifier: getUniqueNameForInlineHtmlNode(
      script,
      scripts,
      `${urlToBasename(htmlTarget.targetUrl)}.[id].importmap`,
    ),
    ...htmlNodeToReferenceLocation(script),

    ressourceContentType: "application/importmap+json",
    bufferBeforeBuild: Buffer.from(textNode.value),
    isInline: true,
  })
  return () => {
    if (format === "systemjs") {
      typeAttribute.value = "systemjs-importmap"
    }

    const { bufferAfterBuild } = importmapReference.target
    textNode.value = bufferAfterBuild
  }
}

const linkStylesheetHrefVisitor = (
  link,
  { notifyReferenceFound },
  htmlTarget,
) => {
  const hrefAttribute = getHtmlNodeAttributeByName(link, "href")
  if (!hrefAttribute) {
    return null
  }
  const relAttribute = getHtmlNodeAttributeByName(link, "rel")
  if (!relAttribute) {
    return null
  }
  if (relAttribute.value !== "stylesheet") {
    return null
  }

  const cssReference = notifyReferenceFound({
    referenceExpectedContentType: "text/css",
    referenceRessourceSpecifier: hrefAttribute.value,
    ...htmlNodeToReferenceLocation(link),
  })
  return ({ getReferenceUrlRelativeToImporter }) => {
    if (cssReference.target.isExternal) {
      return
    }

    if (shouldInline({ reference: cssReference, htmlNode: link })) {
      const { target } = cssReference
      const { bufferAfterBuild } = target
      let cssString = String(bufferAfterBuild)
      const sourcemapRelativeUrl = getCssSourceMappingUrl(cssString)
      if (sourcemapRelativeUrl) {
        const { targetBuildRelativeUrl } = target
        const cssBuildUrl = resolveUrl(targetBuildRelativeUrl, "file:///")
        const sourcemapBuildUrl = resolveUrl(sourcemapRelativeUrl, cssBuildUrl)
        const htmlUrl = resolveUrl(htmlTarget.targetFileNamePattern, "file:///")
        const sourcemapInlineUrl = urlToRelativeUrl(sourcemapBuildUrl, htmlUrl)
        cssString = setCssSourceMappingUrl(cssString, sourcemapInlineUrl)
      }

      replaceHtmlNode(link, `<style>${cssString}</style>`, {
        attributesToIgnore: ["href", "rel", "as", "crossorigin", "type"],
      })
      return
    }

    const urlRelativeToImporter =
      getReferenceUrlRelativeToImporter(cssReference)
    hrefAttribute.value = urlRelativeToImporter
  }
}

const linkHrefVisitor = (
  link,
  { format, notifyReferenceFound, ressourceHintNeverUsedCallback },
) => {
  const hrefAttribute = getHtmlNodeAttributeByName(link, "href")
  if (!hrefAttribute) {
    return null
  }

  const relAttribute = getHtmlNodeAttributeByName(link, "rel")
  const rel = relAttribute ? relAttribute.value : undefined
  const isRessourceHint = [
    "preconnect",
    "dns-prefetch",
    "prefetch",
    "preload",
    "modulepreload",
  ].includes(rel)

  let referenceExpectedContentType
  const typeAttribute = getHtmlNodeAttributeByName(link, "type")
  const type = typeAttribute ? typeAttribute.value : ""
  let isJsModule = false
  if (type) {
    referenceExpectedContentType = type
  } else if (rel === "manifest") {
    referenceExpectedContentType = "application/manifest+json"
  } else if (rel === "modulepreload") {
    referenceExpectedContentType = "application/javascript"
    isJsModule = true
  }

  const linkReference = notifyReferenceFound({
    isRessourceHint,
    referenceExpectedContentType,
    referenceRessourceSpecifier: hrefAttribute.value,
    ...htmlNodeToReferenceLocation(link),
    targetUrlVersioningDisabled:
      referenceExpectedContentType === "application/manifest+json",
    isJsModule,
  })
  return ({ getReferenceUrlRelativeToImporter }) => {
    const target = linkReference.target
    if (isRessourceHint) {
      if (targetIsReferencedOnlyByRessourceHint(target)) {
        ressourceHintNeverUsedCallback({
          htmlNode: link,
          rel,
          href: hrefAttribute.value,
        })
        // we could remove the HTML node but better keep it untouched and let user decide what to do
        return
      }
    }

    if (linkReference.target.isExternal) {
      return
    }

    if (format === "systemjs" && rel === "modulepreload") {
      const urlRelativeToImporter =
        getReferenceUrlRelativeToImporter(linkReference)
      replaceHtmlNode(
        link,
        `<link rel="preload" href="${urlRelativeToImporter}" as="script" />`,
      )
      return
    }

    if (shouldInline({ reference: linkReference, htmlNode: link })) {
      replaceHtmlNode(
        link,
        `<link href="${getTargetAsBase64Url(linkReference.target)}" />`,
      )
      return
    }

    const urlRelativeToImporter =
      getReferenceUrlRelativeToImporter(linkReference)
    hrefAttribute.value = urlRelativeToImporter
  }
}

const styleTextNodeVisitor = (
  style,
  { notifyReferenceFound },
  htmlTarget,
  styles,
) => {
  const textNode = getHtmlNodeTextNode(style)
  if (!textNode) {
    return null
  }

  const inlineStyleReference = notifyReferenceFound({
    referenceExpectedContentType: "text/css",
    referenceRessourceSpecifier: getUniqueNameForInlineHtmlNode(
      style,
      styles,
      `${urlToBasename(htmlTarget.targetUrl)}.[id].css`,
    ),
    ...htmlNodeToReferenceLocation(style),

    ressourceContentType: "text/css",
    bufferBeforeBuild: Buffer.from(textNode.value),
    isInline: true,
  })
  return () => {
    const { bufferAfterBuild } = inlineStyleReference.target
    textNode.value = bufferAfterBuild
  }
}

const imgSrcVisitor = (img, { notifyReferenceFound }) => {
  const srcAttribute = getHtmlNodeAttributeByName(img, "src")
  if (!srcAttribute) {
    return null
  }

  const srcReference = notifyReferenceFound({
    referenceRessourceSpecifier: srcAttribute.value,
    ...htmlNodeToReferenceLocation(img),
  })
  return ({ getReferenceUrlRelativeToImporter }) => {
    const srcNewValue = referenceToUrl({
      reference: srcReference,
      htmlNode: img,
      getReferenceUrlRelativeToImporter,
    })
    srcAttribute.value = srcNewValue
  }
}

const srcsetVisitor = (htmlNode, { notifyReferenceFound }) => {
  const srcsetAttribute = getHtmlNodeAttributeByName(htmlNode, "srcset")
  if (!srcsetAttribute) {
    return null
  }

  const srcsetParts = parseSrcset(srcsetAttribute.value)
  const srcsetPartsReferences = srcsetParts.map(({ specifier }) =>
    notifyReferenceFound({
      referenceRessourceSpecifier: specifier,
      ...htmlNodeToReferenceLocation(htmlNode),
    }),
  )
  if (srcsetParts.length === 0) {
    return null
  }

  return ({ getReferenceUrlRelativeToImporter }) => {
    srcsetParts.forEach((srcsetPart, index) => {
      const reference = srcsetPartsReferences[index]
      srcsetPart.specifier = referenceToUrl({
        reference,
        htmlNode,
        getReferenceUrlRelativeToImporter,
      })
    })

    const srcsetNewValue = stringifySrcset(srcsetParts)
    srcsetAttribute.value = srcsetNewValue
  }
}

const sourceSrcVisitor = (source, { notifyReferenceFound }) => {
  const srcAttribute = getHtmlNodeAttributeByName(source, "src")
  if (!srcAttribute) {
    return null
  }

  const typeAttribute = getHtmlNodeAttributeByName(source, "type")
  const srcReference = notifyReferenceFound({
    referenceExpectedContentType: typeAttribute
      ? typeAttribute.value
      : undefined,
    referenceRessourceSpecifier: srcAttribute.value,
    ...htmlNodeToReferenceLocation(source),
  })
  return ({ getReferenceUrlRelativeToImporter }) => {
    const srcNewValue = referenceToUrl({
      reference: srcReference,
      htmlNode: source,
      getReferenceUrlRelativeToImporter,
    })
    srcAttribute.value = srcNewValue
  }
}

const referenceToUrl = ({
  reference,
  htmlNode,
  getReferenceUrlRelativeToImporter,
}) => {
  if (reference.target.isExternal) {
    return reference.target.targetUrl
  }
  if (shouldInline({ reference, htmlNode })) {
    return getTargetAsBase64Url(reference.target)
  }
  return getReferenceUrlRelativeToImporter(reference)
}

// otherwise systemjs handle it as a bare import
const ensureRelativeUrlNotation = (relativeUrl) => {
  if (relativeUrl.startsWith("../")) {
    return relativeUrl
  }
  return `./${relativeUrl}`
}

const shouldInline = ({ reference, htmlNode }) => {
  const { target } = reference
  const { isInline } = target
  if (isInline) {
    return true
  }

  return readAndRemoveForceInline(htmlNode)
}

const readAndRemoveForceInline = (htmlNode) => {
  const jsenvForceInlineAttribute = getHtmlNodeAttributeByName(
    htmlNode,
    "data-jsenv-force-inline",
  )
  if (jsenvForceInlineAttribute) {
    removeHtmlNodeAttribute(htmlNode, jsenvForceInlineAttribute)
    return true
  }
  return false
}
