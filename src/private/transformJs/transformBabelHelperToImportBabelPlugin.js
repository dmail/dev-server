import { pathToFileUrl } from "../urlUtils.js"
import { babelHelperMap } from "../babelHelperMap.js"

// https://github.com/babel/babel/tree/master/packages/babel-helper-module-imports
const { addDefault } = import.meta.require("@babel/helper-module-imports")

// named import approach found here:
// https://github.com/rollup/rollup-plugin-babel/blob/18e4232a450f320f44c651aa8c495f21c74d59ac/src/helperPlugin.js#L1

// for reference this is how it's done to reference
// a global babel helper object instead of using
// a named import
// https://github.com/babel/babel/blob/99f4f6c3b03c7f3f67cf1b9f1a21b80cfd5b0224/packages/babel-plugin-external-helpers/src/index.js

export const transformBabelHelperToImportBabelPlugin = (api) => {
  api.assertVersion(7)

  return {
    pre: (file) => {
      const cachedHelpers = {}
      file.set("helperGenerator", (name) => {
        // the list of possible helpers name
        // https://github.com/babel/babel/blob/99f4f6c3b03c7f3f67cf1b9f1a21b80cfd5b0224/packages/babel-helpers/src/helpers.js#L13

        if (!file.availableHelper(name)) {
          return undefined
        }

        const filePath = file.opts.filename
        const babelHelperPath = babelHelperMap[name]

        if (babelHelperPath.startsWith("file://")) {
          const fileUrl = pathToFileUrl(filePath)
          if (fileUrl === babelHelperPath) {
            return undefined
          }
        } else if (searchPossibleBabelHelperNameInFilePath(filePath) === name) {
          return undefined
        }

        if (cachedHelpers[name]) {
          return cachedHelpers[name]
        }

        const helper = addDefault(file.path, babelHelperPath, { nameHint: `_${name}` })
        cachedHelpers[name] = helper
        return helper
      })
    },
  }
}

export const searchPossibleBabelHelperNameInFilePath = (filePath) => {
  const fileUrl = pathToFileUrl(filePath)
  const filePathname = fileUrl.slice("file://".length)

  const babelPathPart = "@jsenv/core/helpers/babel/"
  const babelPathPartIndex = filePathname.indexOf(babelPathPart)
  if (babelPathPartIndex === -1) return ""

  const after = filePathname.slice(babelPathPartIndex + babelPathPart.length)
  const helperName = after.slice(0, after.indexOf("/"))
  return helperName
}
