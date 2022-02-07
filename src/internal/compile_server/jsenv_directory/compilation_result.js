import {
  resolveUrl,
  urlToRelativeUrl,
  readFile,
  ensureWindowsDriveLetter,
  urlIsInsideOf,
} from "@jsenv/filesystem"

import {
  replaceBackSlashesWithSlashes,
  startsWithWindowsDriveLetter,
  windowsFilePathToUrl,
} from "@jsenv/core/src/internal/windows_file_path_utils.js"
import {
  setJavaScriptSourceMappingUrl,
  setCssSourceMappingUrl,
  sourcemapToBase64Url,
} from "@jsenv/core/src/internal/sourcemap_utils.js"

import { generateCompilationAssetUrl } from "./compile_asset.js"
import { testFilePresence } from "./fs_optimized_for_cache.js"

const isWindows = process.platform === "win32"

export const asCompilationResult = async (
  { contentType, coverage, dependencies = [], code, map },
  {
    projectDirectoryUrl,
    jsenvRemoteDirectory,
    originalFileUrl,
    compiledFileUrl,
    sourcemapFileUrl,
    sourcemapEnabled = true,
    // removing sourcesContent from map decrease the sourceMap
    // it also means client have to fetch source from server (additional http request)
    // some client ignore sourcesContent property such as vscode-chrome-debugger
    // Because it's the most complex scenario and we want to ensure client is always able
    // to find source from the sourcemap, it's a good idea
    // to exclude sourcesContent from sourcemap.
    // However some ressource are abstract and it means additional http request for the browser.
    // For these reasons it's simpler to keep source content in sourcemap.
    sourcemapExcludeSources = false,
    sourcemapMethod = "comment", // "comment", "inline"
    originalFileContent,
  },
) => {
  if (typeof contentType !== "string") {
    throw new TypeError(`contentType must be a string, got ${contentType}`)
  }
  if (typeof projectDirectoryUrl !== "string") {
    throw new TypeError(
      `projectDirectoryUrl must be a string, got ${projectDirectoryUrl}`,
    )
  }
  if (typeof originalFileContent !== "string") {
    throw new TypeError(
      `originalFileContent must be a string, got ${originalFileContent}`,
    )
  }
  if (typeof originalFileUrl !== "string") {
    throw new TypeError(
      `originalFileUrl must be a string, got ${originalFileUrl}`,
    )
  }
  if (typeof compiledFileUrl !== "string") {
    throw new TypeError(
      `compiledFileUrl must be a string, got ${compiledFileUrl}`,
    )
  }
  if (typeof sourcemapFileUrl !== "string") {
    throw new TypeError(
      `sourcemapFileUrl must be a string, got ${sourcemapFileUrl}`,
    )
  }

  const sources = []
  const sourcesContent = []
  const assets = []
  const assetsContent = []
  const addSource = ({ url, content }) => {
    sources.push(url)
    sourcesContent.push(content)
  }
  const addAsset = ({ url, content }) => {
    assets.push(url)
    assetsContent.push(content)
  }

  let output = code
  if (sourcemapEnabled && map) {
    if (map.sources.length === 0) {
      // may happen in some cases where babel returns a wrong sourcemap
      // there is at least one case where it happens
      // a file with only import './whatever.js' inside
      addSource({
        url: originalFileUrl,
        content: originalFileContent,
      })
    } else {
      map.sources.forEach((source, index) => {
        const sourceFileUrl = resolveSourceFile({
          source,
          sourcemapFileUrl,
          originalFileUrl,
          compiledFileUrl,
          projectDirectoryUrl,
        })
        if (sourceFileUrl) {
          // In case the file comes from a remote url
          // we prefer to consider remote url as the real source for this code
          map.sources[index] =
            jsenvRemoteDirectory &&
            jsenvRemoteDirectory.isFileUrlForRemoteUrl(sourceFileUrl)
              ? jsenvRemoteDirectory.remoteUrlFromFileUrl(sourceFileUrl)
              : urlToRelativeUrl(sourceFileUrl, sourcemapFileUrl)
          sources[index] = sourceFileUrl
        }
      })
      if (sources.length === 0) {
        // happens when sourcemap is generated by webpack and looks like
        // webpack://Package./src/file.js
        // in that case we'll don't know how to find the source file
        addSource({
          url: originalFileUrl,
          content: originalFileContent,
        })
      }
      await Promise.all(
        sources.map(async (sourceUrl, index) => {
          const contentFromSourcemap = map.sourcesContent
            ? map.sourcesContent[index]
            : null
          if (contentFromSourcemap) {
            sourcesContent[index] = contentFromSourcemap
          } else {
            const contentFromFile = await readFile(sourceUrl)
            sourcesContent[index] = contentFromFile
          }
        }),
      )
    }

    if (sourcemapExcludeSources) {
      delete map.sourcesContent
    }
    // we don't need sourceRoot because our path are relative or absolute to the current location
    // we could comment this line because it is not set by babel because not passed during transform
    delete map.sourceRoot

    const setSourceMappingUrl =
      contentType === "application/javascript"
        ? setJavaScriptSourceMappingUrl
        : setCssSourceMappingUrl

    if (sourcemapMethod === "inline") {
      output = setSourceMappingUrl(output, sourcemapToBase64Url(map))
    } else if (sourcemapMethod === "comment") {
      const sourcemapFileRelativePathForModule = urlToRelativeUrl(
        sourcemapFileUrl,
        compiledFileUrl,
      )
      output = setSourceMappingUrl(output, sourcemapFileRelativePathForModule)
      addAsset({
        url: sourcemapFileUrl,
        content: stringifyMap(map),
      })
    }
  } else {
    addSource({
      url: originalFileUrl,
      content: originalFileContent,
    })
  }

  if (coverage) {
    const coverageAssetFileUrl = generateCompilationAssetUrl(
      compiledFileUrl,
      "coverage.json",
    )
    addAsset({
      url: coverageAssetFileUrl,
      content: stringifyCoverage(coverage),
    })
  }

  return {
    contentType,
    compiledSource: output,
    sourcemap: map,
    sources,
    sourcesContent,
    assets,
    assetsContent,
    dependencies,
  }
}

