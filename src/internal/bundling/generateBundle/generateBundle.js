/* eslint-disable import/max-dependencies */
import {
  catchAsyncFunctionCancellation,
  createCancellationTokenForProcessSIGINT,
} from "@jsenv/cancellation"
import {
  pathToDirectoryUrl,
  resolveDirectoryUrl,
  resolveFileUrl,
  fileUrlToPath,
} from "internal/urlUtils.js"
import { assertFileExists, removeDirectory } from "internal/filesystemUtils.js"
import {
  assertProjectDirectoryPath,
  assertProjectDirectoryExists,
  assertImportMapFileRelativeUrl,
  assertImportMapFileInsideProject,
} from "internal/argUtils.js"
import { generateGroupMap } from "internal/generateGroupMap/generateGroupMap.js"
import { jsenvBabelPluginMap } from "src/jsenvBabelPluginMap.js"
import { jsenvBrowserScoreMap } from "src/jsenvBrowserScoreMap.js"
import { jsenvNodeVersionScoreMap } from "src/jsenvNodeVersionScoreMap.js"
import { bundleWithoutBalancing } from "./bundleWithoutBalancing.js"
import { bundleWithBalancing } from "./bundleWithBalancing.js"
import { bundleBalancer } from "./bundleBalancer.js"
import { isBareSpecifierForNativeNodeModule } from "./isBareSpecifierForNativeNodeModule.js"

export const generateBundle = async ({
  cancellationToken = createCancellationTokenForProcessSIGINT(),
  projectDirectoryPath,
  bundleDirectoryRelativeUrl,
  bundleDirectoryClean = false,
  bundleCache = false,
  importMapFileRelativeUrl = "./importMap.json",
  importMapForBundle = {},
  importDefaultExtension,
  importReplaceMap = {},
  importFallbackMap = {},
  browser = false,
  node = false,
  entryPointMap = {
    main: "./index.js",
  },
  sourcemapPreferLeadingSlash,
  babelPluginMap = jsenvBabelPluginMap,
  convertMap,
  logLevel = "info",
  minify = false,
  writeOnFileSystem = true,
  format,
  formatOutputOptions = {},
  // balancing
  compileGroupCount = 1,
  platformAlwaysInsidePlatformScoreMap,
  platformWillAlwaysBeKnown,
  balancerTemplateFileUrl,
  balancerDataAbstractSpecifier,
  platformScoreMap = {
    ...jsenvBrowserScoreMap,
    node: jsenvNodeVersionScoreMap,
  },
}) => {
  assertProjectDirectoryPath({ projectDirectoryPath })
  const projectDirectoryUrl = pathToDirectoryUrl(projectDirectoryPath)
  await assertProjectDirectoryExists({ projectDirectoryUrl })

  assertbundleDirectoryRelativeUrl({ bundleDirectoryRelativeUrl })
  const bundleDirectoryUrl = resolveDirectoryUrl(bundleDirectoryRelativeUrl, projectDirectoryUrl)
  assertBundleDirectoryInsideProject({ bundleDirectoryUrl, projectDirectoryUrl })
  if (bundleDirectoryClean) {
    await removeDirectory(fileUrlToPath(bundleDirectoryUrl))
  }

  assertImportMapFileRelativeUrl({ importMapFileRelativeUrl })
  const importMapFileUrl = resolveFileUrl(importMapFileRelativeUrl, projectDirectoryUrl)
  assertImportMapFileInsideProject({ importMapFileUrl, projectDirectoryUrl })

  assertEntryPointMap({ entryPointMap })
  assertCompileGroupCount({ compileGroupCount })
  if (compileGroupCount > 1) {
    if (typeof balancerTemplateFileUrl === "undefined") {
      throw new Error(`${format} format not compatible with balancing.`)
    }
    await assertFileExists(balancerTemplateFileUrl)
  }

  return catchAsyncFunctionCancellation(async () => {
    const nativeModulePredicate = (specifier) => {
      if (node && isBareSpecifierForNativeNodeModule(specifier)) return true
      // for now browser have no native module
      // and we don't know how we will handle that
      if (browser) return false
      return false
    }

    if (compileGroupCount === 1) {
      return bundleWithoutBalancing({
        cancellationToken,
        projectDirectoryUrl,
        bundleDirectoryUrl,
        bundleCache,
        importMapFileUrl,
        importMapForBundle,
        importDefaultExtension,
        importReplaceMap,
        importFallbackMap,
        nativeModulePredicate,
        entryPointMap,
        sourcemapPreferLeadingSlash,
        babelPluginMap,
        convertMap,
        minify,
        logLevel,
        format,
        formatOutputOptions,
        writeOnFileSystem,
      })
    }

    const groupMap = generateGroupMap({
      babelPluginMap,
      platformScoreMap,
      groupCount: compileGroupCount,
      platformAlwaysInsidePlatformScoreMap,
      platformWillAlwaysBeKnown,
    })

    return await Promise.all([
      generateEntryPointsFolders({
        cancellationToken,
        projectDirectoryUrl,
        bundleDirectoryUrl,
        bundleCache,
        importMapFileUrl,
        importMapFileRelativeUrl,
        importMapForBundle,
        importDefaultExtension,
        importReplaceMap,
        importFallbackMap,
        nativeModulePredicate,
        entryPointMap,
        sourcemapPreferLeadingSlash,
        babelPluginMap,
        convertMap,
        minify,
        logLevel,
        writeOnFileSystem,
        format,
        formatOutputOptions,
        groupMap,
      }),
      generateEntryPointsBalancerFiles({
        cancellationToken,
        projectDirectoryUrl,
        bundleDirectoryUrl,
        bundleCache,
        importMapFileUrl,
        importMapForBundle,
        importDefaultExtension,
        importReplaceMap,
        importFallbackMap,
        nativeModulePredicate,
        entryPointMap,
        sourcemapPreferLeadingSlash,
        babelPluginMap,
        convertMap,
        minify,
        logLevel,
        writeOnFileSystem,
        format,
        balancerTemplateFileUrl,
        balancerDataAbstractSpecifier,
        groupMap,
      }),
    ])
  })
}

