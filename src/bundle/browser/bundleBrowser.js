import { normalizePathname } from "/node_modules/@jsenv/module-resolution/index.js"
import { browserScoreMap } from "../../group-map/index.js"
import { bundlePlatform } from "../bundlePlatform.js"
import { computeRollupOptionsWithoutBalancing } from "./computeRollupOptionsWithoutBalancing.js"
import { computeRollupOptionsWithBalancing } from "./computeRollupOptionsWithBalancing.js"
import { computeRollupOptionsForBalancer } from "./computeRollupOptionsForBalancer.js"
import { generateEntryPointMapPages } from "./generateEntryPointMapPages.js"
import {
  BUNDLE_BROWSER_DEFAULT_IMPORT_MAP_FILENAME_RELATIVE,
  BUNDLE_BROWSER_DEFAULT_BUNDLE_INTO,
  BUNDLE_BROWSER_DEFAULT_ENTRY_POINT_MAP,
  BUNDLE_BROWSER_DEFAULT_BABEL_CONFIG_MAP,
} from "./bundle-browser-constant.js"

export const bundleBrowser = async ({
  projectFolder,
  babelConfigMap = BUNDLE_BROWSER_DEFAULT_BABEL_CONFIG_MAP,
  importMapFilenameRelative = BUNDLE_BROWSER_DEFAULT_IMPORT_MAP_FILENAME_RELATIVE,
  browserGroupResolverFilenameRelative = `src/browser-group-resolver/index.js`,
  inlineSpecifierMap = {},
  into = BUNDLE_BROWSER_DEFAULT_BUNDLE_INTO,
  entryPointMap = BUNDLE_BROWSER_DEFAULT_ENTRY_POINT_MAP,
  compileGroupCount = 1,
  platformScoreMap = browserScoreMap,
  format = "system", // or iife
  verbose = false,
  minify = false,
  throwUnhandled = true,
  writeOnFileSystem = true,
  logBundleFilePaths = true,
  generateEntryPages = false,
}) => {
  projectFolder = normalizePathname(projectFolder)

  const bundlePlatformPromise = bundlePlatform({
    entryPointMap,
    projectFolder,
    into,
    babelConfigMap,
    compileGroupCount,
    platformScoreMap,
    verbose,
    writeOnFileSystem,
    logBundleFilePaths,
    computeRollupOptionsWithoutBalancing: (context) =>
      computeRollupOptionsWithoutBalancing({
        projectFolder,
        importMapFilenameRelative,
        inlineSpecifierMap,
        into,
        entryPointMap,
        babelConfigMap,
        format,
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
        importMapFilenameRelative,
        browserGroupResolverFilenameRelative,
        into,
        babelConfigMap,
        minify,
        ...context,
      }),
  })

  const promise = generateEntryPages
    ? Promise.all([
        bundlePlatformPromise,
        generateEntryPointMapPages({
          projectFolder,
          into,
          entryPointMap,
        }),
      ])
    : bundlePlatformPromise

  if (!throwUnhandled) return promise
  return promise.catch((e) => {
    setTimeout(() => {
      throw e
    })
  })
}
