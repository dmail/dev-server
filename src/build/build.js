/*
 * Things hapenning here:
 * 1. load raw build files
 * 2. bundle files
 * 3. optimize files (minify mostly)
 * 4. urls versioning
 */

import {
  assertAndNormalizeDirectoryUrl,
  ensureEmptyDirectory,
  urlIsInsideOf,
  urlToBasename,
  urlToExtension,
  urlToRelativeUrl,
  writeFile,
} from "@jsenv/filesystem"
import { createLogger } from "@jsenv/logger"

import { createTaskLog } from "@jsenv/utils/logs/task_log.js"
import {
  injectQueryParams,
  setUrlFilename,
  asUrlUntilPathname,
} from "@jsenv/utils/urls/url_utils.js"
import { createVersionGenerator } from "@jsenv/utils/versioning/version_generator.js"
import { generateSourcemapUrl } from "@jsenv/utils/sourcemap/sourcemap_utils.js"
import {
  parseHtmlString,
  stringifyHtmlAst,
} from "@jsenv/utils/html_ast/html_ast.js"

import { jsenvPluginInline } from "../plugins/inline/jsenv_plugin_inline.js"
import { jsenvPluginAsJsClassic } from "../plugins/transpilation/as_js_classic/jsenv_plugin_as_js_classic.js"
import { createUrlGraph } from "../omega/url_graph.js"
import { getCorePlugins } from "../plugins/plugins.js"
import { createKitchen } from "../omega/kitchen.js"
import { loadUrlGraph } from "../omega/url_graph/url_graph_load.js"
import { createUrlGraphSummary } from "../omega/url_graph/url_graph_report.js"
import { sortUrlGraphByDependencies } from "../omega/url_graph/url_graph_sort.js"

import { GRAPH } from "./graph_utils.js"
import { createBuilUrlsGenerator } from "./build_urls_generator.js"
import { injectVersionMappings } from "./inject_version_mappings.js"
import { injectServiceWorkerUrls } from "./inject_service_worker_urls.js"
import { resyncRessourceHints } from "./resync_ressource_hints.js"

