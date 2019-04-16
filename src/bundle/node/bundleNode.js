import { normalizePathname } from "/node_modules/@jsenv/module-resolution/index.js"
import { nodeVersionScoreMap } from "../../group-map/index.js"
import { bundlePlatform } from "../bundlePlatform.js"
import { computeRollupOptionsWithoutBalancing } from "./computeRollupOptionsWithoutBalancing.js"
import { computeRollupOptionsWithBalancing } from "./computeRollupOptionsWithBalancing.js"
import { computeRollupOptionsForBalancer } from "./computeRollupOptionsForBalancer.js"
import {
  BUNDLE_NODE_DEFAULT_IMPORT_MAP_FILENAME_RELATIVE,
  BUNDLE_NODE_DEFAULT_BUNDLE_INTO,
  BUNDLE_NODE_DEFAULT_ENTRY_POINT_MAP,
  BUNDLE_NODE_DEFAULT_BABEL_CONFIG_MAP,
} from "./bundle-node-constant.js"

export const bundleNode = async ({
  projectFolder,
  babelConfigMap = BUNDLE_NODE_DEFAULT_BABEL_CONFIG_MAP,
  importMapFilenameRelative = BUNDLE_NODE_DEFAULT_IMPORT_MAP_FILENAME_RELATIVE,
  inlineSpecifierMap = {},
  into = BUNDLE_NODE_DEFAULT_BUNDLE_INTO,
  entryPointMap = BUNDLE_NODE_DEFAULT_ENTRY_POINT_MAP,
  compileGroupCount = 2,
  versionScoreMap = nodeVersionScoreMap,
  verbose,
  minify = false,
  throwUnhandled = true,
  logBundleFilePaths = true,
}) => {
  projectFolder = normalizePathname(projectFolder)
  const promise = bundlePlatform({
    entryPointMap,
    projectFolder,
    into,
    babelConfigMap,
    compileGroupCount,
    platformScoreMap: { node: versionScoreMap },
    verbose,
    logBundleFilePaths,
    computeRollupOptionsWithoutBalancing: (context) =>
      computeRollupOptionsWithoutBalancing({
        projectFolder,
        importMapFilenameRelative,
        inlineSpecifierMap,
        into,
        entryPointMap,
        babelConfigMap,
        minify,
        ...context,
      }),
    computeRollupOptionsWithBalancing: (context) =>
      computeRollupOptionsWithBalancing({
        projectFolder,
        importMapFilenameRelative,
        inlineSpecifierMap,
        into,
        entryPointMap,
        babelConfigMap,
        minify,
        ...context,
      }),
    computeRollupOptionsForBalancer: (context) =>
      computeRollupOptionsForBalancer({
        projectFolder,
        into,
        babelConfigMap,
        minify,
        ...context,
      }),
  })
  if (!throwUnhandled) return promise
  return promise.catch((e) => {
    setTimeout(() => {
      throw e
    })
  })
}
