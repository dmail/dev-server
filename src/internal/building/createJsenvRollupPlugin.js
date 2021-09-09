/* eslint-disable import/max-dependencies */
import { extname } from "node:path"
import { normalizeImportMap } from "@jsenv/import-map"
import { isSpecifierForNodeCoreModule } from "@jsenv/import-map/src/isSpecifierForNodeCoreModule.js"
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

import {
  urlToServerUrl,
  urlToProjectUrl,
  urlToOriginalServerUrl,
  urlToOriginalProjectUrl,
  urlToCompiledServerUrl,
} from "@jsenv/core/src/internal/url-conversion.js"
import { fetchUrl } from "@jsenv/core/src/internal/fetchUrl.js"
import { validateResponseStatusIsOk } from "@jsenv/core/src/internal/validateResponseStatusIsOk.js"
import { transformJs } from "@jsenv/core/src/internal/compiling/js-compilation-service/transformJs.js"
import { setJavaScriptSourceMappingUrl } from "@jsenv/core/src/internal/sourceMappingURLUtils.js"
import { sortObjectByPathnames } from "@jsenv/core/src/internal/building/sortObjectByPathnames.js"
import { jsenvHelpersDirectoryInfo } from "@jsenv/core/src/internal/jsenvInternalFiles.js"

import {
  formatBuildStartLog,
  formatUseImportMapFromHtml,
  formatImportmapOutsideCompileDirectory,
  formatFileNotFound,
  formatRessourceHintNeverUsedWarning,
  formatBuildDoneInfo,
} from "./build_logs.js"
import { importMapsFromHtml } from "./html/htmlScan.js"
import { parseTarget } from "./parseTarget.js"
import { fetchSourcemap } from "./fetchSourcemap.js"
import { createAssetBuilder, referenceToCodeForRollup } from "./asset-builder.js"
import { computeBuildRelativeUrl } from "./url-versioning.js"
import { transformImportMetaUrlReferences } from "./transformImportMetaUrlReferences.js"

import { minifyJs } from "./js/minifyJs.js"
import { createImportResolverForNode } from "../import-resolution/import-resolver-node.js"
import { createImportResolverForImportmap } from "../import-resolution/import-resolver-importmap.js"
import { getDefaultImportMap } from "../import-resolution/importmap-default.js"

// use a fake and predictable compile server origin
// because rollup will check the dependencies url
// when computing the file hash
// https://github.com/rollup/rollup/blob/d6131378f9481a442aeaa6d4e608faf3303366dc/src/Chunk.ts#L483
// this way file hash remains the same when file content does not change
const STATIC_COMPILE_SERVER_AUTHORITY = "//jsenv.com"

