/**
 * allows the following:
 *
 * import "@jsenv/core/helpers/regenerator-runtime/regenerator-runtime.js"
 * -> searches a file inside @jsenv/core/*
 *
 */

import { urlToRelativeUrl, urlIsInsideOf } from "@jsenv/util"
import { composeTwoImportMaps } from "@jsenv/import-map"
import { jsenvCoreDirectoryUrl } from "../jsenvCoreDirectoryUrl.js"

export const transformImportmap = async (importmapBeforeTransformation, { originalFileUrl }) => {
  const importMapForProject = JSON.parse(importmapBeforeTransformation)

  const topLevelRemappingForJsenvCore = {
    "@jsenv/core/": urlToRelativeUrlRemapping(jsenvCoreDirectoryUrl, originalFileUrl),
  }

  const importmapForSelfImport = {
    imports: topLevelRemappingForJsenvCore,
    scopes: generateJsenvCoreScopes({ importMapForProject, topLevelRemappingForJsenvCore }),
  }

  const importMap = [importmapForSelfImport, importMapForProject].reduce(
    (previous, current) => composeTwoImportMaps(previous, current),
    {},
  )

  const scopes = importMap.scopes || {}
  const projectTopLevelMappings = importMapForProject.imports || {}
  Object.keys(scopes).forEach((scope) => {
    const scopedMappings = scopes[scope]
    Object.keys(projectTopLevelMappings).forEach((key) => {
      if (key in scopedMappings) {
        scopedMappings[key] = projectTopLevelMappings[key]
      }
    })
  })

  return {
    compiledSource: JSON.stringify(importMap, null, "  "),
    contentType: "application/importmap+json",
    sources: [originalFileUrl],
    sourcesContent: [importmapBeforeTransformation],
    assets: [],
    assetsContent: [],
  }
}

// this function just here to ensure relative urls starts with './'
// so that importmap do not consider them as bare specifiers
const urlToRelativeUrlRemapping = (url, baseUrl) => {
  const relativeUrl = urlToRelativeUrl(url, baseUrl)

  if (urlIsInsideOf(url, baseUrl)) {
    if (relativeUrl.startsWith("../")) return relativeUrl
    if (relativeUrl.startsWith("./")) return relativeUrl
    return `./${relativeUrl}`
  }

  return relativeUrl
}

const generateJsenvCoreScopes = ({ importMapForProject, topLevelRemappingForJsenvCore }) => {
  const { scopes } = importMapForProject

  if (!scopes) {
    return undefined
  }

  // I must ensure jsenvCoreImports wins by default in every scope
  // because scope may contains stuff like
  // "/": "/"
  // "/": "/folder/"
  // to achieve this, we set jsenvCoreImports into every scope
  const scopesForJsenvCore = {}
  Object.keys(scopes).forEach((scopeKey) => {
    scopesForJsenvCore[scopeKey] = topLevelRemappingForJsenvCore
  })
  return scopesForJsenvCore
}
