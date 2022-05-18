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

import { jsenvPluginUrlReferences } from "../plugins/url_references/jsenv_plugin_url_references.js"
import { jsenvPluginInline } from "../plugins/inline/jsenv_plugin_inline.js"
import { jsenvPluginAsJsClassic } from "../plugins/transpilation/as_js_classic/jsenv_plugin_as_js_classic.js"
import { createUrlGraph } from "../omega/url_graph.js"
import { getCorePlugins } from "../plugins/plugins.js"
import { createKitchen } from "../omega/kitchen.js"
import { loadUrlGraph } from "../omega/url_graph/url_graph_load.js"
import { createUrlGraphSummary } from "../omega/url_graph/url_graph_report.js"
import { sortUrlGraphByDependencies } from "../omega/url_graph/url_graph_sort.js"
import { isWebWorkerEntryPointReference } from "../omega/web_workers.js"

import { GRAPH } from "./graph_utils.js"
import { createBuilUrlsGenerator } from "./build_urls_generator.js"
import { injectGlobalVersionMapping } from "./inject_global_version_mappings.js"
import { injectServiceWorkerUrls } from "./inject_service_worker_urls.js"
import { resyncRessourceHints } from "./resync_ressource_hints.js"

/**
 * Generate an optimized version of source files into a directory
 * @param {Object} buildParameters
 * @param {string|url} buildParameters.rootDirectoryUrl
 *        Directory containing source files
 * @param {string|url} buildParameters.buildDirectoryUrl
 *        Directory where optimized files will be written
 * @param {object} buildParameters.entryPoints
 *        Describe entry point paths and control their names in the build directory
 * @param {object} buildParameters.runtimeCompat
 *        Code generated will be compatible with these runtimes
 * @param {string="/"} buildParameters.baseUrl
 *        All urls in build file contents are prefixed with this url
 * @param {boolean|object} [buildParameters.minification=true]
 *        Minify build file contents
 * @param {boolean} [buildParameters.versioning=true]
 *        Controls if url in build file contents are versioned
 * @param {('search_param'|'filename')} [buildParameters.versioningMethod="search_param"]
 *        Controls how url are versioned
 * @param {boolean|string} [buildParameters.sourcemaps=false]
 *        Generate sourcemaps in the build directory
 * @return {Object} buildReturnValue
 * @return {Object} buildReturnValue.buildFileContents
 *        Contains all build file paths relative to the build directory and their content
 * @return {Object} buildReturnValue.buildInlineContents
 *        Contains content that is inline into build files
 * @return {Object} buildReturnValue.buildManifest
 *        Map build file paths without versioning to versioned file paths
 */
