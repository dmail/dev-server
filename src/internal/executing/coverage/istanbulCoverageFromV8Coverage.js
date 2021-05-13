import { urlToFileSystemPath } from "@jsenv/util"

import { require } from "@jsenv/core/src/internal/require.js"

import { composeIstanbulCoverages } from "./composeIstanbulCoverages.js"

const v8ToIstanbul = require("v8-to-istanbul")

export const istanbulCoverageFromV8Coverage = async (v8Coverage) => {
  const istanbulCoverages = await Promise.all(
    v8Coverage.result.map(async (fileV8Coverage) => {
      const sources = sourcesFromSourceMapCache(fileV8Coverage.url, v8Coverage["source-map-cache"])
      const path = urlToFileSystemPath(fileV8Coverage.url)

      const converter = v8ToIstanbul(
        path,
        // wrapperLength is undefined we don't need it
        // https://github.com/istanbuljs/v8-to-istanbul/blob/2b54bc97c5edf8a37b39a171ec29134ba9bfd532/lib/v8-to-istanbul.js#L27
        undefined,
        sources,
      )
      await converter.load()

      converter.applyCoverage(fileV8Coverage.functions)
      const istanbulCoverage = converter.toIstanbul()
      return istanbulCoverage
    }),
  )

  const istanbulCoverageComposed = composeIstanbulCoverages(istanbulCoverages)
  return markCoverageAsConverted(istanbulCoverageComposed)
}

const markCoverageAsConverted = (istanbulCoverage) => {
  const istanbulCoverageMarked = {}
  Object.keys(istanbulCoverage).forEach((key) => {
    istanbulCoverageMarked[key] = {
      ...istanbulCoverage[key],
      fromV8: true,
    }
  })
  return istanbulCoverageMarked
}

const sourcesFromSourceMapCache = (url, sourceMapCache) => {
  const sourceMapAndLineLengths = sourceMapCache[url]
  if (!sourceMapAndLineLengths) {
    return {}
  }

  const { data, lineLengths } = sourceMapAndLineLengths
  // See: https://github.com/nodejs/node/pull/34305
  if (!data) {
    return undefined
  }

  const sources = {
    sourcemap: data,
    ...(lineLengths ? { source: sourcesFromLineLengths(lineLengths) } : {}),
  }
  return sources
}

const sourcesFromLineLengths = (lineLengths) => {
  let source = ""
  lineLengths.forEach((length) => {
    source += `${"".padEnd(length, ".")}\n`
  })
  return source
}