export const build = async ({
  signal = new AbortController().signal,
  logLevel = "info",
  rootDirectoryUrl,
  buildDirectoryUrl,
  entryPoints = {},
  // for now it's here but I think preview will become an other script
  // that will just pass different options to build project
  // and this function will be agnostic about "preview" concept
  isPreview = false,

  plugins = [],
  sourcemaps = isPreview ? "file" : false,
  nodeEsmResolution,
  fileSystemMagicResolution,
  injectedGlobals,
  runtimeCompat,
  transpilation = {},
  bundling = true,
  minification = true,

  versioning = true,
  versioningMethod = "search_param", // "filename", "search_param"
  lineBreakNormalization = process.platform === "win32",

  writeOnFileSystem = true,
  buildDirectoryClean = true,
  baseUrl = "/",
  assetManifest = true,
  assetManifestFileRelativeUrl = "asset-manifest.json",
}) => {
  const logger = createLogger({ logLevel })
  rootDirectoryUrl = assertAndNormalizeDirectoryUrl(rootDirectoryUrl)
  buildDirectoryUrl = assertAndNormalizeDirectoryUrl(buildDirectoryUrl)
  assertEntryPoints({ entryPoints })
  if (!["filename", "search_param"].includes(versioningMethod)) {
    throw new Error(
      `Unexpected "versioningMethod": must be "filename", "search_param"; got ${versioning}`,
    )
  }

  const entryPointKeys = Object.keys(entryPoints)
  if (entryPointKeys.length === 1) {
    logger.info(`
build "${entryPointKeys[0]}"`)
  } else {
    logger.info(`
build ${entryPointKeys.length} entry points`)
  }
  const rawGraph = createUrlGraph()
  const prebuildTask = createTaskLog(logger, "prebuild")
  let urlCount = 0
  const rawGraphKitchen = createKitchen({
    signal,
    logger,
    rootDirectoryUrl,
    urlGraph: rawGraph,
    plugins: [
      ...plugins,
      {
        name: "jsenv:build_log",
        appliesDuring: { build: true },
        cooked: () => {
          urlCount++
          prebuildTask.setRightText(urlCount)
        },
      },
      ...getCorePlugins({
        nodeEsmResolution,
        fileSystemMagicResolution,
        injectedGlobals,
        transpilation: {
          ...transpilation,
          jsModuleAsJsClassic: false,
        },
        minification,
        bundling,
      }),
    ],
    scenario: "build",
    sourcemaps,
    runtimeCompat,
  })
  const entryUrls = []
  try {
    await loadUrlGraph({
      urlGraph: rawGraph,
      kitchen: rawGraphKitchen,
      outDirectoryUrl: new URL(`.jsenv/build/`, rootDirectoryUrl),
      startLoading: (cookEntryFile) => {
        Object.keys(entryPoints).forEach((key) => {
          const [, entryUrlInfo] = cookEntryFile({
            trace: `"${key}" in entryPoints parameter`,
            type: "entry_point",
            specifier: key,
          })
          entryUrls.push(entryUrlInfo.url)
        })
      },
    })
  } catch (e) {
    prebuildTask.fail()
    throw e
  }
  // here we can perform many checks such as ensuring ressource hints are used
  prebuildTask.done()
  logger.debug(
    `raw graph urls:
${Object.keys(rawGraph.urlInfos).join("\n")}`,
  )

  const bundleUrlInfos = {}
  const bundlers = {}
  rawGraphKitchen.pluginController.plugins.forEach((plugin) => {
    const bundle = plugin.bundle
    if (!bundle) {
      return
    }
    if (typeof bundle !== "object") {
      throw new Error(
        `bundle must be an object, found "${bundle}" on plugin named "${plugin.name}"`,
      )
    }
    Object.keys(bundle).forEach((type) => {
      const bundleFunction = bundle[type]
      if (!bundleFunction) {
        return
      }
      const bundlerForThatType = bundlers[type]
      if (bundlerForThatType) {
        // first plugin to define a bundle hook wins
        return
      }
      bundlers[type] = {
        plugin,
        bundleFunction: bundle[type],
        urlInfos: [],
      }
    })
  })
  const addToBundlerIfAny = (rawUrlInfo) => {
    const bundler = bundlers[rawUrlInfo.type]
    if (bundler) {
      bundler.urlInfos.push(rawUrlInfo)
      return
    }
  }
  GRAPH.forEach(rawGraph, (rawUrlInfo) => {
    if (rawUrlInfo.data.isEntryPoint) {
      addToBundlerIfAny(rawUrlInfo)
      if (rawUrlInfo.type === "html") {
        rawUrlInfo.dependencies.forEach((dependencyUrl) => {
          const dependencyUrlInfo = rawGraph.getUrlInfo(dependencyUrl)
          if (dependencyUrlInfo.isInline) {
            if (dependencyUrlInfo.type === "js_module") {
              // bundle inline script type module deps
              dependencyUrlInfo.references.forEach((inlineScriptRef) => {
                if (inlineScriptRef.type === "js_import_export") {
                  addToBundlerIfAny(rawGraph.getUrlInfo(inlineScriptRef.url))
                }
              })
            }
            // inline content cannot be bundled
            return
          }
          addToBundlerIfAny(dependencyUrlInfo)
        })
        return
      }
    }
    // File referenced with new URL('./file.js', import.meta.url)
    // are entry points that can be bundled
    // For instance we will bundle service worker/workers detected like this
    if (rawUrlInfo.type === "js_module") {
      rawUrlInfo.references.forEach((reference) => {
        if (reference.type === "js_url_specifier") {
          const urlInfo = rawGraph.getUrlInfo(reference.url)
          addToBundlerIfAny(urlInfo)
        }
      })
    }
  })
  await Object.keys(bundlers).reduce(async (previous, type) => {
    await previous
    const bundler = bundlers[type]
    const urlInfosToBundle = bundler.urlInfos
    if (urlInfosToBundle.length === 0) {
      return
    }
    const bundleTask = createTaskLog(logger, `bundle "${type}"`)
    try {
      const bundlerGeneratedUrlInfos =
        await rawGraphKitchen.pluginController.callAsyncHook(
          {
            plugin: bundler.plugin,
            hookName: "bundle",
            value: bundler.bundleFunction,
          },
          urlInfosToBundle,
          {
            ...rawGraphKitchen.baseContext,
            buildDirectoryUrl,
          },
        )
      Object.keys(bundlerGeneratedUrlInfos).forEach((url) => {
        const bundleUrlInfo = bundlerGeneratedUrlInfos[url]
        const rawUrlInfo = rawGraph.getUrlInfo(url)
        bundleUrlInfos[url] = {
          type,
          subtype: rawUrlInfo ? rawUrlInfo.subtype : undefined,
          filename: rawUrlInfo ? rawUrlInfo.filename : undefined,
          ...bundleUrlInfo,
          data: {
            ...(rawUrlInfo ? rawUrlInfo.data : {}),
            ...bundleUrlInfo.data,
            fromBundle: true,
          },
        }
      })
    } catch (e) {
      bundleTask.fail()
      throw e
    }
    bundleTask.done()
  }, Promise.resolve())

  const buildUrlsGenerator = createBuilUrlsGenerator({
    buildDirectoryUrl,
  })
  const rawUrls = {}
  let buildUrls = {}
  const finalGraph = createUrlGraph()
  const optimizeHooks = rawGraphKitchen.pluginController.addHook("optimize")
  const finalGraphKitchen = createKitchen({
    logger,
    rootDirectoryUrl,
    urlGraph: finalGraph,
    plugins: [
      jsenvPluginAsJsClassic({
        systemJsInjection: true,
      }),
      jsenvPluginInline({
        fetchInlineUrls: false,
      }),
      {
        name: "jsenv:postbuild",
        appliesDuring: { build: true },
        resolve: (reference) => {
          if (reference.specifier[0] === "#") {
            reference.external = true
          }
          if (reference.specifier[0] === "/") {
            const url = new URL(reference.specifier.slice(1), buildDirectoryUrl)
              .href
            return url
          }
          const parentUrlInfo = finalGraph.getUrlInfo(reference.parentUrl)
          if (parentUrlInfo && parentUrlInfo.data.fromBundle) {
            // code generated by rollup contains specifier relative
            // to the generated file.
            // This file does not exists yet we must resolve against the raw url, not the build url
            const parentRawUrl = rawUrls[parentUrlInfo.url]
            const rawUrl = new URL(reference.specifier, parentRawUrl).href
            return rawUrl
          }
          return new URL(reference.specifier, reference.parentUrl).href
        },
        normalize: (reference) => {
          if (!reference.url.startsWith("file:")) {
            return null
          }
          // already a build url
          const rawUrl = rawUrls[reference.url]
          if (rawUrl) {
            return reference.url
          }
          const bundleUrlInfo = bundleUrlInfos[reference.url]
          // from rollup or postcss
          if (bundleUrlInfo) {
            const buildUrl = buildUrlsGenerator.generate(
              reference.url,
              bundleUrlInfo,
            )
            rawUrls[buildUrl] = reference.url
            return buildUrl
          }
          if (reference.isInline) {
            const rawUrlInfo = GRAPH.find(rawGraph, (rawUrlInfo) => {
              if (!rawUrlInfo.isInline) {
                return false
              }
              if (rawUrlInfo.content === reference.content) {
                return true
              }
              if (rawUrlInfo.originalContent === reference.content) {
                return true
              }
              return false
            })
            const parentUrlInfo = finalGraph.getUrlInfo(reference.parentUrl)
            if (!rawUrlInfo) {
              // generated during final graph
              // (happens for JSON.parse injected for import assertions for instance)
              // throw new Error(`cannot find raw url for "${reference.url}"`)
              return reference.url
            }
            const buildUrl = buildUrlsGenerator.generate(
              reference.url,
              rawUrlInfo,
              parentUrlInfo,
            )
            rawUrls[buildUrl] = rawUrlInfo.url
            return buildUrl
          }
          // from "js_module_as_js_classic":
          //   - injecting "?as_js_classic" for the first time
          //   - injecting "?as_js_classic" because the parentUrl has it
          if (reference.original) {
            // the url info do not exists yet (it will be created after this "normalize" hook)
            // And the content will be generated when url is cooked by url graph loader.
            // Here we just want to reserve an url for that file
            const buildUrl = buildUrlsGenerator.generate(reference.url, {
              data: reference.data,
              type: reference.expectedType,
              subtype: reference.expectedSubtype,
              filename: reference.filename,
            })
            rawUrls[buildUrl] = reference.url
            return buildUrl
          }
          // from "js_module_as_js_classic":
          //   - to inject "s.js"
          if (reference.injected) {
            const buildUrl = buildUrlsGenerator.generate(reference.url, {
              data: {},
              type: "js_classic",
            })
            rawUrls[buildUrl] = reference.url
            return buildUrl
          }
          const rawUrlInfo = rawGraph.getUrlInfo(reference.url)
          // files from root directory but not given to rollup nor postcss
          if (rawUrlInfo) {
            const buildUrl = buildUrlsGenerator.generate(
              reference.url,
              rawUrlInfo,
            )
            rawUrls[buildUrl] = rawUrlInfo.url
            return buildUrl
          }
          if (reference.type === "sourcemap_comment") {
            // inherit parent build url
            return generateSourcemapUrl(reference.parentUrl)
          }
          // files generated during the final graph:
          // - sourcemaps
          // const finalUrlInfo = finalGraph.getUrlInfo(url)
          const buildUrl = buildUrlsGenerator.generate(reference.url, {
            data: {},
            type: "asset",
          })
          return buildUrl
        },
        formatReferencedUrl: (reference) => {
          if (!reference.url.startsWith("file:")) {
            return null
          }
          if (!urlIsInsideOf(reference.url, buildDirectoryUrl)) {
            throw new Error(
              `urls should be inside build directory at this stage, found "${reference.url}"`,
            )
          }
          // remove eventual search params and hash
          const urlUntilPathname = asUrlUntilPathname(reference.url)
          // if a file is in the same directory we could prefer the relative notation
          // but to keep things simple let's keep the "absolutely relative" to baseUrl for now
          const specifier = `${baseUrl}${urlToRelativeUrl(
            urlUntilPathname,
            buildDirectoryUrl,
          )}`
          buildUrls[specifier] = reference.url
          return specifier
        },
        fetchUrlContent: async (finalUrlInfo, context) => {
          if (!finalUrlInfo.url.startsWith("file:")) {
            return { external: true }
          }
          const fromBundleOrRawGraph = (url) => {
            const rawUrl = rawUrls[url] || url
            const bundleUrlInfo = bundleUrlInfos[rawUrl]
            if (bundleUrlInfo) {
              return bundleUrlInfo
            }
            const rawUrlInfo = rawGraph.getUrlInfo(rawUrl)
            if (!rawUrlInfo) {
              // not supposed to happen
              // will log a warning
              return null
            }
            if (rawUrlInfo.isInline) {
              // Inline content, such as <script> inside html, is transformed during the previous phase.
              // If we read the inline content it would be considered as the original content.
              // - It could be "fixed" by taking into account sourcemap and consider sourcemap sources
              //   as the original content.
              //   - But it would not work when sourcemap are not generated
              //   - would be a bit slower
              // - So instead of reading the inline content directly, we search into raw graph
              //   to get "originalContent" and "sourcemap"
              finalUrlInfo.type = rawUrlInfo.type
              finalUrlInfo.subtype = rawUrlInfo.subtype
              return rawUrlInfo
            }
            return rawUrlInfo
          }
          // reference injected during "postbuild":
          // - happens for "as_js_classic" injecting "s.js"
          if (context.reference.injected) {
            const [ref, rawUrlInfo] = rawGraphKitchen.injectReference({
              type: context.reference.type,
              expectedType: context.reference.expectedType,
              expectedSubtype: context.reference.expectedSubtype,
              parentUrl: rawUrls[context.reference.parentUrl],
              specifier: context.reference.specifier,
              injected: true,
            })
            await rawGraphKitchen.cook({
              reference: ref,
              urlInfo: rawUrlInfo,
            })
            return rawUrlInfo
          }
          // reference updated during "postbuild":
          // - happens for "as_js_classic"
          if (context.reference.original) {
            return fromBundleOrRawGraph(context.reference.original.url)
          }
          return fromBundleOrRawGraph(finalUrlInfo.url)
        },
      },
      {
        name: "jsenv:optimize",
        appliesDuring: { build: true },
        finalize: async (urlInfo, context) => {
          if (optimizeHooks.length) {
            await rawGraphKitchen.pluginController.callAsyncHooks(
              "optimize",
              urlInfo,
              context,
              async (optimizeReturnValue) => {
                await finalGraphKitchen.urlInfoTransformer.applyFinalTransformations(
                  urlInfo,
                  optimizeReturnValue,
                )
              },
            )
          }
        },
      },
    ],
    scenario: "build",
    sourcemaps,
    runtimeCompat,
  })
  const buildTask = createTaskLog(logger, "build")
  const postBuildEntryUrls = []
  try {
    await loadUrlGraph({
      urlGraph: finalGraph,
      kitchen: finalGraphKitchen,
      outDirectoryUrl: new URL(".jsenv/postbuild/", rootDirectoryUrl),
      startLoading: (cookEntryFile) => {
        entryUrls.forEach((entryUrl) => {
          const [, postBuildEntryUrlInfo] = cookEntryFile({
            trace: `entryPoint`,
            type: "entry_point",
            specifier: entryUrl,
          })
          postBuildEntryUrls.push(postBuildEntryUrlInfo.url)
        })
      },
    })
  } catch (e) {
    buildTask.fail()
    throw e
  }
  buildTask.done()

  logger.debug(
    `graph urls pre-versioning:
${Object.keys(finalGraph.urlInfos).join("\n")}`,
  )
  if (versioning) {
    const versioningTask = createTaskLog(logger, "inject version in urls")
    try {
      const urlsSorted = sortUrlGraphByDependencies(finalGraph)
      urlsSorted.forEach((url) => {
        if (url.startsWith("data:")) {
          return
        }
        const urlInfo = finalGraph.getUrlInfo(url)
        if (urlInfo.type === "sourcemap") {
          return
        }
        // ignore:
        // - inline files:
        //   they are already taken into account in the file where they appear
        // - external files
        //   we don't know their content
        // - unused files without reference
        //   File updated such as style.css -> style.css.js or file.js->file.es5.js
        //   Are used at some point just to be discarded later because they need to be converted
        //   There is no need to version them and we could not because the file have been ignored
        //   so their content is unknown
        if (urlInfo.isInline) {
          return
        }
        if (urlInfo.external) {
          return
        }
        if (!urlInfo.data.isEntryPoint && urlInfo.dependents.size === 0) {
          return
        }
        const versionGenerator = createVersionGenerator()
        versionGenerator.augmentWithContent({
          content: urlInfo.content,
          contentType: urlInfo.contentType,
          lineBreakNormalization,
        })
        urlInfo.dependencies.forEach((dependencyUrl) => {
          const dependencyUrlInfo = finalGraph.getUrlInfo(dependencyUrl)
          if (
            // this content is part of the file, no need to take into account twice
            dependencyUrlInfo.isInline ||
            // this dependency content is not known
            dependencyUrlInfo.external
          ) {
            return
          }
          if (dependencyUrlInfo.data.version) {
            versionGenerator.augmentWithDependencyVersion(
              dependencyUrlInfo.data.version,
            )
          } else {
            // because all dependencies are know, if the dependency has no version
            // it means there is a circular dependency between this file
            // and it's dependency
            // in that case we'll use the dependency content
            versionGenerator.augmentWithContent({
              content: dependencyUrlInfo.content,
              contentType: dependencyUrlInfo.contentType,
              lineBreakNormalization,
            })
          }
        })
        urlInfo.data.version = versionGenerator.generate()
        urlInfo.data.versionedUrl = injectVersionIntoBuildUrl({
          buildUrl: urlInfo.url,
          version: urlInfo.data.version,
          versioningMethod,
        })
      })
      const buildUrlsPostVersioning = {}
      const versionMappings = {}
      const usedVersionMappings = []
      const versioningKitchen = createKitchen({
        logger,
        rootDirectoryUrl: buildDirectoryUrl,
        urlGraph: finalGraph,
        plugins: [
          jsenvPluginInline({
            fetchInlineUrls: false,
            analyzeConvertedScripts: true, // to be able to version their urls
            allowEscapeForVersioning: true,
          }),
          {
            name: "jsenv:versioning",
            appliesDuring: { build: true },
            resolve: (reference) => {
              if (reference.specifier[0] === "#") {
                reference.external = true
              }
              const buildUrl = buildUrls[reference.specifier]
              if (buildUrl) {
                return buildUrl
              }
              const url = new URL(reference.specifier, reference.parentUrl).href
              return url
            },
            formatReferencedUrl: (reference) => {
              if (reference.isInline) {
                return null
              }
              // specifier comes from "normalize" hook done a bit earlier in this file
              // we want to get back their build url to access their infos
              const referencedUrlInfo = finalGraph.getUrlInfo(reference.url)
              if (
                referencedUrlInfo.data.isEntryPoint ||
                referencedUrlInfo.subtype === "service_worker" ||
                referencedUrlInfo.type === "webmanifest"
              ) {
                return reference.specifier
              }
              // data:* urls and so on
              if (!referencedUrlInfo.url.startsWith("file:")) {
                return null
              }
              const versionedUrl = referencedUrlInfo.data.versionedUrl
              if (!versionedUrl) {
                // happens for sourcemap
                return `${baseUrl}${urlToRelativeUrl(
                  referencedUrlInfo.url,
                  buildDirectoryUrl,
                )}`
              }
              const versionedSpecifier = `${baseUrl}${urlToRelativeUrl(
                versionedUrl,
                buildDirectoryUrl,
              )}`
              versionMappings[reference.specifier] = versionedSpecifier
              buildUrlsPostVersioning[versionedSpecifier] =
                buildUrls[reference.specifier]
              const parentUrlInfo = finalGraph.getUrlInfo(reference.parentUrl)
              if (parentUrlInfo.jsQuote) {
                // the url is inline inside js quotes
                usedVersionMappings.push(reference.specifier)
                return () =>
                  `${parentUrlInfo.jsQuote}+__v__(${JSON.stringify(
                    reference.specifier,
                  )})+${parentUrlInfo.jsQuote}`
              }
              if (
                reference.type === "js_url_specifier" ||
                reference.subtype === "import_dynamic"
              ) {
                usedVersionMappings.push(reference.specifier)
                return () => `__v__(${JSON.stringify(reference.specifier)})`
              }
              return versionedSpecifier
            },
            fetchUrlContent: (versionedUrlInfo) => {
              if (!versionedUrlInfo.url.startsWith("file:")) {
                return { external: true }
              }
              if (versionedUrlInfo.isInline) {
                const rawUrlInfo = rawGraph.getUrlInfo(
                  rawUrls[versionedUrlInfo.url],
                )
                const finalUrlInfo = finalGraph.getUrlInfo(versionedUrlInfo.url)
                return {
                  originalContent: rawUrlInfo
                    ? rawUrlInfo.originalContent
                    : undefined,
                  sourcemap: finalUrlInfo ? finalUrlInfo.sourcemap : undefined,
                  contentType: versionedUrlInfo.contentType,
                  content: versionedUrlInfo.content,
                }
              }
              return versionedUrlInfo
            },
            transform: {
              html: (urlInfo) => {
                const htmlAst = parseHtmlString(urlInfo.content, {
                  storeOriginalPositions: false,
                })
                return {
                  content: stringifyHtmlAst(htmlAst, {
                    removeOriginalPositionAttributes: true,
                  }),
                }
              },
            },
          },
        ],
        scenario: "build",
        sourcemaps,
        runtimeCompat,
      })
      await loadUrlGraph({
        urlGraph: finalGraph,
        kitchen: versioningKitchen,
        startLoading: (cookEntryFile) => {
          postBuildEntryUrls.forEach((postBuildEntryUrl) => {
            cookEntryFile({
              trace: `entryPoint`,
              type: "entry_point",
              specifier: postBuildEntryUrl,
            })
          })
        },
      })
      if (usedVersionMappings.length) {
        const versionMappingsNeeded = {}
        usedVersionMappings.forEach((specifier) => {
          versionMappingsNeeded[specifier] = versionMappings[specifier]
        })
        await Promise.all(
          GRAPH.map(finalGraph, async (urlInfo) => {
            if (!urlInfo.data.isEntryPoint) {
              return
            }
            await injectVersionMappings({
              urlInfo,
              kitchen: finalGraphKitchen,
              versionMappings: versionMappingsNeeded,
            })
          }),
        )
      }
      buildUrls = buildUrlsPostVersioning
    } catch (e) {
      versioningTask.fail()
      throw e
    }
    versioningTask.done()
  } else {
    // TODO: remove html attributes such as original-src-position
  }

  GRAPH.forEach(finalGraph, (urlInfo) => {
    if (!urlInfo.url.startsWith("file:")) {
      return
    }
    if (urlInfo.external) {
      return
    }
    const version = urlInfo.data.version
    const useVersionedUrl =
      !urlInfo.data.isEntryPoint &&
      urlInfo.subtype !== "service_worker" &&
      urlInfo.type !== "webmanifest" &&
      version
    const buildUrl = useVersionedUrl ? urlInfo.data.versionedUrl : urlInfo.url
    if (!urlIsInsideOf(buildUrl, buildDirectoryUrl)) {
      throw new Error(`found url outside build directory: "${buildUrl}"`)
    }
    const buildRelativeUrl = urlToRelativeUrl(buildUrl, buildDirectoryUrl)
    urlInfo.data.buildUrl = buildUrl
    urlInfo.data.buildUrlIsVersioned = useVersionedUrl
    urlInfo.data.buildRelativeUrl = buildRelativeUrl
  })

  await resyncRessourceHints({
    finalGraphKitchen,
    finalGraph,
    rawUrls,
    buildUrls,
  })
  await injectServiceWorkerUrls({
    finalGraphKitchen,
    finalGraph,
    lineBreakNormalization,
  })
  const cleanupActions = []
  GRAPH.forEach(finalGraph, (urlInfo) => {
    // nothing uses this url anymore
    // - versioning update inline content
    // - file converted for import assertion of js_classic conversion
    if (!urlInfo.data.isEntryPoint && urlInfo.dependents.size === 0) {
      cleanupActions.push(() => {
        delete finalGraph.urlInfos[urlInfo.url]
      })
    }
  })
  cleanupActions.forEach((cleanupAction) => cleanupAction())

  logger.debug(
    `graph urls post-versioning:
${Object.keys(finalGraph.urlInfos).join("\n")}`,
  )

  const buildManifest = {}
  const buildFileContents = {}
  const buildInlineContents = {}
  GRAPH.forEach(finalGraph, (urlInfo) => {
    if (urlInfo.external) {
      return
    }
    if (urlInfo.url.startsWith("data:")) {
      return
    }
    const { buildRelativeUrl } = urlInfo.data
    if (urlInfo.isInline) {
      buildInlineContents[buildRelativeUrl] = urlInfo.content
    } else {
      buildFileContents[buildRelativeUrl] = urlInfo.content
    }
    const buildRelativeUrlWithoutVersioning = urlToRelativeUrl(
      urlInfo.url,
      buildDirectoryUrl,
    )
    buildManifest[buildRelativeUrlWithoutVersioning] = buildRelativeUrl
  })
  if (writeOnFileSystem) {
    if (buildDirectoryClean) {
      await ensureEmptyDirectory(buildDirectoryUrl)
    }
    const buildRelativeUrls = Object.keys(buildFileContents)
    await Promise.all(
      buildRelativeUrls.map(async (buildRelativeUrl) => {
        await writeFile(
          new URL(buildRelativeUrl, buildDirectoryUrl),
          buildFileContents[buildRelativeUrl],
        )
      }),
    )
    if (versioning && assetManifest && Object.keys(buildManifest).length) {
      await writeFile(
        new URL(assetManifestFileRelativeUrl, buildDirectoryUrl),
        JSON.stringify(buildManifest, null, "  "),
      )
    }
  }
  logger.info(createUrlGraphSummary(finalGraph, { title: "build files" }))
  return {
    buildFileContents,
    buildInlineContents,
    buildManifest,
  }
}

