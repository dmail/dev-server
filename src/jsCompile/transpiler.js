import path from "path"
import { transformAsync, transformFromAstAsync } from "@babel/core"
import transformModulesSystemJs from "../babel-plugin-transform-modules-systemjs/index.js"
import { regexpEscape } from "../stringHelper.js"
import {
  babelPluginDescriptionToBabelPluginArray,
  defaultBabelPluginArray,
} from "./babelPluginDescriptionToBabelPluginArray.js"

export const transpiler = async ({
  input,
  filename,
  filenameRelative,
  inputAst,
  inputMap,
  babelPluginDescription,
  remap,
}) => {
  const transformModuleIntoSystemFormat = true
  const allowTopLevelAwait = false

  let asyncPluginName
  if ("transform-async-to-promises" in babelPluginDescription) {
    asyncPluginName = "transform-async-to-promises"
  } else if ("transform-async-to-generator" in babelPluginDescription) {
    asyncPluginName = "transform-async-to-generator"
  } else {
    asyncPluginName = ""
  }

  // https://babeljs.io/docs/en/options
  const options = {
    filename: filename || filenameRelative,
    filenameRelative,
    inputSourceMap: inputMap,
    babelrc: false, // trust only these options, do not read any babelrc config file
    ast: true,
    sourceMaps: remap,
    sourceFileName: filenameRelative,
    // https://babeljs.io/docs/en/options#parseropts
    parserOpts: {
      allowAwaitOutsideFunction: allowTopLevelAwait,
    },
  }

  if (transformModuleIntoSystemFormat && allowTopLevelAwait && asyncPluginName) {
    const babelPluginDescriptionWithoutAsyncPlugin = {}
    Object.keys(babelPluginDescription).forEach((name) => {
      if (name !== asyncPluginName)
        babelPluginDescriptionWithoutAsyncPlugin[name] = babelPluginDescription[name]
    })

    // put body inside something like (async () => {})()
    const result = await transpile({
      ast: inputAst,
      code: input,
      options: {
        ...options,
        plugins: [
          ...babelPluginDescriptionToBabelPluginArray(babelPluginDescriptionWithoutAsyncPlugin),
          [transformModulesSystemJs, { topLevelAwait: true }],
        ],
      },
    })

    // we have to do this to transpile top level await
    // and the async keyword that are now under a function
    // of the systemjs format

    // https://github.com/babel/babel/blob/eac4c5bc17133c2857f2c94c1a6a8643e3b547a7/packages/babel-core/src/transformation/file/generate.js#L57
    // https://github.com/babel/babel/blob/090c364a90fe73d36a30707fc612ce037bdbbb24/packages/babel-core/src/transformation/file/merge-map.js#L6
    const finalResult = await transpile({
      // ast: result.ast,
      code: result.code,
      options: {
        ...options,
        inputSourceMap: result.map,
        plugins: [...defaultBabelPluginArray, babelPluginDescription[asyncPluginName]],
      },
    })

    return finalResult
  }

  const babelPluginArray = [
    ...babelPluginDescriptionToBabelPluginArray(babelPluginDescription),
    [transformModulesSystemJs, { topLevelAwait: allowTopLevelAwait }],
  ]
  return transpile({
    ast: inputAst,
    code: input,
    options: {
      ...options,
      plugins: babelPluginArray,
    },
  })
}

const transpile = async ({ ast, code, options }) => {
  try {
    if (ast) {
      return await transformFromAstAsync(ast, code, options)
    }
    return await transformAsync(code, options)
  } catch (error) {
    if (error && error.code === "BABEL_PARSE_ERROR") {
      throw babelParseErrorToParseError(error, options)
    }
    throw error
  }
}

const babelParseErrorToParseError = (babelParseError, { filename, filenameRelative }) => {
  const parseError = new Error()

  parseError.name = "PARSE_ERROR"
  parseError.message = transformBabelParseErrorMessage(
    babelParseError.message,
    filename,
    filenameRelative,
  )
  parseError.fileName = filenameRelative
  parseError.lineNumber = babelParseError.loc.line
  parseError.columnNumber = babelParseError.loc.column
  // parseError.stack = error.stack
  return parseError
}

const transformBabelParseErrorMessage = (babelParseErrorMessage, filename, relativeName) => {
  // the babelParseErrorMessage looks somehow like that:
  /*
  `${absoluteFilename}: Unexpected token(${lineNumber}:${columnNumber}})

    ${lineNumber - 1} | ${sourceForThatLine}
  > ${lineNumber} | ${sourceForThatLine}
    | ^`
  */
  // and the idea is to replace absoluteFilename by something relative

  const filenameAbsolute = path.sep === "/" ? filename : filename.replace(/\//g, "\\")
  const filenameAbsoluteRegexp = new RegExp(regexpEscape(filenameAbsolute), "gi")
  const filenameRelative = `${relativeName}`.replace(/\\/g, "/")
  const parseErrorMessage = babelParseErrorMessage.replace(filenameAbsoluteRegexp, filenameRelative)
  return parseErrorMessage
}
