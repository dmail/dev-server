import {
  normalizeStructuredMetaMap,
  urlToMeta,
  fileSystemPathToUrl,
} from "@jsenv/filesystem"

import { require } from "@jsenv/utils/require.js"
// https://github.com/istanbuljs/babel-plugin-istanbul/blob/321740f7b25d803f881466ea819d870f7ed6a254/src/index.js

export const babelPluginInstrument = (
  api,
  {
    rootDirectoryUrl,
    useInlineSourceMaps = false,
    coverageConfig = { "./**/*": true },
  },
) => {
  const { programVisitor } = require("istanbul-lib-instrument")

  const { types } = api

  const structuredMetaMapForCover = normalizeStructuredMetaMap(
    {
      cover: coverageConfig,
    },
    rootDirectoryUrl,
  )
  const shouldInstrument = (url) => {
    return urlToMeta({
      url,
      structuredMetaMap: structuredMetaMapForCover,
    }).cover
  }

  return {
    name: "transform-instrument",
    visitor: {
      Program: {
        enter(path) {
          const { file } = this
          const { opts } = file
          if (!opts.sourceFileName) {
            console.warn(
              `cannot instrument file when "sourceFileName" option is not set`,
            )
            return
          }
          const fileUrl = fileSystemPathToUrl(opts.sourceFileName)
          if (!shouldInstrument(fileUrl)) {
            return
          }

          this.__dv__ = null

          let inputSourceMap

          if (useInlineSourceMaps) {
            // https://github.com/istanbuljs/babel-plugin-istanbul/commit/a9e15643d249a2985e4387e4308022053b2cd0ad#diff-1fdf421c05c1140f6d71444ea2b27638R65
            inputSourceMap =
              opts.inputSourceMap || file.inputMap
                ? file.inputMap.sourcemap
                : null
          } else {
            inputSourceMap = opts.inputSourceMap
          }

          this.__dv__ = programVisitor(
            types,
            opts.filenameRelative || opts.filename,
            {
              coverageVariable: "__coverage__",
              inputSourceMap,
            },
          )
          this.__dv__.enter(path)
        },

        exit(path) {
          if (!this.__dv__) {
            return
          }
          const object = this.__dv__.exit(path)
          // object got two properties: fileCoverage and sourceMappingURL
          this.file.metadata.coverage = object.fileCoverage
        },
      },
    },
  }
}
