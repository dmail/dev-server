import {
  createConfig,
  createModuleOptions,
  createSyntaxOptions,
  mergeOptions,
} from "@dmail/shared-config/dist/babel"
import { transform, transformFromAst } from "babel-core"

export const transpiler = ({
  inputSource,
  inputSourceMap,
  inputAst,
  options,
  getSourceNameForSourceMap,
  getSourceLocationForSourceMap,
  ...rest
}) => {
  // the truth is that we don't support global, nor amd
  // I have to check if we could support cjs but maybe we don't even support this
  // at least we support the most important: inputFormat: "es" with outputFormat: "systemjs"
  // https://github.com/systemjs/systemjs/blob/master/src/format-helpers.js#L5
  // https://github.com/systemjs/babel-plugin-transform-global-system-wrapper/issues/1
  const moduleOptions = createModuleOptions({
    inputModuleFormat: "es",
    outputModuleFormat: "systemjs",
  })

  const remapOptions = options.remap
    ? {
        sourceMaps: true,
        sourceMapTarget: getSourceNameForSourceMap(rest),
        sourceFileName: getSourceLocationForSourceMap(rest),
      }
    : {
        sourceMaps: false,
      }

  const babelOptions = mergeOptions(moduleOptions, createSyntaxOptions(), remapOptions, {
    filename: rest.inputRelativeLocation,
    inputSourceMap,
    babelrc: false, // trust only these options, do not read any babelrc config file
    ast: true,
  })
  const babelConfig = createConfig(babelOptions)

  if (inputAst) {
    const { code, ast, map } = transformFromAst(inputAst, inputSource, babelConfig)
    return {
      outputSource: code,
      outputSourceMap: map,
      outputAst: ast,
    }
  }

  const { code, ast, map } = transform(inputSource, babelConfig)
  return {
    outputSource: code,
    outputSourceMap: map,
    outputAst: ast,
  }
}
