import { createOperation } from "@jsenv/cancellation"
import { resolveUrl, urlToFileSystemPath, readFile } from "@jsenv/filesystem"

import { getMinimalBabelPluginArray } from "../../minimalBabelPluginArray.js"
import { babelPluginInstrument } from "./babel-plugin-instrument.js"
import { createEmptyCoverage } from "./createEmptyCoverage.js"

export const relativeUrlToEmptyCoverage = async (
  relativeUrl,
  { cancellationToken, projectDirectoryUrl, babelPluginMap },
) => {
  const { transformAsync } = await import("@babel/core")

  const fileUrl = resolveUrl(relativeUrl, projectDirectoryUrl)
  const source = await createOperation({
    cancellationToken,
    start: () => readFile(fileUrl),
  })

  const plugins = [...getMinimalBabelPluginArray()]
  Object.keys(babelPluginMap).forEach((babelPluginName) => {
    if (babelPluginName !== "transform-instrument") {
      plugins.push(babelPluginMap[babelPluginName])
    }
  })
  plugins.push([babelPluginInstrument, { projectDirectoryUrl }])

  try {
    const { metadata } = await createOperation({
      cancellationToken,
      start: () =>
        transformAsync(source, {
          filename: urlToFileSystemPath(fileUrl),
          filenameRelative: relativeUrl,
          configFile: false,
          babelrc: false,
          parserOpts: {
            allowAwaitOutsideFunction: true,
          },
          plugins,
        }),
    })

    const { coverage } = metadata
    if (!coverage) {
      throw new Error(`missing coverage for file`)
    }

    // https://github.com/gotwarlost/istanbul/blob/bc84c315271a5dd4d39bcefc5925cfb61a3d174a/lib/command/common/run-with-cover.js#L229
    Object.keys(coverage.s).forEach(function (key) {
      coverage.s[key] = 0
    })

    return coverage
  } catch (e) {
    if (e && e.code === "BABEL_PARSE_ERROR") {
      // return an empty coverage for that file when
      // it contains a syntax error
      return createEmptyCoverage(relativeUrl)
    }
    throw e
  }
}
