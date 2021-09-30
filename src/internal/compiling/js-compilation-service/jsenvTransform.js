/* eslint-disable import/max-dependencies */
import { urlToFileSystemPath } from "@jsenv/filesystem"

import { require } from "@jsenv/core/src/internal/require.js"
import { getMinimalBabelPluginArray } from "@jsenv/core/src/internal/minimalBabelPluginArray.js"
import { babelPluginTransformImportMeta } from "@jsenv/core/src/internal/babel-plugin-transform-import-meta.js"

import { findAsyncPluginNameInBabelPluginMap } from "./findAsyncPluginNameInBabelPluginMap.js"
import { ansiToHTML } from "./ansiToHTML.js"
import { ensureRegeneratorRuntimeImportBabelPlugin } from "./ensureRegeneratorRuntimeImportBabelPlugin.js"
import { ensureGlobalThisImportBabelPlugin } from "./ensureGlobalThisImportBabelPlugin.js"
import { transformBabelHelperToImportBabelPlugin } from "./transformBabelHelperToImportBabelPlugin.js"
import { filePathToBabelHelperName } from "./babelHelper.js"

export const jsenvTransform = async ({
  code,
  map,
  ast, // optional
  url,
  relativeUrl, // optional

  babelPluginMap,
  moduleOutFormat,
  importMetaFormat,

  babelHelpersInjectionAsImport,
  allowTopLevelAwait,
  transformTopLevelAwait,
  transformGenerator,
  transformGlobalThis,
  regeneratorRuntimeImportPath,
  sourcemapEnabled,
}) => {
  const transformModulesSystemJs = require("@babel/plugin-transform-modules-systemjs")
  const proposalDynamicImport = require("@babel/plugin-proposal-dynamic-import")

  const inputPath = computeInputPath(url)

  // https://babeljs.io/docs/en/options
  const options = {
    filename: inputPath,
    filenameRelative: relativeUrl,
    inputSourceMap: map,
    configFile: false,
    babelrc: false, // trust only these options, do not read any babelrc config file
    ast: true,
    sourceMaps: sourcemapEnabled,
    sourceFileName: inputPath,
    // https://babeljs.io/docs/en/options#parseropts
    parserOpts: {
      allowAwaitOutsideFunction: allowTopLevelAwait,
    },
  }

  const babelHelperName = filePathToBabelHelperName(inputPath)
  // to prevent typeof circular dependency
  if (babelHelperName === "typeof") {
    const babelPluginMapWithoutTransformTypeOf = {}
    Object.keys(babelPluginMap).forEach((key) => {
      if (key !== "transform-typeof-symbol") {
        babelPluginMapWithoutTransformTypeOf[key] = babelPluginMap[key]
      }
    })
    babelPluginMap = babelPluginMapWithoutTransformTypeOf
  }

  if (transformGenerator) {
    babelPluginMap = {
      ...babelPluginMap,
      "ensure-regenerator-runtime-import": [
        ensureRegeneratorRuntimeImportBabelPlugin,
        {
          regeneratorRuntimeImportPath,
        },
      ],
    }
  }

  if (transformGlobalThis) {
    babelPluginMap = {
      ...babelPluginMap,
      "ensure-global-this-import": [ensureGlobalThisImportBabelPlugin],
    }
  }

  babelPluginMap = {
    "transform-import-meta": [
      babelPluginTransformImportMeta,
      {
        replaceImportMeta: (
          metaPropertyName,
          { replaceWithImport, replaceWithValue },
        ) => {
          if (metaPropertyName === "url") {
            if (importMetaFormat === "esmodule") {
              // keep native version
              return
            }
            if (importMetaFormat === "systemjs") {
              // systemjs will handle it
              return
            }
            if (importMetaFormat === "commonjs") {
              replaceWithImport({
                from: `@jsenv/core/helpers/import-meta/import-meta-url-commonjs.js`,
              })
              return
            }
            if (importMetaFormat === "global") {
              replaceWithImport({
                from: `@jsenv/core/helpers/import-meta/import-meta-url-global.js`,
              })
              return
            }
            return
          }

          if (metaPropertyName === "resolve") {
            if (importMetaFormat === "esmodule") {
              // keep native version
              return
            }
            if (importMetaFormat === "systemjs") {
              // systemjs will handle it
              return
            }
            if (importMetaFormat === "commonjs") {
              throw createParseError({
                message: `import.meta.resolve() not supported with commonjs format`,
              })
            }
            if (importMetaFormat === "global") {
              throw createParseError({
                message: `import.meta.resolve() not supported with global format`,
              })
            }
            return
          }

          replaceWithValue(undefined)
        },
      },
    ],
    ...babelPluginMap,
    ...(babelHelpersInjectionAsImport
      ? {
          "transform-babel-helpers-to-import": [
            transformBabelHelperToImportBabelPlugin,
          ],
        }
      : {}),
  }

  const asyncPluginName = findAsyncPluginNameInBabelPluginMap(babelPluginMap)

  if (
    moduleOutFormat === "systemjs" &&
    transformTopLevelAwait &&
    asyncPluginName
  ) {
    const babelPluginArrayWithoutAsync = []
    Object.keys(babelPluginMap).forEach((name) => {
      if (name !== asyncPluginName) {
        babelPluginArrayWithoutAsync.push(babelPluginMap[name])
      }
    })

    // put body inside something like (async () => {})()
    const result = await babelTransform({
      ast,
      code,
      options: {
        ...options,
        plugins: [
          ...getMinimalBabelPluginArray(),
          ...babelPluginArrayWithoutAsync,
          [proposalDynamicImport],
          [transformModulesSystemJs],
        ],
      },
    })

    // we need to retranspile the await keywords now wrapped
    // inside Systemjs function.
    // They are ignored, at least by transform-async-to-promises
    // see https://github.com/rpetrich/babel-plugin-transform-async-to-promises/issues/26

    const finalResult = await babelTransform({
      // ast: result.ast,
      code: result.code,
      options: {
        ...options,
        // about inputSourceMap see
        // https://github.com/babel/babel/blob/eac4c5bc17133c2857f2c94c1a6a8643e3b547a7/packages/babel-core/src/transformation/file/generate.js#L57
        // https://github.com/babel/babel/blob/090c364a90fe73d36a30707fc612ce037bdbbb24/packages/babel-core/src/transformation/file/merge-map.js#L6s
        inputSourceMap: result.map,
        plugins: [
          ...getMinimalBabelPluginArray(),
          babelPluginMap[asyncPluginName],
        ],
      },
    })

    return {
      ...result,
      ...finalResult,
      metadata: { ...result.metadata, ...finalResult.metadata },
    }
  }

  const babelPluginArray = [
    ...getMinimalBabelPluginArray(),
    ...Object.keys(babelPluginMap).map(
      (babelPluginName) => babelPluginMap[babelPluginName],
    ),
    ...(moduleOutFormat === "systemjs"
      ? [[proposalDynamicImport], [transformModulesSystemJs]]
      : []),
  ]
  const babelTransformReturnValue = await babelTransform({
    ast,
    code,
    options: {
      ...options,
      plugins: babelPluginArray,
    },
  })
  code = babelTransformReturnValue.code
  map = babelTransformReturnValue.map
  ast = babelTransformReturnValue.ast
  const { metadata } = babelTransformReturnValue
  return { code, map, metadata, ast }
}

