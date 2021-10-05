import { createOperation } from "@jsenv/cancellation"
import {
  urlToFileSystemPath,
  ensureEmptyDirectory,
  readFile,
  urlToRelativeUrl,
} from "@jsenv/filesystem"
import { createDetailedMessage } from "@jsenv/logger"

import { buildServiceWorker } from "@jsenv/core/src/internal/building/buildServiceWorker.js"
import { createJsenvRollupPlugin } from "./createJsenvRollupPlugin.js"

export const buildUsingRollup = async ({
  cancellationToken,
  logger,

  projectDirectoryUrl,
  entryPointMap,
  compileServerOrigin,
  compileDirectoryRelativeUrl,
  buildDirectoryUrl,
  buildDirectoryClean,
  assetManifestFile = false,
  assetManifestFileRelativeUrl,
  sourcemapExcludeSources,
  writeOnFileSystem,

  format,
  systemJsUrl,
  globalName,
  globals,
  babelPluginMap,
  runtimeSupport,
  transformTopLevelAwait,

  urlMappings,
  importResolutionMethod,
  importMapFileRelativeUrl,
  importDefaultExtension,
  externalImportSpecifiers,
  externalImportUrlPatterns,
  importPaths,

  urlVersioning,
  lineBreakNormalization,
  jsConcatenation,
  useImportMapToMaximizeCacheReuse,
  preserveEntrySignatures,

  minify,
  minifyJsOptions,
  minifyCssOptions,
  minifyHtmlOptions,

  serviceWorkers,
  serviceWorkerFinalizer,
}) => {
  const node = Boolean(runtimeSupport.node)
  const browser = Boolean(
    runtimeSupport.android ||
      runtimeSupport.chrome ||
      runtimeSupport.edge ||
      runtimeSupport.electron ||
      runtimeSupport.firefox ||
      runtimeSupport.ios ||
      runtimeSupport.opera ||
      runtimeSupport.safari,
  )

  const {
    jsenvRollupPlugin,
    getLastErrorMessage,
    getResult,
    asOriginalUrl,
    asProjectUrl,
  } = await createJsenvRollupPlugin({
    cancellationToken,
    logger,

    projectDirectoryUrl,
    entryPointMap,
    compileServerOrigin,
    compileDirectoryRelativeUrl,
    buildDirectoryUrl,
    assetManifestFile,
    assetManifestFileRelativeUrl,
    writeOnFileSystem,

    format,
    systemJsUrl,
    babelPluginMap,
    transformTopLevelAwait,
    node,
    browser,

    urlMappings,
    importResolutionMethod,
    importMapFileRelativeUrl,
    importDefaultExtension,
    externalImportSpecifiers,
    externalImportUrlPatterns,
    importPaths,

    urlVersioning,
    lineBreakNormalization,
    jsConcatenation,
    useImportMapToMaximizeCacheReuse,

    minify,
    minifyJsOptions,
    minifyCssOptions,
    minifyHtmlOptions,
  })

  try {
    await useRollup({
      cancellationToken,
      jsenvRollupPlugin,

      format,
      globals,
      globalName,
      sourcemapExcludeSources,
      preserveEntrySignatures,
      // jsConcatenation,
      buildDirectoryUrl,
      buildDirectoryClean,

      asOriginalUrl,
    })
  } catch (e) {
    if (e.plugin === "jsenv") {
      const jsenvPluginErrorMessage = getLastErrorMessage()
      if (jsenvPluginErrorMessage) {
        e.message = jsenvPluginErrorMessage
      }
      throw e
    }
    if (e.code === "MISSING_EXPORT") {
      let message = e.message
      message = message.replace(e.id, (url) => asOriginalUrl(url))
      message = message.replace(/(www|http:|https:)+[^\s]+[\w]/g, (url) =>
        asOriginalUrl(url),
      )
      const importedFileRollupUrl = e.message.match(/not exported by (.*?),/)[1]
      const convertSuggestion = await getConvertSuggestion({
        importedFileRollupUrl,
        asProjectUrl,
        asOriginalUrl,
        projectDirectoryUrl,
      })
      const detailedMessage = createDetailedMessage(message, {
        frame: e.frame,
        ...convertSuggestion,
      })
      throw new Error(detailedMessage, { cause: e })
    }
    throw e
  }

  const jsenvBuild = getResult()

  if (writeOnFileSystem) {
    await Promise.all(
      Object.keys(serviceWorkers).map(
        async (serviceWorkerProjectRelativeUrl) => {
          const serviceWorkerBuildRelativeUrl =
            serviceWorkers[serviceWorkerProjectRelativeUrl]
          await buildServiceWorker({
            projectDirectoryUrl,
            buildDirectoryUrl,
            serviceWorkerProjectRelativeUrl,
            serviceWorkerBuildRelativeUrl,
            serviceWorkerTransformer: (code) =>
              serviceWorkerFinalizer(code, jsenvBuild, {
                lineBreakNormalization,
              }),

            minify,
          })
        },
      ),
    )
  }

  return jsenvBuild
}