const injectVersionIntoBuildUrl = ({ buildUrl, version, versioningMethod }) => {
  if (versioningMethod === "search_param") {
    return injectQueryParams(buildUrl, {
      v: version,
    })
  }
  const basename = urlToBasename(buildUrl)
  const extension = urlToExtension(buildUrl)
  const versionedFilename = `${basename}-${version}${extension}`
  const versionedUrl = setUrlFilename(buildUrl, versionedFilename)
  return versionedUrl
}

const assertEntryPoints = ({ entryPoints }) => {
  if (typeof entryPoints !== "object" || entryPoints === null) {
    throw new TypeError(`entryPoints must be an object, got ${entryPoints}`)
  }
  const keys = Object.keys(entryPoints)
  keys.forEach((key) => {
    if (!key.startsWith("./")) {
      throw new TypeError(
        `unexpected key in entryPoints, all keys must start with ./ but found ${key}`,
      )
    }
    const value = entryPoints[key]
    if (typeof value !== "string") {
      throw new TypeError(
        `unexpected value in entryPoints, all values must be strings found ${value} for key ${key}`,
      )
    }
    if (value.includes("/")) {
      throw new TypeError(
        `unexpected value in entryPoints, all values must be plain strings (no "/") but found ${value} for key ${key}`,
      )
    }
  })
}