const resolveSourceFile = ({
  source,
  sourcemapFileUrl,
  originalFileUrl,
  compiledFileUrl,
  projectDirectoryUrl,
}) => {
  const sourceFileUrl = resolveSourceUrl({ source, sourcemapFileUrl })
  if (!urlIsInsideOf(sourceFileUrl, projectDirectoryUrl)) {
    // do not track dependency outside project
    // it means cache stays valid for those external sources
    return null
  }
  const fileFound = testFilePresence(sourceFileUrl)
  if (fileFound) {
    return sourceFileUrl
  }
  // prefer original source file
  const relativeUrl = urlToRelativeUrl(sourceFileUrl, compiledFileUrl)
  const originalSourceUrl = resolveUrl(relativeUrl, originalFileUrl)
  return originalSourceUrl
}

const resolveSourceUrl = ({ source, sourcemapFileUrl }) => {
  if (isWindows) {
    // we can receive:
    // - "C:/Directory/file.js" path from babel
    // - relative path like "directory\file.js" (-> we replace \ with slash)
    if (startsWithWindowsDriveLetter(source)) {
      return windowsFilePathToUrl(source)
    }
    const url = resolveUrl(
      replaceBackSlashesWithSlashes(source),
      sourcemapFileUrl,
    )
    return ensureWindowsDriveLetter(url, sourcemapFileUrl)
  }
  return resolveUrl(source, sourcemapFileUrl)
}

const stringifyMap = (object) => JSON.stringify(object, null, "  ")

const stringifyCoverage = (object) => JSON.stringify(object, null, "  ")
