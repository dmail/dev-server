import { groupToBabelPluginDescription } from "../../group-description/index.js"
import { createJsenvRollupPlugin } from "../createJsenvRollupPlugin.js"
import { babelPluginDescriptionToRollupPlugin } from "../babelPluginDescriptionToRollupPlugin.js"

export const computeRollupOptionsWithBalancing = ({
  cancellationToken,
  importMap,
  projectFolder,
  into,
  entryPointsDescription,
  babelPluginDescription,
  groupDescription,
  compileId,
  log,
}) => {
  const dir = `${projectFolder}/${into}/${compileId}`

  const groupBabelPluginDescription = groupToBabelPluginDescription(
    groupDescription[compileId],
    babelPluginDescription,
  )

  const jsenvRollupPlugin = createJsenvRollupPlugin({
    cancellationToken,
    importMap,
    projectFolder,
  })

  const babelRollupPlugin = babelPluginDescriptionToRollupPlugin({
    babelPluginDescription: groupBabelPluginDescription,
  })

  log(`
bundle entry points for node with balancing.
compileId: ${compileId}
entryNameArray: ${Object.keys(entryPointsDescription)}
babelPluginNameArray: ${Object.keys(groupBabelPluginDescription)}
dir: ${dir}
`)

  return {
    rollupParseOptions: {
      input: entryPointsDescription,
      plugins: [babelRollupPlugin, jsenvRollupPlugin],
    },
    rollupGenerateOptions: {
      dir,
      format: "cjs",
      sourcemap: true,
      sourceMapExcludeSources: false,
    },
  }
}