const useRollup = async ({
  cancellationToken,
  jsenvRollupPlugin,
  format,
  globals,
  globalName,
  sourcemapExcludeSources,
  preserveEntrySignatures,
  // jsConcatenation,
  buildDirectoryUrl,
  buildDirectoryClean,
  asOriginalUrl,
}) => {
  const { rollup } = await import("rollup")

  const rollupInputOptions = {
    // about cache here, we should/could reuse previous rollup call
    // to get the cache from the entryPointMap
    // as shown here: https://rollupjs.org/guide/en#cache
    // it could be passed in arguments to this function
    // however parallelism and having different rollup options per
    // call make it a bit complex
    // cache: null
    // https://rollupjs.org/guide/en#experimentaltoplevelawait
    //  experimentalTopLevelAwait: true,
    // if we want to ignore some warning
    // please use https://rollupjs.org/guide/en#onwarn
    // to be very clear about what we want to ignore
    onwarn: (warning, warn) => {
      if (warning.code === "THIS_IS_UNDEFINED") {
        return
      }
      if (
        warning.code === "EMPTY_BUNDLE" &&
        warning.chunkName === "__empty__"
      ) {
        return
      }
      // ignore file name conflict when sourcemap or importmap are re-emitted
      if (
        warning.code === "FILE_NAME_CONFLICT" &&
        (warning.message.includes(".map") ||
          warning.message.includes(".importmap"))
      ) {
        return
      }
      if (warning.code === "CIRCULAR_DEPENDENCY") {
        warning.cycle.forEach((url, index) => {
          warning.cycle[index] = asOriginalUrl(url)
        })
        warning.message = warning.message.replace(
          /http:\/\/jsenv.com\/[^\s]+[\w]/g,
          (url) => {
            return asOriginalUrl(url)
          },
        )
      }
      warn(warning)
    },
    // on passe input: [] car c'est le plusign jsenv qui se chargera d'emit des chunks
    // en fonction de entryPointMap
    // on fait cela car sinon rollup est pénible si on passe un entry point map de type html
    input: [],
    preserveEntrySignatures,
    plugins: [jsenvRollupPlugin],
  }
  const rollupOutputOptions = {
    // https://rollupjs.org/guide/en#experimentaltoplevelawait
    // experimentalTopLevelAwait: true,
    // we could put prefConst to true by checking 'transform-block-scoping'
    // presence in babelPluginMap
    preferConst: false,
    // https://rollupjs.org/guide/en#output-dir
    dir: urlToFileSystemPath(buildDirectoryUrl),
    // https://rollupjs.org/guide/en#output-format
    format: formatToRollupFormat(format),
    // https://rollupjs.org/guide/en#output-sourcemap
    sourcemap: true,
    sourcemapExcludeSources,
    // preserveModules: !jsConcatenation,
    ...(format === "global"
      ? {
          globals,
          name: globalName,
        }
      : {}),
  }

  const rollupReturnValue = await createOperation({
    cancellationToken,
    start: () => rollup(rollupInputOptions),
  })

  if (buildDirectoryClean) {
    await ensureEmptyDirectory(buildDirectoryUrl)
  }

  const rollupOutputArray = await createOperation({
    cancellationToken,
    start: () => rollupReturnValue.generate(rollupOutputOptions),
  })

  return rollupOutputArray
}

const formatToRollupFormat = (format) => {
  if (format === "global") return "iife"
  if (format === "commonjs") return "cjs"
  if (format === "systemjs") return "system"
  if (format === "esmodule") return "esm"
  throw new Error(`unexpected format, got ${format}`)
}

const getConvertSuggestion = async ({
  importedFileRollupUrl,
  asProjectUrl,
  asOriginalUrl,
  projectDirectoryUrl,
}) => {
  const importedFileUrl = asProjectUrl(importedFileRollupUrl)
  const importedFileContent = await readFile(importedFileUrl)
  const looksLikeCommonJs =
    importedFileContent.includes("module.exports = ") ||
    importedFileContent.includes("exports.")

  if (!looksLikeCommonJs) {
    return null
  }

  const importerFileOriginalUrl = asOriginalUrl(importedFileUrl)
  const importedFileOriginalRelativeUrl = urlToRelativeUrl(
    importerFileOriginalUrl,
    projectDirectoryUrl,
  )
  return {
    suggestion: `The file seems written in commonjs, you should use "customCompiler" to convert it to js module
{
  "./${importedFileOriginalRelativeUrl}": commonJsToJavaScriptModule
}
As documented in https://github.com/jsenv/jsenv-core/blob/master/docs/shared-parameters.md#customcompilers`,
  }
}
