// we could inline a worker by doing
// var blob = new Blob(code, { type: 'text/javascript' })
// window.URL.createObjectURL(blob)

import { readFileSync } from "node:fs"
import { urlToFileSystemPath } from "@jsenv/filesystem"
import { createDetailedMessage } from "@jsenv/logger"

import { babelPluginInlineWorkerImports } from "./babel_plugin_inline_worker_imports.js"

export const transformWorker = async ({ url, code, map }) => {
  const { transformSync } = await import("@babel/core")

  const transformResult = transformSync(code, {
    filename: urlToFileSystemPath(url),
    configFile: false,
    babelrc: false, // trust only these options, do not read any babelrc config file
    ast: false,
    inputSourceMap: map,
    sourceMaps: true,
    // sourceFileName: scriptPath,
    plugins: [
      [
        babelPluginInlineWorkerImports,
        {
          readImportedScript: readWorkerFile,
        },
      ],
    ],
  })
  code = transformResult.code
  map = transformResult.map
  return { code, map }
}

export const readWorkerFile = (url, importerUrl) => {
  const filePath = urlToFileSystemPath(url)
  try {
    const code = String(readFileSync(filePath))
    return code
  } catch (e) {
    if (e.code === "ENOENT") {
      if (importerUrl) {
        throw new Error(
          createDetailedMessage(`no file found for an import in a worker.`, {
            ["worker url"]: importerUrl,
            ["imported url"]: url,
          }),
        )
      }
      throw new Error(`no worker file at ${url}`)
    }
    throw e
  }
}
