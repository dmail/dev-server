import { normalizePathname } from "@jsenv/module-resolution"
import { nodeScoring } from "../../group-description/index.js"
import { bundlePlatform } from "../bundlePlatform.js"
import { computeRollupOptionsWithoutBalancing } from "./computeRollupOptionsWithoutBalancing.js"
import { computeRollupOptionsWithBalancing } from "./computeRollupOptionsWithBalancing.js"
import { computeRollupOptionsForBalancer } from "./computeRollupOptionsForBalancer.js"

export const bundleNode = async ({
  importMap,
  projectFolder,
  into,
  entryPointsDescription,
  babelPluginDescription,
  compileGroupCount = 1,
  platformScoring = nodeScoring,
  verbose,
  minify = true,
}) => {
  projectFolder = normalizePathname(projectFolder)
  return await bundlePlatform({
    entryPointsDescription,
    projectFolder,
    into,
    babelPluginDescription,
    compileGroupCount,
    platformScoring,
    verbose,
    computeRollupOptionsWithoutBalancing: (context) =>
      computeRollupOptionsWithoutBalancing({
        importMap,
        projectFolder,
        into,
        entryPointsDescription,
        babelPluginDescription,
        minify,
        ...context,
      }),
    computeRollupOptionsWithBalancing: (context) =>
      computeRollupOptionsWithBalancing({
        importMap,
        projectFolder,
        into,
        entryPointsDescription,
        babelPluginDescription,
        minify,
        ...context,
      }),
    computeRollupOptionsForBalancer: (context) =>
      computeRollupOptionsForBalancer({
        importMap,
        projectFolder,
        into,
        babelPluginDescription,
        minify,
        ...context,
      }),
  })
}
