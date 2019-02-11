import { rollup } from "rollup"
import createRollupBabelPlugin from "rollup-plugin-babel"
import { resolveImport } from "@jsenv/module-resolution"
import { uneval } from "@dmail/uneval"
import { fileWrite } from "@dmail/helper"
import { localRoot as selfRoot } from "../../localRoot.js"

export const generateBrowserEntryFiles = async ({
  localRoot,
  bundleInto,
  entryPointObject,
  globalName,
  compileMap,
  compileParamMap,
  rollupOptions,
  experimentalExplicitNodeModule,
}) => {
  if (typeof globalName !== "string")
    throw new TypeError(`bundleMain expect globalName to be a string, got ${globalName}`)

  return Promise.all(
    Object.keys(entryPointObject).map((entryName) => {
      const entryFile = `${entryName}.js`

      return Promise.all([
        generateEntryFile({
          localRoot,
          bundleInto,
          entryFile,
          globalName,
          compileMap,
          compileParamMap,
          rollupOptions,
          experimentalExplicitNodeModule,
        }),
        generateEntryPage({
          localRoot,
          bundleInto,
          entryName,
          entryFile,
          globalName,
        }),
      ])
    }),
  )
}

const generateEntryFile = async ({
  localRoot,
  bundleInto,
  entryFile,
  compileMap,
  compileParamMap,
  rollupOptions,
  experimentalExplicitNodeModule,
}) => {
  const bundleBrowserOptionsModuleSource = `
export const compileMap = ${uneval(compileMap)}
export const entryFile = ${uneval(entryFile)}
`

  const rollupJsenvPlugin = {
    name: "jsenv-generate-browser-main",
    resolveId: (importee, importer) => {
      if (importee === "bundle-browser-options") {
        return "bundle-browser-options"
      }
      if (!importer) return importee
      // todo: check with an http/https import how rollup behaves with them?
      return resolveImport({
        moduleSpecifier: importee,
        file: importer,
        root: localRoot,
        useNodeModuleResolutionOnRelative: !experimentalExplicitNodeModule,
        useNodeModuleResolutionInsideDedicatedFolder: experimentalExplicitNodeModule,
      })
    },

    load: async (id) => {
      if (id === "bundle-browser-options") {
        return bundleBrowserOptionsModuleSource
      }
      return null
    },
  }

  // compile using the wors possible scenario
  const compilePluginMap = compileParamMap.otherwise.pluginMap
  const babelPlugins = Object.keys(compilePluginMap).map((name) => compilePluginMap[name])

  const rollupBabelPlugin = createRollupBabelPlugin({
    babelrc: false,
    plugins: babelPlugins,
  })

  const options = {
    input: `${selfRoot}/src/bundle/browser/entry-template.js`,
    plugins: [rollupJsenvPlugin, rollupBabelPlugin],
  }

  const rollupBundle = await rollup(options)
  await rollupBundle.write({
    file: `${localRoot}/${bundleInto}/${entryFile}`,
    sourcemap: true,
    ...rollupOptions,
  })
}

const generateEntryPage = async ({ localRoot, bundleInto, entryFile, entryName }) => {
  const html = `<!doctype html>

<head>
  <title>Untitled</title>
  <meta charset="utf-8" />
</head>

<body>
  <main></main>
  <script src="./${entryFile}"></script>
</body>

</html>`

  await fileWrite(`${localRoot}/${bundleInto}/${entryName}.html`, html)
}
