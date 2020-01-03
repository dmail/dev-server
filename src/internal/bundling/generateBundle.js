/* eslint-disable import/max-dependencies */
import {
  catchAsyncFunctionCancellation,
  createCancellationTokenForProcessSIGINT,
} from "@jsenv/cancellation"
import { createLogger } from "@jsenv/logger"
import { COMPILE_ID_OTHERWISE } from "internal/CONSTANTS.js"
import {
  resolveDirectoryUrl,
  urlToFileSystemPath,
  urlToRelativeUrl,
  assertFileExists,
  removeDirectory,
} from "@jsenv/util"
import { assertProjectDirectoryUrl, assertProjectDirectoryExists } from "internal/argUtils.js"
import { startCompileServer } from "internal/compiling/startCompileServer.js"
import { jsenvBabelPluginMap } from "src/jsenvBabelPluginMap.js"
import { jsenvBrowserScoreMap } from "src/jsenvBrowserScoreMap.js"
import { jsenvNodeVersionScoreMap } from "src/jsenvNodeVersionScoreMap.js"
import { createBabePluginMapForBundle } from "./createBabePluginMapForBundle.js"
import { generateBundleUsingRollup } from "./generateBundleUsingRollup.js"

export const generateBundle = async ({
  cancellationToken = createCancellationTokenForProcessSIGINT(),
  logLevel = "info",
  compileServerLogLevel = "warn",
  logger,

  projectDirectoryUrl,
  jsenvDirectoryRelativeUrl,
  jsenvDirectoryClean,
  importMapFileRelativeUrl,
  importDefaultExtension,
  env = {},
  browser = false,
  node = false,

  babelPluginMap = jsenvBabelPluginMap,
  compileGroupCount = 1,
  platformScoreMap = {
    ...jsenvBrowserScoreMap,
    node: jsenvNodeVersionScoreMap,
  },
  balancerTemplateFileUrl,

  entryPointMap = {
    main: "./index.js",
  },
  bundleDirectoryRelativeUrl,
  bundleDirectoryClean = false,
  format,
  formatOutputOptions = {},
  minify = false,
  minifyJsOptions = {},
  minifyCssOptions = {},
  minifyHtmlOptions = {},
  sourcemapExcludeSources = true,
  writeOnFileSystem = true,
  manifestFile = false,

  // when true .jsenv/out-bundle directory is generated
  // with all intermediated files used to produce the final bundle.
  // it might improve generateBundle speed for subsequent bundle generation
  // but this is to be proven and not absolutely required
  // When false intermediates files are transformed and served in memory
  // by the compile server
  // must be true by default otherwise rollup cannot find sourcemap files
  // when asking them to the compile server
  // (to fix that sourcemap could be inlined)
  filesystemCache = true,

  ...rest
}) => {
  logger = logger || createLogger({ logLevel })

  projectDirectoryUrl = assertProjectDirectoryUrl({ projectDirectoryUrl })
  await assertProjectDirectoryExists({ projectDirectoryUrl })

  assertEntryPointMap({ entryPointMap })

  assertBundleDirectoryRelativeUrl({ bundleDirectoryRelativeUrl })
  const bundleDirectoryUrl = resolveDirectoryUrl(bundleDirectoryRelativeUrl, projectDirectoryUrl)
  assertBundleDirectoryInsideProject({ bundleDirectoryUrl, projectDirectoryUrl })
  if (bundleDirectoryClean) {
    await removeDirectory(urlToFileSystemPath(bundleDirectoryUrl))
  }

  const chunkId = `${Object.keys(entryPointMap)[0]}.js`
  env = {
    ...env,
    chunkId,
  }
  babelPluginMap = {
    ...babelPluginMap,
    ...createBabePluginMapForBundle({
      format,
    }),
  }

  assertCompileGroupCount({ compileGroupCount })
  if (compileGroupCount > 1) {
    if (typeof balancerTemplateFileUrl === "undefined") {
      throw new Error(`${format} format not compatible with balancing.`)
    }
    await assertFileExists(balancerTemplateFileUrl)
  }

  return catchAsyncFunctionCancellation(async () => {
    const {
      outDirectoryRelativeUrl,
      origin: compileServerOrigin,
      compileServerImportMap,
      compileServerGroupMap,
    } = await startCompileServer({
      cancellationToken,
      compileServerLogLevel,

      projectDirectoryUrl,
      jsenvDirectoryRelativeUrl,
      jsenvDirectoryClean,
      outDirectoryName: "out-bundle",
      importMapFileRelativeUrl,
      importDefaultExtension,

      env,
      babelPluginMap,
      compileGroupCount,
      platformScoreMap,
      writeOnFilesystem: filesystemCache,
      useFilesystemAsCache: filesystemCache,

      // override with potential custom options
      ...rest,

      transformModuleIntoSystemFormat: false, // will be done by rollup
    })

    if (compileGroupCount === 1) {
      return generateBundleUsingRollup({
        cancellationToken,
        logger,

        projectDirectoryUrl,
        entryPointMap,
        bundleDirectoryUrl,
        compileDirectoryRelativeUrl: `${outDirectoryRelativeUrl}${COMPILE_ID_OTHERWISE}/`,
        compileServerOrigin,
        compileServerImportMap,
        importDefaultExtension,

        babelPluginMap,
        node,
        browser,
        minify,
        minifyJsOptions,
        minifyCssOptions,
        minifyHtmlOptions,
        format,
        formatOutputOptions,
        writeOnFileSystem,
        sourcemapExcludeSources,
        manifestFile,
      })
    }

    return await Promise.all([
      generateEntryPointsDirectories({
        cancellationToken,
        logger,

        projectDirectoryUrl,
        outDirectoryRelativeUrl,
        bundleDirectoryUrl,
        entryPointMap,
        compileServerOrigin,
        compileServerImportMap,
        importDefaultExtension,

        babelPluginMap,
        compileServerGroupMap,
        node,
        browser,
        format,
        formatOutputOptions,
        minify,
        writeOnFileSystem,
        sourcemapExcludeSources,
        manifestFile,
      }),
      generateEntryPointsBalancerFiles({
        cancellationToken,
        logger,

        projectDirectoryUrl,
        balancerTemplateFileUrl,
        outDirectoryRelativeUrl,
        entryPointMap,
        bundleDirectoryUrl,
        compileServerOrigin,
        compileServerImportMap,
        importDefaultExtension,

        babelPluginMap,
        node,
        browser,
        format,
        minify,
        writeOnFileSystem,
        sourcemapExcludeSources,
        manifestFile,
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

const assertBundleDirectoryRelativeUrl = ({ bundleDirectoryRelativeUrl }) => {
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

const generateEntryPointsDirectories = ({
  compileServerGroupMap,
  bundleDirectoryUrl,
  outDirectoryRelativeUrl,
  ...rest
}) =>
  Promise.all(
    Object.keys(compileServerGroupMap).map((compileId) =>
      generateBundleUsingRollup({
        bundleDirectoryUrl: resolveDirectoryUrl(compileId, bundleDirectoryUrl),
        compileDirectoryRelativeUrl: `${outDirectoryRelativeUrl}${compileId}/`,
        ...rest,
      }),
    ),
  )

const generateEntryPointsBalancerFiles = ({
  projectDirectoryUrl,
  outDirectoryRelativeUrl,
  entryPointMap,
  balancerTemplateFileUrl,
  ...rest
}) =>
  Promise.all(
    Object.keys(entryPointMap).map((entryPointName) =>
      generateBundleUsingRollup({
        projectDirectoryUrl,
        compileDirectoryRelativeUrl: `${outDirectoryRelativeUrl}${COMPILE_ID_OTHERWISE}/`,
        entryPointMap: {
          [entryPointName]: urlToRelativeUrl(balancerTemplateFileUrl, projectDirectoryUrl),
        },
        sourcemapExcludeSources: true,
        ...rest,
        format: "global",
      }),
    ),
  )
