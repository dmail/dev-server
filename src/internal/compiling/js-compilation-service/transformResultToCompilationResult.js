import { basename } from "path"
import { hrefToPathname } from "@jsenv/href"
import { urlToRelativePath, resolveFileUrl } from "internal/urlUtils.js"
import { writeSourceMappingURL } from "internal/sourceMappingURLUtils.js"

export const transformResultToCompilationResult = (
  { code, map, metadata = {} },
  {
    source,
    sourceUrl,
    projectDirectoryUrl,
    remap = true,
    remapMethod = "comment", // 'comment', 'inline'
  },
) => {
  if (typeof source !== "string") {
    throw new TypeError(`source must be a string, got ${source}`)
  }
  if (typeof sourceUrl !== "string") {
    throw new TypeError(`sourceUrl must be a string, got ${sourceUrl}`)
  }
  if (typeof projectDirectoryUrl !== "string") {
    throw new TypeError(`projectDirectoryUrl must be a string, got ${projectDirectoryUrl}`)
  }

  const sources = []
  const sourcesContent = []
  const assets = []
  const assetsContent = []

  let output = code
  if (remap && map) {
    if (map.sources.length === 0) {
      // may happen in some cases where babel returns a wrong sourcemap
      // there is at least one case where it happens
      // a file with only import './whatever.js' inside
      sources.push(sourceUrlToSourceMapSource(sourceUrl, projectDirectoryUrl))
      sourcesContent.push(source)
    } else {
      map.sources = map.sources.map((source) => {
        const url = resolveFileUrl(source, sourceUrl)
        if (url.startsWith(projectDirectoryUrl)) {
          const sourceRelativePath = urlToRelativePath(url, projectDirectoryUrl)
          const sourceOriginRelative = `/${sourceRelativePath}`
          sources.push(sourceRelativePath)
          return sourceOriginRelative
        }

        sources.push(source)
        return source
      })

      if (map.sourcesContent) sourcesContent.push(...map.sourcesContent)
    }

    // removing sourcesContent from map decrease the sourceMap
    // it also means client have to fetch source from server (additional http request)
    // some client ignore sourcesContent property such as vscode-chrome-debugger
    // Because it's the most complex scenario and we want to ensure client is always able
    // to find source from the sourcemap, we explicitely delete nmap.sourcesContent to test this.
    delete map.sourcesContent

    // we don't need sourceRoot because our path are relative or absolute to the current location
    // we could comment this line because it is not set by babel because not passed during transform
    delete map.sourceRoot

    if (remapMethod === "inline") {
      const mapAsBase64 = new Buffer(JSON.stringify(map)).toString("base64")
      output = writeSourceMappingURL(
        output,
        `data:application/json;charset=utf-8;base64,${mapAsBase64}`,
      )
    } else if (remapMethod === "comment") {
      const sourceBasename = basename(hrefToPathname(sourceUrl))
      const sourceMapBasename = `${sourceBasename}.map`
      output = writeSourceMappingURL(output, `./${sourceBasename}__asset__/${sourceMapBasename}`)
      assets.push(sourceMapBasename)
      assetsContent.push(stringifyMap(map))
    }
  } else {
    sources.push(sourceUrlToSourceMapSource(sourceUrl, projectDirectoryUrl))
    sourcesContent.push(source)
  }

  const { coverage } = metadata
  if (coverage) {
    assets.push(`coverage.json`)
    assetsContent.push(stringifyCoverage(coverage))
  }

  return {
    compiledSource: output,
    contentType: "application/javascript",
    sources,
    sourcesContent,
    assets,
    assetsContent,
  }
}

const sourceUrlToSourceMapSource = (sourceUrl, projectDirectoryUrl) => {
  if (sourceUrl.startsWith(projectDirectoryUrl)) {
    return urlToRelativePath(sourceUrl, projectDirectoryUrl)
  }
  return sourceUrl
}

const stringifyMap = (object) => JSON.stringify(object, null, "  ")

const stringifyCoverage = (object) => JSON.stringify(object, null, "  ")
