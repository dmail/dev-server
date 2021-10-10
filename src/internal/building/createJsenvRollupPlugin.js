/* eslint-disable import/max-dependencies */
import { extname } from "node:path"
import { normalizeImportMap } from "@jsenv/importmap"
import { isSpecifierForNodeCoreModule } from "@jsenv/importmap/src/isSpecifierForNodeCoreModule.js"
import { loggerToLogLevel } from "@jsenv/logger"
import {
  isFileSystemPath,
  fileSystemPathToUrl,
  resolveUrl,
  urlToRelativeUrl,
  resolveDirectoryUrl,
  writeFile,
  comparePathnames,
  urlIsInsideOf,
  normalizeStructuredMetaMap,
  urlToMeta,
} from "@jsenv/filesystem"

import { createUrlConverter } from "@jsenv/core/src/internal/url_conversion.js"
import { createUrlFetcher } from "@jsenv/core/src/internal/building/url_fetcher.js"
import { createUrlLoader } from "@jsenv/core/src/internal/building/url_loader.js"
import { sortObjectByPathnames } from "@jsenv/core/src/internal/building/sortObjectByPathnames.js"
import { jsenvHelpersDirectoryInfo } from "@jsenv/core/src/internal/jsenvInternalFiles.js"
import { infoSign } from "@jsenv/core/src/internal/logs/log_style.js"

import {
  formatUseImportMapFromHtml,
  formatImportmapOutsideCompileDirectory,
  formatRessourceHintNeverUsedWarning,
  formatBuildDoneInfo,
} from "./build_logs.js"
import { importMapsFromHtml } from "./html/htmlScan.js"
import { parseRessource } from "./parseRessource.js"
import { createRessourceBuilder } from "./ressource_builder.js"
import { computeBuildRelativeUrl } from "./url-versioning.js"
import { transformImportMetaUrlReferences } from "./import_meta_url_and_rollup.js"
import { transformImportAssertions } from "./import_assertions_and_rollup.js"

import { minifyJs } from "./js/minifyJs.js"
import { createImportResolverForNode } from "../import-resolution/import-resolver-node.js"
import { createImportResolverForImportmap } from "../import-resolution/import-resolver-importmap.js"
import { getDefaultImportMap } from "../import-resolution/importmap-default.js"
import { injectSourcemapInRollupBuild } from "./rollup_build_sourcemap.js"
import { createBuildStats } from "./build_stats.js"

