import createNodeResolveRollupPlugin from "rollup-plugin-node-resolve"
import { uneval } from "@dmail/uneval"
import { projectFolder as selfProjectFolder } from "../../projectFolder.js"
import { groupToBabelPluginDescription } from "../../group-description/index.js"
import { babelPluginDescriptionToRollupPlugin } from "../babelPluginDescriptionToRollupPlugin.js"

export const computeRollupOptionsForBalancer = ({
  projectFolder,
  into,
  globalName,
  babelPluginDescription,
  groupDescription,
  entryName,
  entryFilenameRelative,
  log,
}) => {
  const balancerOptionSource = generateBalancerOptionsSource({
    globalName,
    groupDescription,
    entryFilenameRelative,
  })

  const browserBalancerRollupPlugin = {
    name: "browser-balancer",
    resolveId: (importee, importer) => {
      // it's important to keep the extension so that
      // rollup-plugin-babel transpiles bundle-browser-options.js too
      if (importee === "bundle-browser-options.js") {
        return "bundle-browser-options.js"
      }
      if (!importer) return importee
      return null
    },

    load: async (id) => {
      if (id === "bundle-browser-options.js") {
        return balancerOptionSource
      }
      return null
    },
  }

  const nodeResolveRollupPlugin = createNodeResolveRollupPlugin({
    module: true,
  })

  const otherwiseBabelPluginDescription = groupToBabelPluginDescription(
    groupDescription.otherwise,
    babelPluginDescription,
  )
  const babelRollupPlugin = babelPluginDescriptionToRollupPlugin({
    babelPluginDescription: otherwiseBabelPluginDescription,
  })

  const file = `${projectFolder}/${into}/${entryFilenameRelative}`

  log(`
bundle balancer file for browser
entryName: ${entryName}
babelPluginNameArray: ${Object.keys(otherwiseBabelPluginDescription)}
file: ${file}
`)

  return {
    rollupParseOptions: {
      input: `${selfProjectFolder}/src/bundle/browser/browser-balancer-template.js`,
      plugins: [browserBalancerRollupPlugin, nodeResolveRollupPlugin, babelRollupPlugin],
    },
    rollupGenerateOptions: {
      file,
      format: "iife",
      name: null,
      sourcemap: true,
      sourcemapExcludeSources: true,
    },
  }
}

const generateBalancerOptionsSource = ({ globalName, entryFilenameRelative, groupDescription }) => {
  return `
export const globalName = ${uneval(globalName)}
export const entryFilenameRelative = ${uneval(entryFilenameRelative)}
export const groupDescription = ${uneval(groupDescription)}
`
}
