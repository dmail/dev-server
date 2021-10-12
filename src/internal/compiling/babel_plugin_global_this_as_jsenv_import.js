import { require } from "../require.js"

export const babelPluginGlobalThisAsJsenvImport = (api, options) => {
  const { addSideEffect } = require("@babel/helper-module-imports")

  api.assertVersion(7)

  const {
    globalThisIdentifierName = "globalThis",
    globalThisImportPath = "@jsenv/core/helpers/global-this/global-this.js",
  } = options

  return {
    name: "global-this-as-jsenv-import",
    visitor: {
      Identifier(path, opts) {
        const { filename } = opts
        const filepathname = filename.replace(/\\/g, "/")
        if (filepathname.endsWith("/helpers/global-this/global-this.js")) {
          return
        }

        const { node } = path
        // we should do this once, tree shaking will remote it but still
        if (node.name === globalThisIdentifierName) {
          addSideEffect(
            path.scope.getProgramParent().path,
            globalThisImportPath,
          )
        }
      },
    },
  }
}