const assertEntryPointMap = ({ entryPointMap }) => {
  if (typeof entryPointMap !== "object") {
    throw new TypeError(`entryPointMap must be an object, got ${entryPointMap}`)
  }
  Object.keys(entryPointMap).forEach((entryName) => {
    const entryRelativeUrl = entryPointMap[entryName]
    if (typeof entryRelativeUrl !== "string") {
      throw new TypeError(
        `found unexpected value in entryPointMap, it must be a string but found ${entryRelativeUrl} for key ${entryName}`,
      )
    }
    if (!entryRelativeUrl.startsWith("./")) {
      throw new TypeError(
        `found unexpected value in entryPointMap, it must start with ./ but found ${entryRelativeUrl} for key ${entryName}`,
      )
    }
  })
}

const assertbundleDirectoryRelativeUrl = ({ bundleDirectoryRelativeUrl }) => {
  if (typeof bundleDirectoryRelativeUrl !== "string") {
    throw new TypeError(
      `bundleDirectoryRelativeUrl must be a string, received ${bundleDirectoryRelativeUrl}`,
    )
  }
}

const assertBundleDirectoryInsideProject = ({ bundleDirectoryUrl, projectDirectoryUrl }) => {
  if (!bundleDirectoryUrl.startsWith(projectDirectoryUrl)) {
    throw new Error(`bundle directory must be inside project directory
--- bundle directory url ---
${bundleDirectoryUrl}
--- project directory url ---
${projectDirectoryUrl}`)
  }
}

const assertCompileGroupCount = ({ compileGroupCount }) => {
  if (typeof compileGroupCount !== "number") {
    throw new TypeError(`compileGroupCount must be a number, got ${compileGroupCount}`)
  }
  if (compileGroupCount < 1) {
    throw new Error(`compileGroupCount must be >= 1, got ${compileGroupCount}`)
  }
}

const generateEntryPointsFolders = async ({ groupMap, ...rest }) =>
  Promise.all(
    Object.keys(groupMap).map(async (compileId) =>
      bundleWithBalancing({
        groupMap,
        compileId,
        ...rest,
      }),
    ),
  )

const generateEntryPointsBalancerFiles = ({ entryPointMap, balancerTemplateFileUrl, ...rest }) =>
  Promise.all(
    Object.keys(entryPointMap).map(async (entryPointName) =>
      bundleBalancer({
        entryPointMap: {
          [entryPointName]: fileUrlToPath(balancerTemplateFileUrl),
        },
        ...rest,
      }),
    ),
  )