export const createJsenvRollupPlugin = async ({
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

  urlMappings,
  importResolutionMethod,
  importMapFileRelativeUrl,
  importDefaultExtension,
  externalImportSpecifiers,
  externalImportUrlPatterns,
  importPaths,

  format,
  systemJsUrl,
  babelPluginMap,
  transformTopLevelAwait,
  node,

  urlVersioning,
  lineBreakNormalization,
  jsConcatenation,
  useImportMapToMaximizeCacheReuse,

  minify,
  minifyJsOptions,
  minifyCssOptions,
  minifyHtmlOptions,
}) => {
  const urlImporterMap = {}
  const inlineModuleScripts = {}
  const jsModulesFromEntry = {}
  const buildFileContents = {}
  const buildInlineFileContents = {}
  let buildStats = {}
  const buildStartMs = Date.now()

  let lastErrorMessage
  const storeLatestJsenvPluginError = (error) => {
    lastErrorMessage = error.message
  }

  const {
    asRollupUrl,
    asProjectUrl,
    asServerUrl,
    asCompiledServerUrl,
    asOriginalUrl,
    asOriginalServerUrl,
    applyUrlMappings,
  } = createUrlConverter({
    projectDirectoryUrl,
    compileServerOrigin,
    compileDirectoryRelativeUrl,
    urlMappings,
  })

  const urlFetcher = createUrlFetcher({
    asOriginalUrl,
    asProjectUrl,
    applyUrlMappings,
    urlImporterMap,
    beforeThrowingResponseValidationError: (error) => {
      storeLatestJsenvPluginError(error)
    },
  })

  const urlLoader = createUrlLoader({
    asServerUrl,
    asProjectUrl,
    asOriginalUrl,
    urlFetcher,
    ressourceBuilder,
    projectDirectoryUrl,
    babelPluginMap,
    // rollupModuleInfo,
    inlineModuleScripts,
    allowJson: acceptsJsonContentType({ node, format }),
  })

  const externalUrlPredicate = externalImportUrlPatternsToExternalUrlPredicate(
    externalImportUrlPatterns,
    projectDirectoryUrl,
  )

  // map fileName (build relative urls without hash) to build relative url
  let buildManifest = {}
  const buildRelativeUrlToFileName = (buildRelativeUrl) => {
    const fileName = Object.keys(buildManifest).find(
      (key) => buildManifest[key] === buildRelativeUrl,
    )
    return fileName
  }
  const buildRelativeUrlsUsedInJs = []
  const markBuildRelativeUrlAsUsedByJs = (buildRelativeUrl) => {
    buildRelativeUrlsUsedInJs.push(buildRelativeUrl)
    buildManifest[rollupFileNameWithoutHash(buildRelativeUrl)] =
      buildRelativeUrl
  }
  const createImportMapForFilesUsedInJs = () => {
    const topLevelMappings = {}
    buildRelativeUrlsUsedInJs
      .sort(comparePathnames)
      .forEach((buildRelativeUrl) => {
        const fileName = buildRelativeUrlToFileName(buildRelativeUrl)
        if (fileName !== buildRelativeUrl) {
          topLevelMappings[`./${fileName}`] = `./${buildRelativeUrl}`
        }
      })
    return {
      imports: topLevelMappings,
    }
  }

  let buildMappings = {}
  // an object where keys are build relative urls
  // and values rollup chunk or asset
  // we need this because we sometimes tell rollup
  // that a file.fileName is something while it's not really this
  // because of remapping
  let rollupBuild

  const EMPTY_CHUNK_URL = resolveUrl("__empty__", projectDirectoryUrl)

  const compileDirectoryUrl = resolveDirectoryUrl(
    compileDirectoryRelativeUrl,
    projectDirectoryUrl,
  )
  const compileDirectoryRemoteUrl = resolveDirectoryUrl(
    compileDirectoryRelativeUrl,
    compileServerOrigin,
  )

  let ressourceBuilder
  let rollupEmitFile = () => {}
  let rollupSetAssetSource = () => {}
  let _rollupGetModuleInfo = () => {}
  const rollupGetModuleInfo = (id) => _rollupGetModuleInfo(id)
  let importResolver

  const emitAsset = ({ fileName, source }) => {
    return rollupEmitFile({
      type: "asset",
      source,
      fileName,
    })
  }
  const emitChunk = (chunk) => {
    return rollupEmitFile({
      type: "chunk",
      ...chunk,
    })
  }
  const setAssetSource = (rollupReferenceId, assetSource) => {
    return rollupSetAssetSource(rollupReferenceId, assetSource)
  }

  const jsenvRollupPlugin = {
    name: "jsenv",

    async buildStart() {
      const entryFileRelativeUrls = Object.keys(entryPointMap)
      if (entryFileRelativeUrls.length === 1) {
        logger.info(`
building ${entryFileRelativeUrls[0]}...`)
      } else {
        logger.info(`
building ${entryFileRelativeUrls.length} entry files...`)
      }

      const entryPointsPrepared = await prepareEntryPoints(entryPointMap, {
        logger,
        projectDirectoryUrl,
        buildDirectoryUrl,
        compileServerOrigin,
        urlFetcher,
      })
      const htmlEntryPoints = entryPointsPrepared.filter(
        (entryPointPrepared) => {
          return entryPointPrepared.entryContentType === "text/html"
        },
      )
      const htmlEntryPointCount = htmlEntryPoints.length
      if (node && htmlEntryPointCount > 0) {
        logger.warn(
          `WARNING: Found an HTML entry point and "node" is part of "runtimeSupport", it's not supposed to happen`,
        )
      }
      if (htmlEntryPointCount > 1) {
        const error = new Error(
          `Cannot handle more than one html entry point, got ${htmlEntryPointCount}`,
        )
        storeLatestJsenvPluginError(error)
        throw error
      }

      if (typeof useImportMapToMaximizeCacheReuse === "undefined") {
        useImportMapToMaximizeCacheReuse =
          htmlEntryPointCount > 0 &&
          // node has no importmap concept, le'ts use the versionned url in that case
          !node
      }

      // https://github.com/easesu/rollup-plugin-html-input/blob/master/index.js
      // https://rollupjs.org/guide/en/#thisemitfileemittedfile-emittedchunk--emittedasset--string
      rollupEmitFile = (...args) => this.emitFile(...args)
      rollupSetAssetSource = (...args) => this.setAssetSource(...args)
      _rollupGetModuleInfo = (id) => this.getModuleInfo(id)

      let importMapInfoFromHtml = null
      if (htmlEntryPointCount === 1) {
        const htmlEntryPoint = htmlEntryPoints[0]
        const htmlSource = String(htmlEntryPoint.entryBuffer)

        const importMaps = importMapsFromHtml(htmlSource)
        const importMapCount = importMaps.length
        if (importMapCount > 1) {
          const error = new Error(`Many importmap found in html file`)
          storeLatestJsenvPluginError(error)
          throw error
        }

        if (importMapCount === 1) {
          const htmlUrl = resolveUrl(
            htmlEntryPoint.entryProjectRelativeUrl,
            projectDirectoryUrl,
          )
          importMapInfoFromHtml = {
            ...importMaps[0],
            htmlUrl,
            htmlSource,
          }
        }
      }

      if (importResolutionMethod === "node") {
        importResolver = await createImportResolverForNode({
          projectDirectoryUrl,
          compileServerOrigin,
          compileDirectoryRelativeUrl,
          importDefaultExtension,
        })
      } else {
        let importMap
        let importMapUrl
        let fetchImportMap
        if (importMapInfoFromHtml) {
          logger.debug(formatUseImportMapFromHtml(importMapInfoFromHtml))

          if (importMapInfoFromHtml.type === "remote") {
            importMapUrl = resolveUrl(
              importMapInfoFromHtml.src,
              asCompiledServerUrl(importMapInfoFromHtml.htmlUrl),
            )

            if (!urlIsInsideOf(importMapUrl, compileDirectoryRemoteUrl)) {
              logger.warn(
                formatImportmapOutsideCompileDirectory({
                  importMapInfo: importMapInfoFromHtml,
                  compileDirectoryUrl,
                }),
              )
            }

            fetchImportMap = () => {
              return fetchImportMapFromUrl(
                importMapUrl,
                importMapInfoFromHtml.htmlUrl,
              )
            }
          } else {
            const firstHtmlEntryPoint = htmlEntryPoints[0]
            const htmlProjectRelativeUrl =
              firstHtmlEntryPoint.entryProjectRelativeUrl
            const htmlCompiledUrl = resolveUrl(
              htmlProjectRelativeUrl,
              compileDirectoryRemoteUrl,
            )
            importMapUrl = htmlCompiledUrl
            fetchImportMap = () => {
              const importMapRaw = JSON.parse(importMapInfoFromHtml.text)
              const importMap = normalizeImportMap(importMapRaw, importMapUrl)
              return importMap
            }
          }
        } else if (importMapFileRelativeUrl) {
          importMapUrl = resolveUrl(
            importMapFileRelativeUrl,
            compileDirectoryRemoteUrl,
          )
          fetchImportMap = () => {
            return fetchImportMapFromUrl(
              importMapUrl,
              "importMapFileRelativeUrl parameter",
            )
          }
        } else {
          // there is no importmap, its' fine it's not mandatory to use one
          fetchImportMap = () => {
            const firstEntryPoint = htmlEntryPoints[0] || entryPointsPrepared[0]
            const { entryProjectRelativeUrl } = firstEntryPoint
            const entryCompileUrl = resolveUrl(
              entryProjectRelativeUrl,
              compileDirectoryUrl,
            )
            const defaultImportMap = getDefaultImportMap({
              importMapFileUrl: entryCompileUrl,
              projectDirectoryUrl,
              compileDirectoryRelativeUrl,
            })
            const entryCompileServerUrl = resolveUrl(
              entryProjectRelativeUrl,
              compileDirectoryRemoteUrl,
            )
            return normalizeImportMap(defaultImportMap, entryCompileServerUrl)
          }
        }

        try {
          importMap = await fetchImportMap()
        } catch (e) {
          storeLatestJsenvPluginError(e)
          throw e
        }
        importResolver = await createImportResolverForImportmap({
          compileServerOrigin,
          compileDirectoryRelativeUrl,
          importMap,
          importMapUrl,
          importDefaultExtension,
          onBareSpecifierError: (error) => {
            storeLatestJsenvPluginError(error)
          },
        })
      }

      // rollup expects an input option, if we provide only an html file
      // without any script type module in it, we won't emit "chunk" and rollup will throw.
      // It is valid to build an html not referencing any js (rare but valid)
      // In that case jsenv emits an empty chunk and discards rollup warning about it
      // This chunk is later ignored in "generateBundle" hook
      let atleastOneChunkEmitted = false
      ressourceBuilder = createRessourceBuilder(
        {
          urlFetcher,
          urlLoader,
          parseRessource: async (ressource, notifiers) => {
            return parseRessource(ressource, notifiers, {
              format,
              systemJsUrl,
              projectDirectoryUrl,
              urlToOriginalFileUrl: (url) => {
                return asOriginalUrl(url)
              },
              urlToOriginalServerUrl: (url) => {
                return asOriginalServerUrl(url)
              },
              ressourceHintNeverUsedCallback: (linkInfo) => {
                logger.warn(formatRessourceHintNeverUsedWarning(linkInfo))
              },
              useImportMapToMaximizeCacheReuse,
              createImportMapForFilesUsedInJs,
              minify,
              minifyHtmlOptions,
              minifyCssOptions,
              minifyJsOptions,
            })
          },
        },
        {
          logLevel: loggerToLogLevel(logger),
          format,
          baseUrl: compileServerOrigin,
          buildDirectoryRelativeUrl: urlToRelativeUrl(
            buildDirectoryUrl,
            projectDirectoryUrl,
          ),

          asOriginalServerUrl,
          urlToCompiledServerUrl: (url) => {
            return asCompiledServerUrl(url)
          },
          urlToHumanUrl: (url) => {
            if (
              !url.startsWith("http:") &&
              !url.startsWith("https:") &&
              !url.startsWith("file:")
            ) {
              return url
            }
            return asOriginalUrl(url) || url
          },
          resolveRessourceUrl: ({
            ressourceSpecifier,
            isJsModule,
            // isRessourceHint,
            ressourceImporter,
          }) => {
            // Entry point is not a JS module and references a js module (html referencing js)
            if (
              ressourceImporter.isEntryPoint &&
              !ressourceImporter.isJsModule &&
              isJsModule
            ) {
              const importerCompiledUrl = asCompiledServerUrl(
                ressourceImporter.url,
              )
              const jsModuleUrl = resolveUrl(
                ressourceSpecifier,
                importerCompiledUrl,
              )
              return jsModuleUrl
            }

            let ressourceUrl
            if (
              ressourceImporter.isEntryPoint &&
              !ressourceImporter.isJsModule
            ) {
              // Entry point (likely html, unlikely css) is referecing a ressource
              // when importmap, parse the original importmap ressource
              if (ressourceSpecifier.endsWith(".importmap")) {
                ressourceUrl = resolveUrl(
                  ressourceSpecifier,
                  ressourceImporter.url,
                )
              } else {
                const importerCompiled = asCompiledServerUrl(
                  ressourceImporter.url,
                )
                ressourceUrl = resolveUrl(ressourceSpecifier, importerCompiled)
              }
            } else {
              ressourceUrl = resolveUrl(
                ressourceSpecifier,
                ressourceImporter.url,
              )
            }

            // ignore url outside project directory
            // a better version would console.warn about file url outside projectDirectoryUrl
            // and ignore them and console.info/debug about remote url (https, http, ...)
            const projectUrl = asProjectUrl(ressourceUrl)
            if (!projectUrl) {
              return { external: true, url: ressourceUrl }
            }
            return ressourceUrl
          },
          emitChunk,
          emitAsset,
          setAssetSource,
          onJsModuleReference: ({
            jsModuleUrl,
            jsModuleIsInline,
            jsModuleSource,
          }) => {
            atleastOneChunkEmitted = true
            if (jsModuleIsInline) {
              inlineModuleScripts[jsModuleUrl] = jsModuleSource
            }
            urlImporterMap[jsModuleUrl] = {
              url: resolveUrl(
                entryPointsPrepared[0].entryProjectRelativeUrl,
                compileDirectoryRemoteUrl,
              ),
              line: undefined,
              column: undefined,
            }
            jsModulesFromEntry[asRollupUrl(jsModuleUrl)] = true
          },
          lineBreakNormalization,
        },
      )

      await Promise.all(
        entryPointsPrepared.map(
          async ({
            entryContentType,
            entryProjectRelativeUrl,
            entryBuildRelativeUrl,
            entryBuffer,
          }) => {
            if (entryContentType === "application/javascript") {
              atleastOneChunkEmitted = true
              emitChunk({
                id: ensureRelativeUrlNotation(entryProjectRelativeUrl),
                name: entryBuildRelativeUrl,
                // don't hash js entry points
                fileName: entryBuildRelativeUrl,
              })
              return
            }

            if (
              entryContentType !== "text/html" &&
              entryContentType !== "text/css"
            ) {
              logger.warn(
                `Unusual content type for entry point, got "${entryContentType}" for ${entryProjectRelativeUrl}`,
              )
            }
            const entryUrl = resolveUrl(
              entryProjectRelativeUrl,
              compileServerOrigin,
            )
            await ressourceBuilder.createReferenceForEntryPoint({
              entryContentType,
              entryUrl,
              entryBuffer,
              entryBuildRelativeUrl,
            })
          },
        ),
      )
      if (!atleastOneChunkEmitted) {
        emitChunk({
          id: EMPTY_CHUNK_URL,
          fileName: "__empty__",
        })
      }
    },

    async resolveId(specifier, importer, { skipUrlImportTrace }) {
      if (importer === undefined) {
        if (specifier.endsWith(".html")) {
          importer = compileServerOrigin
        } else {
          importer = compileDirectoryRemoteUrl
        }
      } else {
        importer = asServerUrl(importer)
      }

      if (node && isSpecifierForNodeCoreModule(specifier)) {
        logger.debug(`${specifier} is native module -> marked as external`)
        return false
      }

      if (externalImportSpecifiers.includes(specifier)) {
        logger.debug(
          `${specifier} verifies externalImportSpecifiers -> marked as external`,
        )
        return { id: specifier, external: true }
      }

      if (inlineModuleScripts.hasOwnProperty(specifier)) {
        return specifier
      }

      if (isFileSystemPath(importer)) {
        importer = fileSystemPathToUrl(importer)
      }

      const importUrl = await importResolver.resolveImport(specifier, importer)
      if (!skipUrlImportTrace) {
        const existingImporter = urlImporterMap[importUrl]
        if (!existingImporter) {
          urlImporterMap[importUrl] = {
            url: importer,
            // rollup do not expose a way to know line and column for the static or dynamic import
            // referencing that file
            column: undefined,
            line: undefined,
          }
        }
      }

      // keep external url intact
      const importProjectUrl = asProjectUrl(importUrl)
      if (!importProjectUrl) {
        return { id: specifier, external: true }
      }

      if (externalUrlPredicate(asOriginalUrl(importProjectUrl))) {
        return { id: specifier, external: true }
      }

      // const rollupId = urlToRollupId(importUrl, { projectDirectoryUrl, compileServerOrigin })
      // logger.debug(`${specifier} imported by ${importer} resolved to ${importUrl}`)
      return asRollupUrl(importUrl)
    },

    resolveFileUrl: ({ referenceId, fileName }) => {
      const ressourceFound = ressourceBuilder.findRessource((ressource) => {
        return ressource.rollupReferenceId === referenceId
      })
      const buildRelativeUrl = ressourceFound
        ? ressourceFound.buildRelativeUrl
        : fileName

      if (format === "esmodule") {
        if (!node && useImportMapToMaximizeCacheReuse && urlVersioning) {
          const buildRelativeUrlWithoutVersion =
            buildRelativeUrlToFileName(buildRelativeUrl)
          return `window.__resolveImportUrl__("./${buildRelativeUrlWithoutVersion}", import.meta.url)`
        }
        return `new URL("${buildRelativeUrl}", import.meta.url)`
      }
      if (format === "systemjs") {
        if (useImportMapToMaximizeCacheReuse && urlVersioning) {
          const buildRelativeUrlWithoutVersion =
            buildRelativeUrlToFileName(buildRelativeUrl)
          return `new URL(System.resolve("./${buildRelativeUrlWithoutVersion}", module.meta.url))`
        }
        return `new URL(System.resolve("./${buildRelativeUrl}", module.meta.url))`
      }
      if (format === "global") {
        return `new URL("${buildRelativeUrl}", document.currentScript && document.currentScript.src || document.baseURI)`
      }
      if (format === "commonjs") {
        return `new URL("${buildRelativeUrl}", "file:///" + __filename.replace(/\\/g, "/"))`
      }
      return null
    },

    // https://rollupjs.org/guide/en#resolvedynamicimport
    // resolveDynamicImport: (specifier, importer) => {

    // },

    async load(rollupUrl) {
      if (rollupUrl === EMPTY_CHUNK_URL) {
        return ""
      }

      const loadResult = await urlLoader.loadUrl(rollupUrl, {
        cancellationToken,
        logger,
        // rollupModuleInfo: this.getModuleInfo(rollupUrl)
      })

      // Jsenv helpers are injected as import statements to provide code like babel helpers
      // For now we just compute the information that the target file is a jsenv helper
      // without doing anything special with "targetIsJsenvHelperFile" information
      const originalUrl = asOriginalUrl(rollupUrl)
      const isJsenvHelperFile = urlIsInsideOf(
        originalUrl,
        jsenvHelpersDirectoryInfo.url,
      )

      const url = asServerUrl(url)
      const importer = urlImporterMap[url]
      // Inform ressource builder that this js module exists
      // It can only be a js module and happens when:
      // - entry point (html) references js
      // - js is referenced by static or dynamic imports
      // For import assertions, the imported ressource (css,json,...)
      // is arelady converted to a js module
      ressourceBuilder.createReferenceFoundByRollup({
        // we don't want to emit a js chunk for every js file found
        // (However we want if the file is preload/prefetch by something else)
        // so we tell asset builder not to emit a chunk for this js reference
        // otherwise rollup would never concat module together
        referenceShouldNotEmitChunk: jsConcatenation,
        contentTypeExpected: "application/javascript",
        referenceUrl: importer.url,
        referenceColumn: importer.column,
        referenceLine: importer.line,
        ressourceSpecifier: loadResult.url,

        isJsenvHelperFile,
        contentType: "application/javascript",
        bufferBeforeBuild: Buffer.from(loadResult.code),
        isJsModule: true,
      })

      return {
        code: loadResult.code,
        map: loadResult.map,
      }
    },

    async transform(code, id) {
      let map = null
      // we should try/catch here?
      // because this.parse might fail
      const ast = this.parse(code, {
        // used to know node line and column
        locations: true,
      })
      // const moduleInfo = this.getModuleInfo(id)
      const url = asServerUrl(id)
      const importer = urlImporterMap[url]

      const importMetaResult = await transformImportMetaUrlReferences({
        code,
        map,
        ast,
        url,
        importerUrl: importer.url,

        ressourceBuilder,
        markBuildRelativeUrlAsUsedByJs,
      })
      code = importMetaResult.code
      map = importMetaResult.map

      const importAssertionsResult = await transformImportAssertions({
        code,
        map,
        ast,
        url,
        importerUrl: importer.url,
      })
      code = importAssertionsResult.code
      map = importAssertionsResult.map

      Object.keys(importAssertionsResult.importAssertions).forEach(
        (importedUrl) => {
          const { importNode } =
            importAssertionsResult.importAssertions[importedUrl]
          urlImporterMap[importedUrl] = {
            url,
            line: importNode.loc.start.line,
            column: importNode.loc.start.column,
          }
        },
      )

      return { code, map }
    },

    // resolveImportMeta: () => {}

    outputOptions: (outputOptions) => {
      const extension = extname(entryPointMap[Object.keys(entryPointMap)[0]])
      const outputExtension = extension === ".html" ? ".js" : extension

      outputOptions.paths = (id) => {
        const mapping = importPaths[id]
        if (mapping) {
          return mapping
        }
        if (format === "commonjs") {
          if (id.startsWith("node:")) {
            return id.slice("node:".length)
          }
        }
        return id
      }
      outputOptions.entryFileNames = () => {
        return `[name]${outputExtension}`
      }
      outputOptions.chunkFileNames = () => {
        // const originalUrl = asOriginalUrl(chunkInfo.facadeModuleId)
        // const basename = urlToBasename(originalUrl)
        if (useImportMapToMaximizeCacheReuse) {
          return `[name]${outputExtension}`
        }
        return `[name]-[hash]${outputExtension}`
      }

      // rollup does not expects to have http dependency in the mix: fix them
      outputOptions.sourcemapPathTransform = (relativePath, sourcemapPath) => {
        const sourcemapUrl = fileSystemPathToUrl(sourcemapPath)
        const url = relativePathToUrl(relativePath, sourcemapUrl)
        const serverUrl = asServerUrl(url)
        const finalUrl =
          urlFetcher.getUrlBeforeRedirection(serverUrl) || serverUrl
        const projectUrl = asProjectUrl(finalUrl)

        if (projectUrl) {
          relativePath = urlToRelativeUrl(projectUrl, sourcemapUrl)
          return relativePath
        }

        return finalUrl
      }

      const relativePathToUrl = (relativePath, sourcemapUrl) => {
        const rollupUrl = resolveUrl(relativePath, sourcemapUrl)
        // here relativePath contains a protocol
        // because rollup don't work with url but with filesystem paths
        // let fix it below
        const url = fixRollupUrl(rollupUrl)
        return url
      }

      return outputOptions
    },

    renderChunk: async (code, chunk) => {
      let map = chunk.map

      if (!minify) {
        return null
      }

      // TODO: maybe replace chunk.fileName with chunk.facadeModuleId?
      const result = await minifyJs(code, chunk.fileName, {
        sourceMap: {
          ...(map ? { content: JSON.stringify(map) } : {}),
          asObject: true,
        },
        ...(format === "global" ? { toplevel: false } : { toplevel: true }),
        ...minifyJsOptions,
      })
      code = result.code
      map = result.map
      return {
        code,
        map,
      }
    },

    async generateBundle(outputOptions, rollupResult) {
      const jsChunks = {}
      // rollupResult can be mutated by late asset emission
      // howeverl late chunk (js module) emission is not possible
      // as rollup rightfully prevent late js emission
      Object.keys(rollupResult).forEach((fileName) => {
        const file = rollupResult[fileName]
        if (file.type !== "chunk") {
          return
        }

        const { facadeModuleId } = file
        if (facadeModuleId === EMPTY_CHUNK_URL) {
          return
        }

        const fileCopy = { ...file }
        if (facadeModuleId) {
          fileCopy.url = asServerUrl(facadeModuleId)
        } else {
          const sourcePath = file.map.sources[file.map.sources.length - 1]
          const fileBuildUrl = resolveUrl(file.fileName, buildDirectoryUrl)
          const originalProjectUrl = resolveUrl(sourcePath, fileBuildUrl)
          fileCopy.url = asCompiledServerUrl(originalProjectUrl, {
            projectDirectoryUrl,
            compileServerOrigin,
            compileDirectoryRelativeUrl,
          })
        }

        jsChunks[fileName] = fileCopy
      })
      await ensureTopLevelAwaitTranspilationIfNeeded({
        format,
        transformTopLevelAwait,
      })

      const jsModuleBuild = {}
      Object.keys(jsChunks).forEach((fileName) => {
        const file = jsChunks[fileName]
        let buildRelativeUrl
        const canBeVersioned =
          asRollupUrl(file.url) in jsModulesFromEntry || !file.isEntry

        if (urlVersioning) {
          if (canBeVersioned && useImportMapToMaximizeCacheReuse) {
            buildRelativeUrl = computeBuildRelativeUrl(
              resolveUrl(fileName, buildDirectoryUrl),
              file.code,
              {
                pattern: `[name]-[hash][extname]`,
                lineBreakNormalization,
                contentType: "application/javascript",
              },
            )
          } else {
            buildRelativeUrl = fileName
          }
        } else {
          buildRelativeUrl = fileName
          fileName = rollupFileNameWithoutHash(fileName)
        }

        const originalProjectUrl = asOriginalUrl(file.url)
        const originalProjectRelativeUrl = urlToRelativeUrl(
          originalProjectUrl,
          projectDirectoryUrl,
        )

        jsModuleBuild[buildRelativeUrl] = file

        const jsRessource = ressourceBuilder.findRessource(
          (ressource) => ressource.url === file.url,
        )
        // avant buildEnd il se peut que certaines ressources ne soit pas encore inline
        // donc dans inlinedCallback on voudras ptet delete ces ressources?
        if (jsRessource && jsRessource.isInline) {
          buildInlineFileContents[fileName] = file.code
        } else {
          markBuildRelativeUrlAsUsedByJs(buildRelativeUrl)
          buildManifest[fileName] = buildRelativeUrl
          buildMappings[originalProjectRelativeUrl] = buildRelativeUrl
        }
      })

      // it's important to do this to emit late asset
      rollupEmitFile = (...args) => this.emitFile(...args)
      rollupSetAssetSource = (...args) => this.setAssetSource(...args)

      // malheureusement rollup ne permet pas de savoir lorsqu'un chunk
      // a fini d'etre résolu (parsing des imports statiques et dynamiques recursivement)
      // donc lorsque le build se termine on va indiquer
      // aux assets faisant référence a ces chunk js qu'ils sont terminés
      // et donc les assets peuvent connaitre le nom du chunk
      // et mettre a jour leur dépendance vers ce fichier js
      ressourceBuilder.rollupBuildEnd({ jsModuleBuild, buildManifest })
      // wait html files to be emitted
      await ressourceBuilder.getAllEntryPointsEmittedPromise()

      const assetBuild = {}
      Object.keys(rollupResult).forEach((rollupFileId) => {
        const file = rollupResult[rollupFileId]
        if (file.type !== "asset") {
          return
        }

        const assetRessource = ressourceBuilder.findRessource(
          (ressource) => ressource.relativeUrl === rollupFileId,
        )
        if (!assetRessource) {
          const buildRelativeUrl = rollupFileId
          const fileName = rollupFileNameWithoutHash(buildRelativeUrl)
          assetBuild[buildRelativeUrl] = file
          buildManifest[fileName] = buildRelativeUrl
          // the asset does not exists in the project it was generated during building
          // happens for sourcemap
          return
        }

        // ignore potential useless assets which happens when:
        // - sourcemap re-emitted
        // - importmap re-emitted to have buildRelativeUrlMap
        if (assetRessource.shouldBeIgnored) {
          return
        }

        const buildRelativeUrl = assetRessource.buildRelativeUrl
        const fileName = rollupFileNameWithoutHash(buildRelativeUrl)
        if (assetRessource.isInline) {
          buildInlineFileContents[fileName] = file.source
        } else {
          const originalProjectUrl = asOriginalUrl(assetRessource.url)
          const originalProjectRelativeUrl = urlToRelativeUrl(
            originalProjectUrl,
            projectDirectoryUrl,
          )
          // in case sourcemap is mutated, we must not trust rollup but the asset builder source instead
          file.source = assetRessource.bufferAfterBuild

          assetBuild[buildRelativeUrl] = file
          buildMappings[originalProjectRelativeUrl] = buildRelativeUrl
          buildManifest[fileName] = buildRelativeUrl
        }
      })

      rollupBuild = {
        ...jsModuleBuild,
        ...assetBuild,
      }
      rollupBuild = injectSourcemapInRollupBuild(rollupBuild, {
        buildDirectoryUrl,
      })

      // update rollupBuild, buildInlineFilesContents, buildManifest and buildMappings
      // in case some ressources where inlined by ressourceBuilder.rollupBuildEnd
      Object.keys(buildManifest).forEach((fileName) => {
        const buildRelativeUrl = buildManifest[fileName]
        const ressource = ressourceBuilder.findRessource(
          (ressource) => ressource.buildRelativeUrl === buildRelativeUrl,
        )
        if (ressource && ressource.isInline) {
          delete buildManifest[fileName]
          const originalProjectUrl = asOriginalUrl(ressource.url)
          delete buildMappings[
            urlToRelativeUrl(originalProjectUrl, projectDirectoryUrl)
          ]
          buildInlineFileContents[buildRelativeUrl] =
            rollupBuild[buildRelativeUrl].code
          delete rollupBuild[buildRelativeUrl]
        }
      })

      rollupBuild = sortObjectByPathnames(rollupBuild)
      buildManifest = sortObjectByPathnames(buildManifest)
      buildMappings = sortObjectByPathnames(buildMappings)
      Object.keys(rollupBuild).forEach((buildRelativeUrl) => {
        const { type, source, code } = rollupBuild[buildRelativeUrl]
        buildFileContents[buildRelativeUrl] = type === "asset" ? source : code
      })
      const buildDuration = Date.now() - buildStartMs
      buildStats = createBuildStats({
        buildFileContents,
        ressourceBuilder,
        buildDuration,
      })

      if (assetManifestFile) {
        const assetManifestFileUrl = resolveUrl(
          assetManifestFileRelativeUrl,
          buildDirectoryUrl,
        )
        await writeFile(
          assetManifestFileUrl,
          JSON.stringify(buildManifest, null, "  "),
        )
      }

      if (writeOnFileSystem) {
        const buildRelativeUrls = Object.keys(buildFileContents)
        await Promise.all(
          buildRelativeUrls.map(async (buildRelativeUrl) => {
            const fileBuildUrl = resolveUrl(buildRelativeUrl, buildDirectoryUrl)
            await writeFile(fileBuildUrl, buildFileContents[buildRelativeUrl])
          }),
        )
      }

      logger.info(
        formatBuildDoneInfo({
          buildStats,
          buildDirectoryRelativeUrl: urlToRelativeUrl(
            buildDirectoryUrl,
            projectDirectoryUrl,
          ),
        }),
      )
    },
  }

  const fetchImportMapFromUrl = async (importMapUrl, importer) => {
    const importMapResponse = await urlFetcher.fetchUrl(importMapUrl, {
      urlTrace: importer,
      contentTypeExpected: "application/importmap+json",
    })
    const importMap = await importMapResponse.json()
    const importMapNormalized = normalizeImportMap(
      importMap,
      importMapResponse.url,
    )
    return importMapNormalized
  }

  return {
    jsenvRollupPlugin,
    getLastErrorMessage: () => lastErrorMessage,
    getResult: () => {
      return {
        rollupBuild,
        urlResponseBodyMap: urlLoader.getUrlResponseBodyMap(),
        buildMappings,
        buildManifest,
        buildImportMap: createImportMapForFilesUsedInJs(),
        buildFileContents,
        buildInlineFileContents,
        buildStats,
      }
    },
    asOriginalUrl,
    asProjectUrl,
    rollupGetModuleInfo,
  }
}

