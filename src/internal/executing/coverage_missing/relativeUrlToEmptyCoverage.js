import { resolveUrl, urlToFileSystemPath, readFile } from "@jsenv/filesystem"
import { Abort } from "@jsenv/abort"

import {
  babelPluginsFromBabelPluginMap,
  getMinimalBabelPluginMap,
} from "@jsenv/core/src/internal/compiling/babel_plugins.js"
import { babelPluginInstrument } from "../coverage/babel_plugin_instrument.js"
import { createEmptyCoverage } from "./createEmptyCoverage.js"

export const relativeUrlToEmptyCoverage = async (
  relativeUrl,
  { signal, projectDirectoryUrl, babelPluginMap },
) => {
  const operation = Abort.startOperation()
  operation.addAbortSignal(signal)

  try {
    const { transformAsync } = await import("@babel/core")
    const fileUrl = resolveUrl(relativeUrl, projectDirectoryUrl)
    const source = await readFile(fileUrl)

    babelPluginMap = {
      ...getMinimalBabelPluginMap(),
      ...babelPluginMap,
      "transform-instrument": [babelPluginInstrument, { projectDirectoryUrl }],
    }

    operation.throwIfAborted()
    const { metadata } = await transformAsync(source, {
      filename: urlToFileSystemPath(fileUrl),
      filenameRelative: relativeUrl,
      configFile: false,
      babelrc: false,
      ast: true,
      parserOpts: {
        allowAwaitOutsideFunction: true,
      },
      plugins: babelPluginsFromBabelPluginMap(babelPluginMap),
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
  } finally {
    await operation.end()
  }
}