export const createJsenvRollupPlugin = async ({
  cancellationToken,
  logger,

  entryPointMap,
  projectDirectoryUrl,
  compileServerOrigin,
  compileDirectoryRelativeUrl,

  urlOverrides,
  importResolutionMethod,
  importMapFileRelativeUrl,
  importDefaultExtension,
  externalImportSpecifiers,
  externalImportUrlPatterns,
  importPaths,

  babelPluginMap,
  transformTopLevelAwait,
  node,

  format,
  jsConcatenation,
  urlVersioning,
  lineBreakNormalization,
  useImportMapToImproveLongTermCaching,
  systemJsUrl,
  minify,
  minifyJsOptions,
  minifyCssOptions,
  minifyHtmlOptions,
  assetManifestFile,
  assetManifestFileRelativeUrl,
  writeOnFileSystem,

  buildDirectoryUrl,
}) => {
  const urlImporterMap = {}
  const urlResponseBodyMap = {}
  const virtualModules = {}
  const urlRedirectionMap = {}
  const jsModulesFromEntry = {}

  let lastErrorMessage
  const storeLatestJsenvPluginError = (error) => {
    lastErrorMessage = error.message
  }

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
    buildManifest[rollupFileNameWithoutHash(buildRelativeUrl)] = buildRelativeUrl
  }
  const createImportMapForFilesUsedInJs = () => {
    const topLevelMappings = {}
    buildRelativeUrlsUsedInJs.sort(comparePathnames).forEach((buildRelativeUrl) => {
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

  const compileServerOriginForRollup = String(
    new URL(STATIC_COMPILE_SERVER_AUTHORITY, compileServerOrigin),
  ).slice(0, -1)

  const urlToUrlForRollup = (url) => {
    if (url.startsWith(`${compileServerOrigin}/`)) {
      return `${compileServerOriginForRollup}/${url.slice(`${compileServerOrigin}/`.length)}`
    }
    return url
  }

  const rollupUrlToServerUrl = (url) => {
    if (url.startsWith(`${compileServerOriginForRollup}/`)) {
      return `${compileServerOrigin}/${url.slice(`${compileServerOriginForRollup}/`.length)}`
    }
    return urlToServerUrl(url, { projectDirectoryUrl, compileServerOrigin })
  }

  const rollupUrlToProjectUrl = (url) => {
    return urlToProjectUrl(rollupUrlToServerUrl(url) || url, {
      projectDirectoryUrl,
      compileServerOrigin,
    })
  }

  const rollupUrlToOriginalProjectUrl = (url) => {
    return urlToOriginalProjectUrl(rollupUrlToServerUrl(url) || url, {
      projectDirectoryUrl,
      compileServerOrigin,
      compileDirectoryRelativeUrl,
    })
  }

  const rollupUrlToCompiledServerUrl = (url) => {
    return urlToCompiledServerUrl(rollupUrlToServerUrl(url) || url, {
      projectDirectoryUrl,
      compileServerOrigin,
      compileDirectoryRelativeUrl,
    })
  }

  const EMPTY_CHUNK_URL = resolveUrl("__empty__", projectDirectoryUrl)

  const compileDirectoryUrl = resolveDirectoryUrl(compileDirectoryRelativeUrl, projectDirectoryUrl)
  const compileDirectoryRemoteUrl = resolveDirectoryUrl(
    compileDirectoryRelativeUrl,
    compileServerOrigin,
  )

  let assetBuilder
  let rollupEmitFile = () => {}
  let rollupSetAssetSource = () => {}
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
      logger.info(
        formatBuildStartLog({
          entryPointMap,
        }),
      )

      const entryPointsPrepared = await prepareEntryPoints(entryPointMap, {
        projectDirectoryUrl,
        buildDirectoryUrl,
        compileServerOrigin,
        fetchFile: jsenvFetchUrl,
      })
      const htmlEntryPoints = entryPointsPrepared.filter((entryPointPrepared) => {
        return entryPointPrepared.entryContentType === "text/html"
      })
      const htmlEntryPointCount = htmlEntryPoints.length
      if (htmlEntryPointCount > 1) {
        const error = new Error(
          `Cannot handle more than one html entry point, got ${htmlEntryPointCount}`,
        )
        storeLatestJsenvPluginError(error)
        throw error
      }

      // https://github.com/easesu/rollup-plugin-html-input/blob/master/index.js
      // https://rollupjs.org/guide/en/#thisemitfileemittedfile-emittedchunk--emittedasset--string
      rollupEmitFile = (...args) => this.emitFile(...args)
      rollupSetAssetSource = (...args) => this.setAssetSource(...args)

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
          const htmlUrl = resolveUrl(htmlEntryPoint.entryProjectRelativeUrl, projectDirectoryUrl)
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
              urlToCompiledServerUrl(importMapInfoFromHtml.htmlUrl, {
                projectDirectoryUrl,
                compileServerOrigin,
                compileDirectoryRelativeUrl,
              }),
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
                urlToOriginalProjectUrl(importMapUrl, {
                  projectDirectoryUrl,
                  compileServerOrigin,
                  compileDirectoryRelativeUrl,
                }),
                importMapInfoFromHtml.htmlUrl,
              )
            }
          } else {
            const firstHtmlEntryPoint = htmlEntryPoints[0]
            const htmlProjectRelativeUrl = firstHtmlEntryPoint.entryProjectRelativeUrl
            const htmlCompiledUrl = resolveUrl(htmlProjectRelativeUrl, compileDirectoryRemoteUrl)
            importMapUrl = htmlCompiledUrl
            fetchImportMap = () => {
              const importMapRaw = JSON.parse(importMapInfoFromHtml.text)
              const importMap = normalizeImportMap(importMapRaw, importMapUrl)
              return importMap
            }
          }
        } else if (importMapFileRelativeUrl) {
          importMapUrl = resolveUrl(importMapFileRelativeUrl, compileDirectoryRemoteUrl)
          fetchImportMap = () => {
            return fetchImportMapFromUrl(
              importMapUrl,
              urlToOriginalProjectUrl(importMapUrl, {
                projectDirectoryUrl,
                compileServerOrigin,
                compileDirectoryRelativeUrl,
              }),
              "importMapFileRelativeUrl parameter",
            )
          }
        } else {
          // there is no importmap, its' fine it's not mandatory to use one
          fetchImportMap = () => {
            const firstEntryPoint = htmlEntryPoints[0] || entryPointsPrepared[0]
            const { entryProjectRelativeUrl } = firstEntryPoint
            const entryCompileUrl = resolveUrl(entryProjectRelativeUrl, compileDirectoryUrl)
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

      // rollup will yell at us telling we did not provide an input option
      // if we provide only an html file without any script type module in it
      // but this can be desired to produce a build with only assets (html, css, images)
      // without any js
      // we emit an empty chunk, discards rollup warning about it. This chunk is
      // later ignored by in generateBundle hooks
      let atleastOneChunkEmitted = false
      assetBuilder = createAssetBuilder(
        {
          parse: async (target, notifiers) => {
            return parseTarget(target, notifiers, {
              format,
              systemJsUrl,
              urlToOriginalFileUrl: (url) => {
                return urlToOriginalProjectUrl(url, {
                  projectDirectoryUrl,
                  compileServerOrigin,
                  compileDirectoryRelativeUrl,
                })
              },
              urlToOriginalServerUrl: (url) => {
                return urlToOriginalServerUrl(url, {
                  projectDirectoryUrl,
                  compileServerOrigin,
                  compileDirectoryRelativeUrl,
                })
              },
              ressourceHintNeverUsedCallback: (linkInfo) => {
                logger.warn(formatRessourceHintNeverUsedWarning(linkInfo))
              },
              useImportMapToImproveLongTermCaching,
              createImportMapForFilesUsedInJs,
              minify,
              minifyHtmlOptions,
              minifyCssOptions,
              minifyJsOptions,
            })
          },
          fetch: async (url, importer) => {
            const moduleResponse = await jsenvFetchUrl(url, importer)
            return moduleResponse
          },
        },
        {
          logLevel: loggerToLogLevel(logger),
          format,
          baseUrl: compileServerOrigin,
          buildDirectoryRelativeUrl: urlToRelativeUrl(buildDirectoryUrl, projectDirectoryUrl),

          urlToCompiledServerUrl: (url) => {
            return urlToCompiledServerUrl(url, {
              projectDirectoryUrl,
              compileServerOrigin,
              compileDirectoryRelativeUrl,
            })
          },
          urlToHumanUrl: (url) => {
            if (!url.startsWith("http:") && !url.startsWith("https:") && !url.startsWith("file:")) {
              return url
            }
            const originalProjectUrl = urlToOriginalProjectUrl(url, {
              projectDirectoryUrl,
              compileServerOrigin,
              compileDirectoryRelativeUrl,
            })
            if (!originalProjectUrl) {
              return url
            }
            return urlToRelativeUrl(originalProjectUrl, projectDirectoryUrl)
          },
          loadUrl: (url) => urlResponseBodyMap[url],
          resolveTargetUrl: ({
            targetSpecifier,
            targetIsJsModule,
            importerUrl,
            importerIsEntry,
            importerIsJsModule,
          }) => {
            const isHtmlEntryPoint = importerIsEntry && !importerIsJsModule
            const isHtmlEntryPointReferencingAJsModule = isHtmlEntryPoint && targetIsJsModule

            // when html references a js we must wait for the compiled version of js
            if (isHtmlEntryPointReferencingAJsModule) {
              const htmlCompiledUrl = rollupUrlToCompiledServerUrl(importerUrl)
              const jsModuleUrl = resolveUrl(targetSpecifier, htmlCompiledUrl)
              return jsModuleUrl
            }

            let targetUrl
            if (
              isHtmlEntryPoint &&
              // parse and handle the untransformed importmap, not the one from compile server
              !targetSpecifier.endsWith(".importmap")
            ) {
              const htmlCompiledUrl = rollupUrlToCompiledServerUrl(importerUrl)
              targetUrl = resolveUrl(targetSpecifier, htmlCompiledUrl)
            } else {
              targetUrl = resolveUrl(targetSpecifier, importerUrl)
            }
            // ignore url outside project directory
            // a better version would console.warn about file url outside projectDirectoryUrl
            // and ignore them and console.info/debug about remote url (https, http, ...)
            const projectUrl = rollupUrlToProjectUrl(targetUrl)
            if (!projectUrl) {
              return { external: true, url: targetUrl }
            }
            return targetUrl
          },
          emitChunk,
          emitAsset,
          setAssetSource,
          onJsModuleReference: ({ jsModuleUrl, jsModuleIsInline, jsModuleSource }) => {
            atleastOneChunkEmitted = true
            if (jsModuleIsInline) {
              virtualModules[jsModuleUrl] = jsModuleSource
            }
            urlImporterMap[jsModuleUrl] = resolveUrl(
              entryPointsPrepared[0].entryProjectRelativeUrl,
              compileDirectoryRemoteUrl,
            )
            jsModulesFromEntry[urlToUrlForRollup(jsModuleUrl)] = true
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

            if (entryContentType !== "text/html") {
              logger.warn(
                `Unusual content type for ${entryProjectRelativeUrl} ${entryContentType} will be handled as text/html`,
              )
            }
            const entryUrl = resolveUrl(entryProjectRelativeUrl, compileServerOrigin)
            await assetBuilder.createReferenceForHTMLEntry({
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

    async resolveId(specifier, importer) {
      if (importer === undefined) {
        if (specifier.endsWith(".html")) {
          importer = compileServerOrigin
        } else {
          importer = compileDirectoryRemoteUrl
        }
      } else {
        importer = rollupUrlToServerUrl(importer)
      }

      if (node && isSpecifierForNodeCoreModule(specifier)) {
        logger.debug(`${specifier} is native module -> marked as external`)
        return false
      }

      if (externalImportSpecifiers.includes(specifier)) {
        logger.debug(`${specifier} verifies externalImportSpecifiers -> marked as external`)
        return { id: specifier, external: true }
      }

      if (virtualModules.hasOwnProperty(specifier)) {
        return specifier
      }

      if (isFileSystemPath(importer)) {
        importer = fileSystemPathToUrl(importer)
      }

      const importUrl = await importResolver.resolveImport(specifier, importer)
      const existingImporter = urlImporterMap[importUrl]
      if (!existingImporter) {
        urlImporterMap[importUrl] = importer
      }

      // keep external url intact
      const importProjectUrl = rollupUrlToProjectUrl(importUrl)
      if (!importProjectUrl) {
        return { id: specifier, external: true }
      }

      if (externalUrlPredicate(rollupUrlToOriginalProjectUrl(importProjectUrl))) {
        return { id: specifier, external: true }
      }

      // const rollupId = urlToRollupId(importUrl, { projectDirectoryUrl, compileServerOrigin })
      // logger.debug(`${specifier} imported by ${importer} resolved to ${importUrl}`)
      return urlToUrlForRollup(importUrl)
    },

    resolveFileUrl: ({ referenceId, fileName }) => {
      const assetTarget = assetBuilder.findAsset((asset) => {
        return asset.rollupReferenceId === referenceId
      })
      const buildRelativeUrl = assetTarget ? assetTarget.targetBuildRelativeUrl : fileName
      if (format === "esmodule") {
        return `new URL("${buildRelativeUrl}", import.meta.url).href`
      }
      if (format === "systemjs") {
        return `System.resolve("./${buildRelativeUrl}", module.meta.url)`
      }
      if (format === "global") {
        return `new URL("${buildRelativeUrl}", document.currentScript && document.currentScript.src || document.baseURI).href`
      }
      if (format === "commonjs") {
        return `new URL("${buildRelativeUrl}", "file:///" + __filename.replace(/\\/g, "/")).href`
      }
      return null
    },

    // https://rollupjs.org/guide/en#resolvedynamicimport
    // resolveDynamicImport: (specifier, importer) => {

    // },

    async load(id) {
      if (id === EMPTY_CHUNK_URL) {
        return ""
      }

      const moduleInfo = this.getModuleInfo(id)
      const url = rollupUrlToServerUrl(id)

      // logger.debug(`loads ${url}`)
      const {
        responseUrl,
        responseContentType,
        contentRaw,
        content = "",
        map,
      } = await loadModule(url, {
        moduleInfo,
      })

      const importerUrl = urlImporterMap[url]

      // Jsenv helpers are injected as import statements to provide code like babel helpers
      // For now we just compute the information that the target file is a jsenv helper
      // without doing anything special with "targetIsJsenvHelperFile" information
      const originalUrl = rollupUrlToOriginalProjectUrl(url)
      const targetIsJsenvHelperFile = urlIsInsideOf(originalUrl, jsenvHelpersDirectoryInfo.url)

      // Store the fact that this file is referenced by js (static or dynamic import)
      assetBuilder.createReference({
        // we don't want to emit a js chunk for every js file found
        // (However we want if the file is preload/prefetch by something else)
        // so we tell asset builder not to emit a chunk for this js reference
        // otherwise rollup would never concat module together
        referenceShouldNotEmitChunk: jsConcatenation,
        referenceExpectedContentType: responseContentType,
        referenceUrl: importerUrl,
        referenceTargetSpecifier: responseUrl,
        // rollup do not provide a way to know line and column for the static or dynamic import
        // referencing that file
        referenceColumn: undefined,
        referenceLine: undefined,

        targetIsJsenvHelperFile,
        targetContentType: responseContentType,
        targetBuffer: Buffer.from(content),
        targetIsJsModule: responseContentType === "application/javascript",
      })

      saveUrlResponseBody(responseUrl, contentRaw)
      // handle redirection
      if (responseUrl !== url) {
        saveUrlResponseBody(url, contentRaw)
      }

      return { code: content, map }
    },

    async transform(code, id) {
      const ast = this.parse(code, {
        // used to know node line and column
        locations: true,
      })
      // const moduleInfo = this.getModuleInfo(id)
      const url = rollupUrlToServerUrl(id)
      const importerUrl = urlImporterMap[url]
      return transformImportMetaUrlReferences({
        url,
        importerUrl,
        code,
        ast,
        assetBuilder,
        fetch: jsenvFetchUrl,
        markBuildRelativeUrlAsUsedByJs,
      })
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
      outputOptions.entryFileNames = `[name]${outputExtension}`
      outputOptions.chunkFileNames =
        useImportMapToImproveLongTermCaching || !urlVersioning
          ? `[name]${outputExtension}`
          : `[name]-[hash]${outputExtension}`

      // rollup does not expects to have http dependency in the mix: fix them
      outputOptions.sourcemapPathTransform = (relativePath, sourcemapPath) => {
        const sourcemapUrl = fileSystemPathToUrl(sourcemapPath)
        const url = relativePathToUrl(relativePath, sourcemapUrl)
        const serverUrl = rollupUrlToServerUrl(url)
        const finalUrl = serverUrl in urlRedirectionMap ? urlRedirectionMap[serverUrl] : serverUrl
        const projectUrl = rollupUrlToProjectUrl(finalUrl)

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
          fileCopy.url = rollupUrlToServerUrl(facadeModuleId)
        } else {
          const sourcePath = file.map.sources[file.map.sources.length - 1]
          const fileBuildUrl = resolveUrl(file.fileName, buildDirectoryUrl)
          const originalProjectUrl = resolveUrl(sourcePath, fileBuildUrl)
          fileCopy.url = urlToCompiledServerUrl(originalProjectUrl, {
            projectDirectoryUrl,
            compileServerOrigin,
            compileDirectoryRelativeUrl,
          })
        }

        jsChunks[fileName] = fileCopy
      })
      await ensureTopLevelAwaitTranspilationIfNeeded({
        jsChunks,
        format,
        babelPluginMap,
        transformTopLevelAwait,
        projectDirectoryUrl,
        rollupUrlToProjectUrl,
        minify,
        minifyJsOptions,
      })

      const jsModuleBuild = {}
      Object.keys(jsChunks).forEach((fileName) => {
        const file = jsChunks[fileName]
        let buildRelativeUrl
        const canBeVersioned = urlToUrlForRollup(file.url) in jsModulesFromEntry || !file.isEntry
        if (urlVersioning && useImportMapToImproveLongTermCaching) {
          if (canBeVersioned) {
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

        const originalProjectUrl = rollupUrlToOriginalProjectUrl(file.url)
        const originalProjectRelativeUrl = urlToRelativeUrl(originalProjectUrl, projectDirectoryUrl)

        if (canBeVersioned) {
          markBuildRelativeUrlAsUsedByJs(buildRelativeUrl)
        }

        jsModuleBuild[buildRelativeUrl] = file
        buildManifest[fileName] = buildRelativeUrl
        buildMappings[originalProjectRelativeUrl] = buildRelativeUrl
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
      assetBuilder.buildEnd({ jsModuleBuild, buildManifest })
      // wait html files to be emitted
      await assetBuilder.getAllAssetEntryEmittedPromise()

      const assetBuild = {}
      Object.keys(rollupResult).forEach((rollupFileId) => {
        const file = rollupResult[rollupFileId]
        if (file.type !== "asset") {
          return
        }

        const assetTarget = assetBuilder.findAsset(
          (asset) => asset.targetRelativeUrl === rollupFileId,
        )
        if (!assetTarget) {
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
        if (assetTarget.shouldBeIgnored) {
          return
        }

        const buildRelativeUrl = assetTarget.targetBuildRelativeUrl
        const fileName = rollupFileNameWithoutHash(buildRelativeUrl)
        const originalProjectUrl = urlToOriginalProjectUrl(assetTarget.targetUrl, {
          projectDirectoryUrl,
          compileServerOrigin,
          compileDirectoryRelativeUrl,
        })
        const originalProjectRelativeUrl = urlToRelativeUrl(originalProjectUrl, projectDirectoryUrl)
        // in case sourcemap is mutated, we must not trust rollup but the asset builder source instead
        file.source = assetTarget.targetBuildBuffer

        assetBuild[buildRelativeUrl] = file
        buildMappings[originalProjectRelativeUrl] = buildRelativeUrl
        buildManifest[fileName] = buildRelativeUrl
      })

      rollupBuild = {
        ...jsModuleBuild,
        ...assetBuild,
      }

      rollupBuild = sortObjectByPathnames(rollupBuild)
      buildManifest = sortObjectByPathnames(buildManifest)
      buildMappings = sortObjectByPathnames(buildMappings)

      if (assetManifestFile) {
        const assetManifestFileUrl = resolveUrl(assetManifestFileRelativeUrl, buildDirectoryUrl)
        await writeFile(assetManifestFileUrl, JSON.stringify(buildManifest, null, "  "))
      }

      logger.info(
        formatBuildDoneInfo({
          rollupBuild,
          buildDirectoryRelativeUrl: urlToRelativeUrl(buildDirectoryUrl, projectDirectoryUrl),
        }),
      )

      if (writeOnFileSystem) {
        await Promise.all(
          Object.keys(rollupBuild).map(async (buildRelativeUrl) => {
            const file = rollupBuild[buildRelativeUrl]
            const fileBuildUrl = resolveUrl(buildRelativeUrl, buildDirectoryUrl)

            if (file.type === "chunk") {
              let fileCode = file.code
              if (file.map) {
                const sourcemapBuildRelativeUrl = `${buildRelativeUrl}.map`
                if (sourcemapBuildRelativeUrl in rollupBuild === false) {
                  const sourcemapBuildUrl = resolveUrl(sourcemapBuildRelativeUrl, buildDirectoryUrl)
                  const fileSourcemapString = JSON.stringify(file.map, null, "  ")
                  await writeFile(sourcemapBuildUrl, fileSourcemapString)

                  const sourcemapBuildUrlRelativeToFileBuildUrl = urlToRelativeUrl(
                    sourcemapBuildUrl,
                    fileBuildUrl,
                  )
                  fileCode = setJavaScriptSourceMappingUrl(
                    fileCode,
                    sourcemapBuildUrlRelativeToFileBuildUrl,
                  )
                }
              }
              await writeFile(fileBuildUrl, fileCode)
            } else {
              await writeFile(fileBuildUrl, file.source)
            }
          }),
        )
      }
    },
  }

  const saveUrlResponseBody = (url, responseBody) => {
    urlResponseBodyMap[url] = responseBody
    const projectUrl = rollupUrlToProjectUrl(url)
    if (projectUrl && projectUrl !== url) {
      urlResponseBodyMap[projectUrl] = responseBody
    }
  }

  const loadModule = async (
    moduleUrl,
    // {
    //   moduleInfo
    // },
  ) => {
    if (moduleUrl in virtualModules) {
      const codeInput = virtualModules[moduleUrl]

      const { code, map } = await transformJs({
        projectDirectoryUrl,
        code: codeInput,
        url: rollupUrlToProjectUrl(moduleUrl), // transformJs expect a file:// url
        babelPluginMap,
        // moduleOutFormat: format // we are compiling for rollup output must be "esmodule"
      })

      return {
        responseUrl: moduleUrl,
        contentRaw: code,
        content: code,
        map,
      }
    }

    const importerUrl = urlImporterMap[moduleUrl]
    const moduleResponse = await jsenvFetchUrl(
      moduleUrl,
      rollupUrlToProjectUrl(importerUrl) || importerUrl,
    )
    const responseContentType = moduleResponse.headers["content-type"] || ""
    const commonData = {
      responseContentType,
      responseUrl: moduleResponse.url,
    }

    // keep this in sync with module-registration.js
    if (
      responseContentType === "application/javascript" ||
      responseContentType === "text/javascript"
    ) {
      const jsModuleString = await moduleResponse.text()
      const map = await fetchSourcemap(moduleUrl, jsModuleString, {
        cancellationToken,
        logger,
      })

      return {
        ...commonData,
        responseContentType: "application/javascript", // normalize
        contentRaw: jsModuleString,
        content: jsModuleString,
        map,
      }
    }

    if (responseContentType === "application/json" || responseContentType.endsWith("+json")) {
      const responseBodyAsString = await moduleResponse.text()
      // there is no need to minify the json string
      // because it becomes valid javascript
      // that will be minified by minifyJs inside renderChunk
      const json = responseBodyAsString
      return {
        ...commonData,
        contentRaw: json,
        content: `export default ${json}`,
      }
    }

    const moduleResponseBodyAsBuffer = Buffer.from(await moduleResponse.arrayBuffer())
    const targetContentType = moduleResponse.headers["content-type"]
    const assetReferenceForImport = await assetBuilder.createReferenceFoundInJs({
      // Reference to this target is corresponds to a static or dynamic import.
      // found in a given file (importerUrl).
      // But we don't know the line and colum because rollup
      // does not tell us that information
      jsUrl: importerUrl,
      jsLine: undefined,
      jsColumn: undefined,

      targetSpecifier: moduleResponse.url,
      targetContentType,
      targetBuffer: moduleResponseBodyAsBuffer,
    })
    if (assetReferenceForImport) {
      markBuildRelativeUrlAsUsedByJs(assetReferenceForImport.target.targetBuildRelativeUrl)
      const content = `export default ${referenceToCodeForRollup(assetReferenceForImport)}`

      return {
        ...commonData,
        contentRaw: String(moduleResponseBodyAsBuffer),
        content,
      }
    }

    return {
      ...commonData,
      contentRaw: String(moduleResponseBodyAsBuffer),
      content: String(moduleResponseBodyAsBuffer),
    }
  }

  const jsenvFetchUrl = async (url, importer) => {
    const response = await fetchUrl(url, {
      cancellationToken,
      ignoreHttpsError: true,
    })

    importer =
      rollupUrlToOriginalProjectUrl(importer) || rollupUrlToProjectUrl(importer) || importer

    if (response.status === 404) {
      const jsenvPluginError = new Error(
        formatFileNotFound(
          rollupUrlToOriginalProjectUrl(response.url) ||
            rollupUrlToProjectUrl(response.url) ||
            response.url,
          importer,
        ),
      )
      storeLatestJsenvPluginError(jsenvPluginError)
      throw jsenvPluginError
    }

    const okValidation = await validateResponseStatusIsOk(response, { importer })
    if (!okValidation.valid) {
      const jsenvPluginError = new Error(okValidation.message)
      storeLatestJsenvPluginError(jsenvPluginError)
      throw jsenvPluginError
    }

    const responseUrl = response.url
    if (url !== responseUrl) {
      urlRedirectionMap[url] = responseUrl
    }

    return response
  }

  return {
    jsenvRollupPlugin,
    getLastErrorMessage: () => lastErrorMessage,
    getResult: () => {
      return {
        rollupBuild,
        urlResponseBodyMap,
        buildMappings,
        buildManifest,
        buildImportMap: createImportMapForFilesUsedInJs(),
      }
    },
  }
}

const ensureTopLevelAwaitTranspilationIfNeeded = async ({
  jsChunks,
  format,
  transformTopLevelAwait,
  babelPluginMap,
  projectDirectoryUrl,
  rollupUrlToProjectUrl,
  minify,
  minifyJsOptions,
}) => {
  if (!transformTopLevelAwait) {
    return
  }

  if (format !== "systemjs") {
    // transform-async-to-promises won't be able to transform top level await
    // for "esmodule", so it would be useless
    return
  }

  // ideally we would do that only if top level await was used
  // this is not something we know at this stage
  await Promise.all(
    Object.keys(jsChunks).map(async (fileName) => {
      const file = jsChunks[fileName]

      let { code, map } = await transformJs({
        projectDirectoryUrl,
        code: file.code,
        map: file.map,
        url: rollupUrlToProjectUrl(file.url), // transformJs expect a file:// url
        babelPluginMap,
        // the top level await transformation should not need any new babel helper
        // if so let them be inlined
        babelHelpersInjectionAsImport: false,
        transformGenerator: false, // assume it was done
        transformGlobalThis: false,
        // moduleOutFormat: format, // we are compiling for rollup output must be "esmodule"
      })

      if (minify) {
        const result = await minifyJs(code, file.fileName, {
          sourceMap: {
            ...(map ? { content: JSON.stringify(map) } : {}),
            asObject: true,
          },
          ...(format === "global" ? { toplevel: false } : { toplevel: true }),
          ...minifyJsOptions,
        })
        code = result.code
        map = result.map
      }

      file.code = code
      file.map = map
    }),
  )
}

const prepareEntryPoints = async (
  entryPointMap,
  { projectDirectoryUrl, buildDirectoryUrl, compileServerOrigin, fetchFile },
) => {
  const entryFileRelativeUrls = Object.keys(entryPointMap)
  const entryPointsPrepared = []
  await entryFileRelativeUrls.reduce(async (previous, entryFileRelativeUrl) => {
    await previous

    const entryProjectUrl = resolveUrl(entryFileRelativeUrl, projectDirectoryUrl)
    const entryBuildUrl = resolveUrl(entryPointMap[entryFileRelativeUrl], buildDirectoryUrl)

    const entryProjectRelativeUrl = urlToRelativeUrl(entryProjectUrl, projectDirectoryUrl)
    const entryBuildRelativeUrl = urlToRelativeUrl(entryBuildUrl, buildDirectoryUrl)

    const entryServerUrl = resolveUrl(entryProjectRelativeUrl, compileServerOrigin)

    const entryResponse = await fetchFile(entryServerUrl, `entryPointMap`)
    const entryContentType = entryResponse.headers["content-type"]
    const isHtml = entryContentType === "text/html"

    entryPointsPrepared.push({
      entryContentType:
        entryContentType === "text/javascript" ? "application/javascript" : entryContentType,
      entryProjectRelativeUrl,
      entryBuildRelativeUrl,
      ...(isHtml ? { entryBuffer: Buffer.from(await entryResponse.arrayBuffer()) } : {}),
    })
  }, Promise.resolve())

  return entryPointsPrepared
}

const fetchImportMapFromUrl = async (importMapUrl, importMapProjectUrl, importer) => {
  const importMapResponse = await fetchUrl(importMapUrl)
  const okValidation = await validateResponseStatusIsOk(importMapResponse, {
    importer,
    originalUrl: importMapProjectUrl,
  })
  if (!okValidation.valid) {
    throw new Error(okValidation.message)
  }
  const importMap = await importMapResponse.json()
  const importMapNormalized = normalizeImportMap(importMap, importMapUrl)
  return importMapNormalized
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