const ensureTopLevelAwaitTranspilationIfNeeded = async ({
  format,
  transformTopLevelAwait,
}) => {
  if (!transformTopLevelAwait) {
    return
  }

  if (format === "esmodule") {
    // transform-async-to-promises won't be able to transform top level await
    // for "esmodule", so it would be useless
    return
  }

  if (format === "systemjs") {
    // top level await is an async function for systemjs
    return
  }
}

const prepareEntryPoints = async (
  entryPointMap,
  {
    logger,
    projectDirectoryUrl,
    buildDirectoryUrl,
    compileServerOrigin,
    urlFetcher,
  },
) => {
  const entryFileRelativeUrls = Object.keys(entryPointMap)
  const entryPointsPrepared = []
  await entryFileRelativeUrls.reduce(async (previous, entryFileRelativeUrl) => {
    await previous

    const entryProjectUrl = resolveUrl(
      entryFileRelativeUrl,
      projectDirectoryUrl,
    )
    const entryBuildUrl = resolveUrl(
      entryPointMap[entryFileRelativeUrl],
      buildDirectoryUrl,
    )

    const entryProjectRelativeUrl = urlToRelativeUrl(
      entryProjectUrl,
      projectDirectoryUrl,
    )
    const entryBuildRelativeUrl = urlToRelativeUrl(
      entryBuildUrl,
      buildDirectoryUrl,
    )

    logger.debug(`${infoSign} load entry point ${entryProjectRelativeUrl}`)

    const entryServerUrl = resolveUrl(
      entryProjectRelativeUrl,
      compileServerOrigin,
    )

    const entryResponse = await urlFetcher.fetchUrl(entryServerUrl, {
      urlTrace: `entryPointMap`,
    })
    const entryContentType = entryResponse.headers["content-type"]
    const isHtml = entryContentType === "text/html"

    entryPointsPrepared.push({
      entryContentType:
        entryContentType === "text/javascript"
          ? "application/javascript"
          : entryContentType,
      entryProjectRelativeUrl,
      entryBuildRelativeUrl,
      ...(isHtml
        ? { entryBuffer: Buffer.from(await entryResponse.arrayBuffer()) }
        : {}),
    })
  }, Promise.resolve())

  return entryPointsPrepared
}

