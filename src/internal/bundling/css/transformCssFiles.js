import { basename } from "path"
import { urlToRelativeUrl, urlToFileSystemPath } from "@jsenv/util"
import { setCssSourceMappingUrl } from "../../sourceMappingURLUtils.js"
import { computeFileBundleUrl } from "./computeFileBundleUrl.js"
import { replaceCssUrls } from "./replaceCssUrls.js"
import { fetchCssAssets } from "./fetchCssAssets.js"

export const transformCssFiles = async (
  cssDependencies,
  { projectDirectoryUrl, bundleDirectoryUrl },
) => {
  const assetSources = await fetchCssAssets(cssDependencies)
  const assetUrlMappings = await remapCssAssetUrls(assetSources, {
    projectDirectoryUrl,
    bundleDirectoryUrl,
  })

  const cssUrlMappings = {}
  const cssContentMappings = {}

  const cssFilesOrderedByDependency = getCssFilesOrderedBydependency(cssDependencies)
  await cssFilesOrderedByDependency.reduce(async (previous, cssFile) => {
    await previous

    const cssBeforeTransformation = cssDependencies[cssFile].source
    // we don't know yet the hash of the css file because
    // we will modify its content, we only know where it's going to be written
    // postCSS needs this infromation for the sourcemap
    // once we will know the final css name with hash
    // we will update the sourcemap.file and sourcemap comment to add the hash
    const cssUrlWithoutHashAfterTransformation = computeFileBundleUrl(cssFile, {
      pattern: "[name][extname]",
      projectDirectoryUrl,
      bundleDirectoryUrl,
    })
    const urlsReplacements = makeUrlReplacementsRelativeToCssFile(
      {
        ...assetUrlMappings,
        ...cssUrlMappings,
      },
      cssUrlWithoutHashAfterTransformation,
    )

    const cssReplaceResult = await replaceCssUrls(cssBeforeTransformation, urlsReplacements, {
      from: cssFile,
      to: cssUrlWithoutHashAfterTransformation,
    })
    let cssAfterTransformation = cssReplaceResult.css
    const cssAfterTransformationMap = cssReplaceResult.map.toJSON()

    const cssFileUrlAfterTransformation = computeFileBundleUrl(cssFile, {
      fileContent: cssAfterTransformation,
      projectDirectoryUrl,
      bundleDirectoryUrl,
    })
    const cssSourceMapFileUrl = `${cssFileUrlAfterTransformation}.map`
    const cssSourceMapFileUrlRelativeToSource = urlToRelativeUrl(
      cssSourceMapFileUrl,
      cssFileUrlAfterTransformation,
    )
    cssAfterTransformationMap.file = basename(urlToFileSystemPath(cssFileUrlAfterTransformation))
    cssAfterTransformation = setCssSourceMappingUrl(
      cssAfterTransformation,
      cssSourceMapFileUrlRelativeToSource,
    )
    cssContentMappings[cssFile] = {
      css: cssAfterTransformation,
      map: cssAfterTransformationMap,
    }

    cssUrlMappings[cssFile] = cssFileUrlAfterTransformation
  }, Promise.resolve())

  return {
    assetUrlMappings,
    assetSources,
    cssUrlMappings,
    cssContentMappings,
  }
}

const makeUrlReplacementsRelativeToCssFile = (urlsReplacements, cssFileUrl) => {
  const relative = {}
  Object.keys(urlsReplacements).forEach((key) => {
    const urlReplacement = urlsReplacements[key]
    relative[key] = `./${urlToRelativeUrl(urlReplacement, cssFileUrl)}`
  })
  return relative
}

const remapCssAssetUrls = (assetSources, { projectDirectoryUrl, bundleDirectoryUrl }) => {
  const assetUrlMappings = {}

  Object.keys(assetSources).map(async (assetUrl) => {
    assetUrlMappings[assetUrl] = computeFileBundleUrl(assetUrl, {
      fileContent: assetSources[assetUrl],
      projectDirectoryUrl,
      bundleDirectoryUrl,
    })
  })

  return assetUrlMappings
}

const getCssFilesOrderedBydependency = (cssDependencies) => {
  const cssFilesOrderedByDependency = []

  const visitRemainingFiles = (remainingFiles) => {
    if (remainingFiles.length === 0) return

    const filesToHandle = []
    remainingFiles.forEach((cssFile) => {
      const { importUrls } = cssDependencies[cssFile]
      const allDependenciesResolved = importUrls.every((cssUrl) =>
        cssFilesOrderedByDependency.includes(cssUrl),
      )
      if (allDependenciesResolved) {
        cssFilesOrderedByDependency.push(cssFile)
      } else {
        filesToHandle.push(cssFile)
      }
    })

    if (filesToHandle.length) {
      visitRemainingFiles(filesToHandle)
    }
  }

  visitRemainingFiles(Object.keys(cssDependencies))

  return cssFilesOrderedByDependency
}