const computeInputPath = (url) => {
  if (url.startsWith("file://")) {
    return urlToFileSystemPath(url)
  }
  return url
}

const babelTransform = async ({ ast, code, options }) => {
  const { transformAsync, transformFromAstAsync } = require("@babel/core")

  try {
    if (ast) {
      const result = await transformFromAstAsync(ast, code, options)
      return result
    }
    return await transformAsync(code, options)
  } catch (error) {
    if (error && error.code === "BABEL_PARSE_ERROR") {
      const message = error.message
      throw createParseError({
        message: message.replace(ansiRegex, ""),
        messageHTML: ansiToHTML(message),
        filename: options.filename,
        lineNumber: error.loc.line,
        columnNumber: error.loc.column,
      })
    }
    throw error
  }
}

const pattern = [
  "[\\u001B\\u009B][[\\]()#;?]*(?:(?:(?:[a-zA-Z\\d]*(?:;[-a-zA-Z\\d\\/#&.:=?%@~_]*)*)?\\u0007)",
  "(?:(?:\\d{1,4}(?:;\\d{0,4})*)?[\\dA-PR-TZcf-ntqry=><~]))",
].join("|")
const ansiRegex = new RegExp(pattern, "g")

const createParseError = (data) => {
  const { message } = data
  const parseError = new Error(message)
  parseError.code = "PARSE_ERROR"
  parseError.data = data

  return parseError
}
