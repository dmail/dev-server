import { createImportMetaBabelPlugin } from "./import-meta-babel-plugin.js"
import { createReplaceBabelHelperByNamedImportsBabelPlugin } from "./replace-babel-helper-by-named-imports-babel-plugin.js"
import { createForceImportsBabelPlugin } from "./force-imports.js"

export const createBundleBabelPluginMap = ({
  projectPathname,
  format,
  BABEL_HELPERS_RELATIVE_PATH,
}) => {
  const bundleBabelPluginMap = {}

  const forcedImportsBabelPlugin = createForceImportsBabelPlugin({
    projectPathname,
    sideEffectImportRelativePathArray: ["/src/bundling/jsenv-rollup-plugin/global-this.js"],
  })
  bundleBabelPluginMap["force-imports"] = [forcedImportsBabelPlugin]

  const replaceBabelHelperByNamedImportsBabelPlugin = createReplaceBabelHelperByNamedImportsBabelPlugin(
    {
      BABEL_HELPERS_PATH: BABEL_HELPERS_RELATIVE_PATH,
    },
  )
  bundleBabelPluginMap["replace-babel-helper-by-named-imports"] = [
    replaceBabelHelperByNamedImportsBabelPlugin,
  ]

  // why do I do this only for commonjs ?
  if (format === "commonjs") {
    // instead of replacing import by a raw object
    // it should be replaced with an import
    // so that rollup will prevent duplication
    // but it requires to rewrite how import-meta-babel-plugin works
    const importMetaBabelPlugin = createImportMetaBabelPlugin({
      importMetaSource: createCommonJsImportMetaSource(),
    })
    bundleBabelPluginMap["import-meta"] = [importMetaBabelPlugin]
  }

  return bundleBabelPluginMap
}

const createCommonJsImportMetaSource = () => `{
  url: "file://" + (__filename.indexOf("\\\\") === -1 ? __filename : "/" + __filename.replace(/\\\\/g, "/")),
  require: require
}`