const fixRollupUrl = (rollupUrl) => {
  // fix rollup not supporting source being http
  const httpIndex = rollupUrl.indexOf(`http:/`, 1)
  if (httpIndex > -1) {
    return `http://${rollupUrl.slice(httpIndex + `http:/`.length)}`
  }

  const httpsIndex = rollupUrl.indexOf("https:/", 1)
  if (httpsIndex > -1) {
    return `https://${rollupUrl.slice(httpsIndex + `https:/`.length)}`
  }

  const fileIndex = rollupUrl.indexOf("file:", 1)
  if (fileIndex > -1) {
    return `file://${rollupUrl.slice(fileIndex + `file:`.length)}`
  }

  return rollupUrl
}

const rollupFileNameWithoutHash = (fileName) => {
  return fileName.replace(/-[a-z0-9]{8,}(\..*?)?$/, (_, afterHash = "") => {
    return afterHash
  })
}

// otherwise importmap handle it as a bare import
const ensureRelativeUrlNotation = (relativeUrl) => {
  if (relativeUrl.startsWith("../")) {
    return relativeUrl
  }
  return `./${relativeUrl}`
}

const externalImportUrlPatternsToExternalUrlPredicate = (
  externalImportUrlPatterns,
  projectDirectoryUrl,
) => {
  const externalImportUrlStructuredMetaMap = normalizeStructuredMetaMap(
    {
      external: {
        ...externalImportUrlPatterns,
        "node_modules/@jsenv/core/helpers/": false,
      },
    },
    projectDirectoryUrl,
  )
  return (url) => {
    const meta = urlToMeta({
      url,
      structuredMetaMap: externalImportUrlStructuredMetaMap,
    })
    return Boolean(meta.external)
  }
}

const acceptsJsonContentType = ({ node, format }) => {
  if (!node) {
    return false
  }
  if (format === "commonjs") {
    return true
  }
  if (process.execArgv.includes("--experimental-json-modules")) {
    return true
  }
  return false
}
