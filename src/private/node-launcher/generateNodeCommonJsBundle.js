import { extname, basename, relative } from "path"
import { generateImportMapForPackage } from "@jsenv/node-module-import-map"
import { createLogger } from "@jsenv/logger"
import { generateCommonJsBundleForNode } from "../../generateCommonJsBundleForNode.js"
import { jsenvNodeVersionScoreMap } from "../../jsenvNodeVersionScoreMap.js"
import {
  fileUrlToPath,
  resolveDirectoryUrl,
  fileUrlToRelativePath,
  resolveFileUrl,
} from "../urlUtils.js"
import { jsenvCoreDirectoryUrl } from "../jsenvCoreDirectoryUrl.js"
import { getOrGenerateCompiledFile } from "../compile-server/compile-directory/getOrGenerateCompiledFile.js"
import { bundleToCompilationResult } from "../bundle/bundleToCompilationResult.js"

export const generateNodeCommonJsBundle = async ({
  projectDirectoryUrl,
  importMapFileRelativePath,
  importDefaultExtension,
  originalFileRelativePath,
  compiledFileRelativePath,
  sourcemapRelativePath = computeSourcemapRelativePath(compiledFileRelativePath),
  babelPluginMap,
  logLevel,
  compileGroupCount,
  nodeScoreMap = jsenvNodeVersionScoreMap,
}) => {
  return getOrGenerateCompiledFile({
    projectDirectoryUrl,
    originalFileRelativePath,
    compiledFileRelativePath,
    compile: async () => {
      const entryExtname = extname(originalFileRelativePath)
      const entryBasename = basename(originalFileRelativePath, entryExtname)
      const entryName = entryBasename
      const entryPointMap = {
        [entryName]: `./${originalFileRelativePath}`,
      }

      const logger = createLogger({ logLevel })
      const jsenvNodeLauncherImportMap = await generateImportMapForPackage({
        logger,
        projectDirectoryPath: fileUrlToPath(jsenvCoreDirectoryUrl),
        rootProjectDirectoryPath: fileUrlToPath(projectDirectoryUrl),
      })

      const bundle = await generateCommonJsBundleForNode({
        projectDirectoryPath: projectDirectoryUrl,
        // bundleDirectoryRelativePath is not really important
        // because we pass writeOnFileSystem: false anyway
        bundleDirectoryRelativePath: computeBundleDirectoryRelativePath({
          projectDirectoryUrl,
          compiledFileRelativePath,
        }),
        importDefaultExtension,
        importMapFileRelativePath,
        importMapForBundle: jsenvNodeLauncherImportMap,
        entryPointMap,
        babelPluginMap,
        throwUnhandled: false,
        writeOnFileSystem: false,
        logLevel,
        compileGroupCount,
        platformScoreMap: {
          node: nodeScoreMap,
        },
      })

      const sourcemapPathForModule = sourcemapRelativePathToSourcemapPathForModule(
        sourcemapRelativePath,
        compiledFileRelativePath,
      )
      const sourcemapPathForCache = sourcemapRelativePathToSourcePathForCache(
        sourcemapRelativePath,
        compiledFileRelativePath,
      )

      return bundleToCompilationResult(bundle, {
        projectDirectoryUrl,
        sourcemapPathForModule,
        sourcemapPathForCache,
      })
    },
    ifEtagMatch: null,
    ifModifiedSinceDate: null,
    cacheIgnored: false,
    cacheHitTracking: false,
    cacheInterProcessLocking: false,
  })
}

const computeBundleDirectoryRelativePath = ({ projectDirectoryUrl, compiledFileRelativePath }) => {
  const compiledFileUrl = resolveFileUrl(compiledFileRelativePath, projectDirectoryUrl)
  const bundleDirectoryUrl = resolveDirectoryUrl("./", compiledFileUrl)
  const bundleDirectoryRelativePath = fileUrlToRelativePath(bundleDirectoryUrl, projectDirectoryUrl)
  return bundleDirectoryRelativePath
}

const computeSourcemapRelativePath = (compiledFileRelativePath) => {
  const entryBasename = basename(compiledFileRelativePath)
  const compiledFileAssetDirectoryRelativePath = `${compiledFileRelativePath}/${entryBasename}__asset__/`
  const sourcemapRelativePath = `${compiledFileAssetDirectoryRelativePath}${entryBasename}.map`
  return sourcemapRelativePath
}

const sourcemapRelativePathToSourcemapPathForModule = (
  sourcemapRelativePath,
  compiledFileRelativePath,
) => {
  return `./${relative(compiledFileRelativePath, sourcemapRelativePath)}`
}

const sourcemapRelativePathToSourcePathForCache = (
  sourcemapRelativePath,
  compiledFileRelativePath,
) => {
  const entryBasename = basename(compiledFileRelativePath)
  const compiledFileAssetDirectoryRelativePath = `${compiledFileRelativePath}/${entryBasename}__asset__/`
  return relative(compiledFileAssetDirectoryRelativePath, sourcemapRelativePath)
}
