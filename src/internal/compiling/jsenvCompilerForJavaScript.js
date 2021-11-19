import { readFile } from "@jsenv/filesystem"

import { transformJs } from "./js-compilation-service/transformJs.js"
import { transformResultToCompilationResult } from "./transformResultToCompilationResult.js"

export const compileJavascript = async ({
  url,
  compiledUrl,
  projectDirectoryUrl,

  babelPluginMap,
  transformTopLevelAwait,
  moduleOutFormat,
  importMetaFormat,

  sourcemapExcludeSources,
  sourcemapMethod,
}) => {
  const code = await readFile(url)
  const transformResult = await transformJs({
    code,
    url,
    compiledUrl,
    projectDirectoryUrl,

    babelPluginMap,
    transformTopLevelAwait,
    moduleOutFormat,
    importMetaFormat,
  })

  return transformResultToCompilationResult(
    {
      contentType: "application/javascript",
      code: transformResult.code,
      map: transformResult.map,
      metadata: transformResult.metadata,
    },
    {
      projectDirectoryUrl,
      originalFileContent: code,
      originalFileUrl: url,
      compiledFileUrl: compiledUrl,
      // sourcemap are not inside the asset folder because
      // of https://github.com/microsoft/vscode-chrome-debug-core/issues/544
      sourcemapFileUrl: `${compiledUrl}.map`,
      sourcemapExcludeSources,
      sourcemapMethod,
    },
  )
}
