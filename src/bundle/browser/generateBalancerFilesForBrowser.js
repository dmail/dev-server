import createBabelRollupPlugin from "rollup-plugin-babel"
import createNodeResolveRollupPlugin from "rollup-plugin-node-resolve"
import { uneval } from "@dmail/uneval"
import { createOperation } from "@dmail/cancellation"
import { fileWrite } from "@dmail/helper"
import { projectFolder as selfProjectFolder } from "../../projectFolder.js"
import { compileMapToBabelPluginArray } from "../compileMapToBabelPluginArray.js"
import { writeRollupBundle } from "../writeRollupBundle.js"

export const generateBalancerFilesForBrowser = async ({
  cancellationToken,
  projectFolder,
  into,
  entryPointsDescription,
  globalName,
  compileMap,
  compileParamMap,
  rollupOptions,
}) => {
  return Promise.all(
    Object.keys(entryPointsDescription).map((entryName) => {
      const entryFile = `${entryName}.js`

      return Promise.all([
        generateBalancerFileForBrowser({
          cancellationToken,
          projectFolder,
          into,
          entryFile,
          globalName,
          compileMap,
          compileParamMap,
          rollupOptions,
        }),
        generateBalancerPage({
          cancellationToken,
          projectFolder,
          into,
          entryName,
          entryFile,
          globalName,
        }),
      ])
    }),
  )
}

const generateBalancerFileForBrowser = async ({
  cancellationToken,
  projectFolder,
  into,
  entryFile,
  compileMap,
  compileParamMap,
  rollupOptions,
}) => {
  const bundleBrowserOptionsModuleSource = `
export const compileMap = ${uneval(compileMap)}
export const entryFile = ${uneval(entryFile)}
`

  const jsenvRollupPlugin = {
    name: "jsenv-generate-browser-main",
    resolveId: (importee, importer) => {
      if (importee === "bundle-browser-options") {
        return "bundle-browser-options"
      }
      if (!importer) return importee
      return null
    },

    load: async (id) => {
      if (id === "bundle-browser-options") {
        return bundleBrowserOptionsModuleSource
      }
      return null
    },
  }

  const nodeResolveRollupPlugin = createNodeResolveRollupPlugin({
    module: true,
  })

  // compile using the worst possible scenario
  const compilePluginMap = compileParamMap.otherwise.babelPluginDescription
  const babelPluginArray = compileMapToBabelPluginArray(compilePluginMap)

  const babelRollupPlugin = createBabelRollupPlugin({
    babelrc: false,
    plugins: babelPluginArray,
  })

  return writeRollupBundle({
    cancellationToken,
    inputOptions: {
      input: `${selfProjectFolder}/src/bundle/browser/browser-balancer-template.js`,
      plugins: [jsenvRollupPlugin, nodeResolveRollupPlugin, babelRollupPlugin],
    },
    outputOptions: {
      file: `${projectFolder}/${into}/${entryFile}`,
      sourcemap: true,
      ...rollupOptions,
    },
  })
}

const generateBalancerPage = async ({
  cancellationToken,
  projectFolder,
  into,
  entryFile,
  entryName,
}) => {
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

  await createOperation({
    cancellationToken,
    start: () => fileWrite(`${projectFolder}/${into}/${entryName}.html`, html),
  })
}