export const build = async ({
  signal = new AbortController().signal,
  logLevel = "info",
  rootDirectoryUrl,
  buildDirectoryUrl,
  entryPoints = {},

  plugins = [],
  sourcemaps = false,
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
    scenario: "build",
    sourcemaps,
    runtimeCompat,
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
          entryUrlInfo.filename = entryPoints[key]
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

  const buildUrlsGenerator = createBuilUrlsGenerator({
    buildDirectoryUrl,
  })
  const rawUrls = {}
  const buildUrls = {}
  const rawUrlRedirections = {}
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
                  const inlineUrlInfo = rawGraph.getUrlInfo(inlineScriptRef.url)
                  addToBundlerIfAny(inlineUrlInfo)
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
  const bundleUrlRedirections = {}
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
        const rawUrlInfo = rawGraph.getUrlInfo(url)
        const bundlerGeneratedUrlInfo = bundlerGeneratedUrlInfos[url]
        const bundleUrlInfo = {
          type,
          subtype: rawUrlInfo ? rawUrlInfo.subtype : undefined,
          filename: rawUrlInfo ? rawUrlInfo.filename : undefined,
          ...bundlerGeneratedUrlInfo,
          data: {
            ...(rawUrlInfo ? rawUrlInfo.data : {}),
            ...bundlerGeneratedUrlInfo.data,
            fromBundle: true,
          },
        }
        const buildUrl = buildUrlsGenerator.generate(url, {
          urlInfo: bundleUrlInfo,
        })
        rawUrlRedirections[url] = buildUrl
        rawUrls[buildUrl] = url
        bundleUrlInfos[buildUrl] = bundleUrlInfo
        if (bundlerGeneratedUrlInfo.data.bundleRelativeUrl) {
          const urlForBundler = new URL(
            bundlerGeneratedUrlInfo.data.bundleRelativeUrl,
            buildDirectoryUrl,
          ).href
          bundleUrlRedirections[urlForBundler] = buildUrl
        }
      })
    } catch (e) {
      bundleTask.fail()
      throw e
    }
    bundleTask.done()
  }, Promise.resolve())

  const buildUrlRedirections = {}
  const finalGraph = createUrlGraph()
  const optimizeUrlContentHooks =
    rawGraphKitchen.pluginController.addHook("optimizeUrlContent")
  const finalGraphKitchen = createKitchen({
    logger,
    rootDirectoryUrl,
    urlGraph: finalGraph,
    scenario: "build",
    sourcemaps,
    runtimeCompat,
    plugins: [
      jsenvPluginUrlReferences(),
      jsenvPluginAsJsClassic({
        systemJsInjection: true,
      }),
      jsenvPluginInline({
        fetchInlineUrls: false,
      }),
      {
        name: "jsenv:postbuild",
        appliesDuring: { build: true },
        resolveUrl: (reference) => {
          if (reference.specifier[0] === "#") {
            reference.external = true
          }
          let url =
            reference.specifier[0] === "/"
              ? new URL(reference.specifier.slice(1), buildDirectoryUrl).href
              : new URL(reference.specifier, reference.parentUrl).href
          const urlRedirectedByBundle = bundleUrlRedirections[url]
          if (urlRedirectedByBundle) {
            return urlRedirectedByBundle
          }
          const parentIsFromBundle = Boolean(
            bundleUrlInfos[reference.parentUrl],
          )
          // urls inside css bundled by parcel
          // contains url relative to the bundle file (which is considered inside build directory)
          // if the file is not itself a bundle file it must be resolved against
          // the original css url
          if (
            parentIsFromBundle &&
            !bundleUrlInfos[url] &&
            urlIsInsideOf(url, buildDirectoryUrl)
          ) {
            const parentRawUrl = rawUrls[reference.parentUrl]
            url = new URL(reference.specifier, parentRawUrl).href
          }
          const urlRedirected = rawUrlRedirections[url]
          return urlRedirected || url
        },
        normalizeUrl: (reference) => {
          if (!reference.url.startsWith("file:")) {
            return null
          }
          // already a build url
          const rawUrl = rawUrls[reference.url]
          if (rawUrl) {
            return reference.url
          }
          // from rollup or postcss
          const bundleUrlInfo = bundleUrlInfos[reference.url]
          if (bundleUrlInfo) {
            return reference.url
          }
          // from "js_module_as_js_classic":
          //   - injecting "?as_js_classic" for the first time
          //   - injecting "?as_js_classic" because the parentUrl has it
          if (reference.original) {
            const referenceOriginalUrl = reference.original.url
            let originalBuildUrl
            if (urlIsInsideOf(referenceOriginalUrl, buildDirectoryUrl)) {
              originalBuildUrl = referenceOriginalUrl
            } else {
              originalBuildUrl = Object.keys(rawUrls).find(
                (key) => rawUrls[key] === referenceOriginalUrl,
              )
            }
            let rawUrl
            if (urlIsInsideOf(reference.url, buildDirectoryUrl)) {
              // rawUrl = rawUrls[reference.url] || reference.url
              const originalBuildUrl =
                buildUrlRedirections[referenceOriginalUrl]
              rawUrl = originalBuildUrl
                ? rawUrls[originalBuildUrl]
                : reference.url
            } else {
              rawUrl = reference.url
            }
            // the url info do not exists yet (it will be created after this "normalize" hook)
            // And the content will be generated when url is cooked by url graph loader.
            // Here we just want to reserve an url for that file
            const buildUrl = buildUrlsGenerator.generate(rawUrl, {
              urlInfo: {
                data: {
                  ...reference.data,
                  isWebWorkerEntryPoint:
                    isWebWorkerEntryPointReference(reference),
                },
                type: reference.expectedType,
                subtype: reference.expectedSubtype,
                filename: reference.filename,
              },
            })
            buildUrlRedirections[originalBuildUrl] = buildUrl
            rawUrls[buildUrl] = rawUrl
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
            const buildUrl = buildUrlsGenerator.generate(reference.url, {
              urlInfo: rawUrlInfo,
              parentUrlInfo,
            })
            rawUrls[buildUrl] = rawUrlInfo.url
            return buildUrl
          }
          // from "js_module_as_js_classic":
          //   - to inject "s.js"
          if (reference.injected) {
            const buildUrl = buildUrlsGenerator.generate(reference.url, {
              urlInfo: {
                data: {},
                type: "js_classic",
              },
            })
            rawUrls[buildUrl] = reference.url
            return buildUrl
          }
          const rawUrlInfo = rawGraph.getUrlInfo(reference.url)
          // files from root directory but not given to rollup nor postcss
          if (rawUrlInfo) {
            const buildUrl = buildUrlsGenerator.generate(reference.url, {
              urlInfo: rawUrlInfo,
            })
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
            urlInfo: {
              data: {},
              type: "asset",
            },
          })
          return buildUrl
        },
        formatUrl: (reference) => {
          if (!reference.generatedUrl.startsWith("file:")) {
            return null
          }
          if (!urlIsInsideOf(reference.generatedUrl, buildDirectoryUrl)) {
            throw new Error(
              `urls should be inside build directory at this stage, found "${reference.url}"`,
            )
          }
          // remove eventual search params and hash
          const urlUntilPathname = asUrlUntilPathname(reference.generatedUrl)
          // if a file is in the same directory we could prefer the relative notation
          // but to keep things simple let's keep the "absolutely relative" to baseUrl for now
          const specifier = `${baseUrl}${urlToRelativeUrl(
            urlUntilPathname,
            buildDirectoryUrl,
          )}`
          buildUrls[specifier] = reference.generatedUrl
          return specifier
        },
        fetchUrlContent: async (finalUrlInfo, context) => {
          if (!finalUrlInfo.url.startsWith("file:")) {
            return { external: true }
          }
          const fromBundleOrRawGraph = (url) => {
            const bundleUrlInfo = bundleUrlInfos[url]
            if (bundleUrlInfo) {
              return bundleUrlInfo
            }
            const rawUrl = rawUrls[url] || url
            const rawUrlInfo = rawGraph.getUrlInfo(rawUrl)
            if (!rawUrlInfo) {
              const originalBuildUrl = buildUrlRedirections[url]
              if (originalBuildUrl) {
                return fromBundleOrRawGraph(originalBuildUrl)
              }
              throw new Error(`Cannot find url`)
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
        finalizeUrlContent: async (urlInfo, context) => {
          if (optimizeUrlContentHooks.length) {
            await rawGraphKitchen.pluginController.callAsyncHooks(
              "optimizeUrlContent",
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
    await applyUrlVersioning({
      logger,
      buildDirectoryUrl,
      rawUrls,
      buildUrls,
      baseUrl,
      postBuildEntryUrls,
      sourcemaps,
      runtimeCompat,
      rawGraph,
      finalGraph,
      finalGraphKitchen,
      lineBreakNormalization,
      versioningMethod,
    })
  }
  GRAPH.forEach(finalGraph, (urlInfo) => {
    if (!urlInfo.url.startsWith("file:")) {
      return
    }
    if (urlInfo.external) {
      return
    }
    if (urlInfo.type === "html") {
      const htmlAst = parseHtmlString(urlInfo.content, {
        storeOriginalPositions: false,
      })
      urlInfo.content = stringifyHtmlAst(htmlAst, {
        removeOriginalPositionAttributes: true,
      })
    }
    const version = urlInfo.data.version
    const useVersionedUrl = version && canUseVersionedUrl(urlInfo, finalGraph)
    const buildUrl = useVersionedUrl ? urlInfo.data.versionedUrl : urlInfo.url
    const buildUrlSpecifier = Object.keys(buildUrls).find(
      (key) => buildUrls[key] === buildUrl,
    )
    urlInfo.data.buildUrl = buildUrl
    urlInfo.data.buildUrlIsVersioned = useVersionedUrl
    urlInfo.data.buildUrlSpecifier = buildUrlSpecifier
  })
  await resyncRessourceHints({
    finalGraphKitchen,
    finalGraph,
    rawUrls,
    buildUrls,
  })
  const cleanupActions = []
  GRAPH.forEach(finalGraph, (urlInfo) => {
    // nothing uses this url anymore
    // - versioning update inline content
    // - file converted for import assertion of js_classic conversion
    if (
      !urlInfo.data.isEntryPoint &&
      urlInfo.type !== "sourcemap" &&
      urlInfo.dependents.size === 0
    ) {
      cleanupActions.push(() => {
        delete finalGraph.urlInfos[urlInfo.url]
      })
    }
  })
  cleanupActions.forEach((cleanupAction) => cleanupAction())
  await injectServiceWorkerUrls({
    finalGraphKitchen,
    finalGraph,
    lineBreakNormalization,
  })
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
    const buildRelativeUrl = urlToRelativeUrl(
      urlInfo.data.buildUrl,
      buildDirectoryUrl,
    )
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

const applyUrlVersioning = async ({
  logger,
  buildDirectoryUrl,
  rawUrls,
  buildUrls,
  baseUrl,
  postBuildEntryUrls,
  sourcemaps,
  runtimeCompat,
  rawGraph,
  finalGraph,
  finalGraphKitchen,
  lineBreakNormalization,
  versioningMethod,
}) => {
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

      const urlContent =
        urlInfo.type === "html"
          ? stringifyHtmlAst(
              parseHtmlString(urlInfo.content, {
                storeOriginalPositions: false,
              }),
              { removeOriginalPositionAttributes: true },
            )
          : urlInfo.content
      const versionGenerator = createVersionGenerator()
      versionGenerator.augmentWithContent({
        content: urlContent,
        contentType: urlInfo.contentType,
        lineBreakNormalization,
      })
      urlInfo.dependencies.forEach((dependencyUrl) => {
        // this dependency is inline (data:) or remote (http://, https://)
        if (!dependencyUrl.startsWith("file:")) {
          return
        }
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
    const versionMappings = {}
    const usedVersionMappings = []
    const versioningKitchen = createKitchen({
      logger,
      rootDirectoryUrl: buildDirectoryUrl,
      urlGraph: finalGraph,
      scenario: "build",
      sourcemaps,
      runtimeCompat,
      plugins: [
        jsenvPluginUrlReferences(),
        jsenvPluginInline({
          fetchInlineUrls: false,
          analyzeConvertedScripts: true, // to be able to version their urls
          allowEscapeForVersioning: true,
        }),
        {
          name: "jsenv:versioning",
          appliesDuring: { build: true },
          resolveUrl: (reference) => {
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
          formatUrl: (reference) => {
            if (reference.isInline) {
              return null
            }
            // specifier comes from "normalize" hook done a bit earlier in this file
            // we want to get back their build url to access their infos
            const referencedUrlInfo = finalGraph.getUrlInfo(reference.url)
            if (!canUseVersionedUrl(referencedUrlInfo)) {
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
            buildUrls[versionedSpecifier] = versionedUrl

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
        },
      ],
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
      await injectGlobalVersionMapping({
        finalGraphKitchen,
        finalGraph,
        versionMappings: versionMappingsNeeded,
      })
    }
  } catch (e) {
    versioningTask.fail()
    throw e
  }
  versioningTask.done()
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

const canUseVersionedUrl = (urlInfo) => {
  if (urlInfo.data.isEntryPoint) {
    return false
  }
  if (urlInfo.type === "webmanifest") {
    return false
  }
  if (urlInfo.subtype === "service_worker") {
    return !urlInfo.data.isWebWorkerEntryPoint
  }
  return true
}
