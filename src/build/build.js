/*
 * Build is split in 3 steps:
 * 1. craft
 * 2. shape
 * 3. refine
 *
 * craft: prepare all the materials
 *  - resolve, fetch and transform all source files into "rawKitchen.graph"
 * shape: this step can drastically change url content and their relationships
 *  - bundling
 *  - optimizations (minification)
 * refine: perform minor changes on the url contents
 *  - cleaning html
 *  - url versioning
 *  - ressource hints
 *  - injecting urls into service workers
 */

import {
  assertAndNormalizeDirectoryUrl,
  ensureEmptyDirectory,
  writeFileSync,
} from "@jsenv/filesystem";
import { Abort, raceProcessTeardownEvents } from "@jsenv/abort";
import { createLogger, createTaskLog } from "@jsenv/log";
import {
  parseHtmlString,
  stringifyHtmlAst,
  visitHtmlNodes,
  getHtmlNodeAttribute,
  setHtmlNodeAttributes,
  removeHtmlNode,
  createHtmlNode,
  insertHtmlNodeAfter,
  findHtmlNode,
} from "@jsenv/ast";
import { RUNTIME_COMPAT } from "@jsenv/runtime-compat";
import { jsenvPluginJsModuleFallback } from "@jsenv/plugin-transpilation";

import { lookupPackageDirectory } from "../helpers/lookup_package_directory.js";
import { watchSourceFiles } from "../helpers/watch_source_files.js";
import { GRAPH_VISITOR } from "../kitchen/url_graph/url_graph_visitor.js";
import { createKitchen } from "../kitchen/kitchen.js";
import { createUrlGraphSummary } from "../kitchen/url_graph/url_graph_report.js";
import { prependContent } from "../kitchen/prepend_content.js";
import { getCorePlugins } from "../plugins/plugins.js";
import { jsenvPluginReferenceAnalysis } from "../plugins/reference_analysis/jsenv_plugin_reference_analysis.js";
import { jsenvPluginInlining } from "../plugins/inlining/jsenv_plugin_inlining.js";
import { jsenvPluginLineBreakNormalization } from "./jsenv_plugin_line_break_normalization.js";

import { createBuildSpecifierManager } from "./build_specifier_manager.js";

// default runtimeCompat corresponds to
// "we can keep <script type="module"> intact":
// so script_type_module + dynamic_import + import_meta
export const defaultRuntimeCompat = {
  // android: "8",
  chrome: "64",
  edge: "79",
  firefox: "67",
  ios: "12",
  opera: "51",
  safari: "11.3",
  samsung: "9.2",
};

/**
 * Generate an optimized version of source files into a directory
 * @param {Object} buildParameters
 * @param {string|url} buildParameters.sourceDirectoryUrl
 *        Directory containing source files
 * @param {string|url} buildParameters.buildDirectoryUrl
 *        Directory where optimized files will be written
 * @param {object} buildParameters.entryPoints
 *        Object where keys are paths to source files and values are their future name in the build directory.
 *        Keys are relative to sourceDirectoryUrl
 * @param {object} buildParameters.runtimeCompat
 *        Code generated will be compatible with these runtimes
 * @param {string} [buildParameters.assetsDirectory=""]
 *        Directory where asset files will be written
 * @param {string|url} [buildParameters.base=""]
 *        Urls in build file contents will be prefixed with this string
 * @param {boolean} [buildParameters.versioning=true]
 *        Controls if url in build file contents are versioned
 * @param {('search_param'|'filename')} [buildParameters.versioningMethod="search_param"]
 *        Controls how url are versioned
 * @param {('none'|'inline'|'file'|'programmatic'} [buildParameters.sourcemaps="none"]
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
  handleSIGINT = true,
  logLevel = "info",
  sourceDirectoryUrl,
  buildDirectoryUrl,
  entryPoints = {},
  assetsDirectory = "",
  ignore,

  runtimeCompat = defaultRuntimeCompat,
  base = runtimeCompat.node ? "./" : "/",
  plugins = [],
  referenceAnalysis = {},
  nodeEsmResolution,
  magicExtensions,
  magicDirectoryIndex,
  directoryReferenceAllowed,
  scenarioPlaceholders,
  transpilation = {},
  versioning = !runtimeCompat.node,
  versioningMethod = "search_param", // "filename", "search_param"
  versioningViaImportmap = true,
  versionLength = 8,
  lineBreakNormalization = process.platform === "win32",

  sourceFilesConfig = {},
  cooldownBetweenFileEvents,
  watch = false,

  directoryToClean,
  sourcemaps = "none",
  sourcemapsSourcesContent,
  writeOnFileSystem = true,
  outDirectoryUrl,
  assetManifest = versioningMethod === "filename",
  assetManifestFileRelativeUrl = "asset-manifest.json",
  ...rest
}) => {
  // param validation
  {
    const unexpectedParamNames = Object.keys(rest);
    if (unexpectedParamNames.length > 0) {
      throw new TypeError(
        `${unexpectedParamNames.join(",")}: there is no such param`,
      );
    }
    sourceDirectoryUrl = assertAndNormalizeDirectoryUrl(
      sourceDirectoryUrl,
      "sourceDirectoryUrl",
    );
    buildDirectoryUrl = assertAndNormalizeDirectoryUrl(
      buildDirectoryUrl,
      "buildDirectoryUrl",
    );
    if (outDirectoryUrl === undefined) {
      if (!process.env.CI) {
        const packageDirectoryUrl = lookupPackageDirectory(sourceDirectoryUrl);
        if (packageDirectoryUrl) {
          outDirectoryUrl = `${packageDirectoryUrl}.jsenv/`;
        }
      }
    } else if (outDirectoryUrl !== null && outDirectoryUrl !== false) {
      outDirectoryUrl = assertAndNormalizeDirectoryUrl(
        outDirectoryUrl,
        "outDirectoryUrl",
      );
    }

    if (typeof entryPoints !== "object" || entryPoints === null) {
      throw new TypeError(`entryPoints must be an object, got ${entryPoints}`);
    }
    const keys = Object.keys(entryPoints);
    keys.forEach((key) => {
      if (!key.startsWith("./")) {
        throw new TypeError(
          `entryPoints keys must start with "./", found ${key}`,
        );
      }
      const value = entryPoints[key];
      if (typeof value !== "string") {
        throw new TypeError(
          `entryPoints values must be strings, found "${value}" on key "${key}"`,
        );
      }
      if (value.includes("/")) {
        throw new TypeError(
          `entryPoints values must be plain strings (no "/"), found "${value}" on key "${key}"`,
        );
      }
    });
    if (!["filename", "search_param"].includes(versioningMethod)) {
      throw new TypeError(
        `versioningMethod must be "filename" or "search_param", got ${versioning}`,
      );
    }
  }

  const operation = Abort.startOperation();
  operation.addAbortSignal(signal);
  if (handleSIGINT) {
    operation.addAbortSource((abort) => {
      return raceProcessTeardownEvents(
        {
          SIGINT: true,
        },
        abort,
      );
    });
  }

  if (assetsDirectory && assetsDirectory[assetsDirectory.length - 1] !== "/") {
    assetsDirectory = `${assetsDirectory}/`;
  }
  if (directoryToClean === undefined) {
    if (assetsDirectory === undefined) {
      directoryToClean = buildDirectoryUrl;
    } else {
      directoryToClean = new URL(assetsDirectory, buildDirectoryUrl).href;
    }
  }

  const runBuild = async ({ signal, logLevel }) => {
    const logger = createLogger({ logLevel });
    const createBuildTask = (label) => {
      return createTaskLog(label, {
        disabled: !logger.levels.debug && !logger.levels.info,
        animated: !logger.levels.debug,
      });
    };

    const buildOperation = Abort.startOperation();
    buildOperation.addAbortSignal(signal);
    const entryPointKeys = Object.keys(entryPoints);
    if (entryPointKeys.length === 1) {
      logger.info(`
build "${entryPointKeys[0]}"`);
    } else {
      logger.info(`
build ${entryPointKeys.length} entry points`);
    }
    const explicitJsModuleFallback = entryPointKeys.some((key) =>
      key.includes("?js_module_fallback"),
    );
    const rawRedirections = new Map();
    const entryUrls = [];
    const contextSharedDuringBuild = {
      buildDirectoryUrl,
      assetsDirectory,
      systemJsTranspilation: (() => {
        const nodeRuntimeEnabled = Object.keys(runtimeCompat).includes("node");
        if (nodeRuntimeEnabled) return false;
        if (!RUNTIME_COMPAT.isSupported(runtimeCompat, "script_type_module"))
          return true;
        if (!RUNTIME_COMPAT.isSupported(runtimeCompat, "import_dynamic"))
          return true;
        if (!RUNTIME_COMPAT.isSupported(runtimeCompat, "import_meta"))
          return true;
        if (
          versioning &&
          versioningViaImportmap &&
          !RUNTIME_COMPAT.isSupported(runtimeCompat, "importmap")
        )
          return true;
        return false;
      })(),
    };
    const rawKitchen = createKitchen({
      signal,
      logLevel,
      rootDirectoryUrl: sourceDirectoryUrl,
      ignore,
      // during first pass (craft) we keep "ignore:" when a reference is ignored
      // so that the second pass (shape) properly ignore those urls
      ignoreProtocol: "keep",
      build: true,
      runtimeCompat,
      initialContext: contextSharedDuringBuild,
      plugins: [
        ...plugins,
        {
          appliesDuring: "build",
          fetchUrlContent: (urlInfo) => {
            if (urlInfo.firstReference.original) {
              rawRedirections.set(
                urlInfo.firstReference.original.url,
                urlInfo.firstReference.url,
              );
            }
          },
        },
        ...getCorePlugins({
          rootDirectoryUrl: sourceDirectoryUrl,
          runtimeCompat,
          referenceAnalysis,
          nodeEsmResolution,
          magicExtensions,
          magicDirectoryIndex,
          directoryReferenceAllowed,
          transpilation: {
            babelHelpersAsImport: !explicitJsModuleFallback,
            ...transpilation,
            jsModuleFallbackOnJsClassic: false,
          },

          inlining: false,
          scenarioPlaceholders,
        }),
      ],
      sourcemaps,
      sourcemapsSourcesContent,
      outDirectoryUrl: outDirectoryUrl
        ? new URL("craft/", outDirectoryUrl)
        : undefined,
    });
    craft: {
      const generateSourceGraph = createBuildTask("generate source graph");
      try {
        if (outDirectoryUrl) {
          await ensureEmptyDirectory(new URL(`craft/`, outDirectoryUrl));
        }
        const rawRootUrlInfo = rawKitchen.graph.rootUrlInfo;
        await rawRootUrlInfo.dependencies.startCollecting(() => {
          Object.keys(entryPoints).forEach((key) => {
            const entryReference = rawRootUrlInfo.dependencies.found({
              trace: { message: `"${key}" in entryPoints parameter` },
              isEntryPoint: true,
              type: "entry_point",
              specifier: key,
              filename: entryPoints[key],
            });
            entryUrls.push(entryReference.url);
          });
        });
        await rawRootUrlInfo.cookDependencies({
          operation: buildOperation,
        });
      } catch (e) {
        generateSourceGraph.fail();
        throw e;
      }
      generateSourceGraph.done();
    }

    const finalKitchen = createKitchen({
      name: "shape",
      logLevel,
      rootDirectoryUrl: buildDirectoryUrl,
      // here most plugins are not there
      // - no external plugin
      // - no plugin putting reference.mustIgnore on https urls
      // At this stage it's only about redirecting urls to the build directory
      // consequently only a subset or urls are supported
      supportedProtocols: ["file:", "data:", "virtual:", "ignore:"],
      ignore,
      ignoreProtocol: "remove",
      build: true,
      shape: true,
      runtimeCompat,
      initialContext: contextSharedDuringBuild,
      initialPluginsMeta: rawKitchen.pluginController.pluginsMeta,
      plugins: [
        jsenvPluginReferenceAnalysis({
          ...referenceAnalysis,
          fetchInlineUrls: false,
        }),
        ...(lineBreakNormalization
          ? [jsenvPluginLineBreakNormalization()]
          : []),
        jsenvPluginJsModuleFallback(),
        jsenvPluginInlining(),
        {
          name: "jsenv:optimize",
          appliesDuring: "build",
          transformUrlContent: async (urlInfo) => {
            await rawKitchen.pluginController.callAsyncHooks(
              "optimizeUrlContent",
              urlInfo,
              (optimizeReturnValue) => {
                urlInfo.mutateContent(optimizeReturnValue);
              },
            );
          },
        },
      ],
      sourcemaps,
      sourcemapsSourcesContent,
      sourcemapsSourcesRelative: true,
      outDirectoryUrl: outDirectoryUrl
        ? new URL("shape/", outDirectoryUrl)
        : undefined,
    });

    const buildSpecifierManager = createBuildSpecifierManager({
      rawKitchen,
      finalKitchen,
      logger,
      sourceDirectoryUrl,
      buildDirectoryUrl,
      base,
      assetsDirectory,

      versioning,
      versioningMethod,
      versionLength,
      canUseImportmap:
        versioningViaImportmap &&
        entryUrls.every((finalEntryUrl) => {
          const entryUrlInfo = rawKitchen.graph.getUrlInfo(finalEntryUrl);
          return entryUrlInfo.type === "html";
        }) &&
        rawKitchen.context.isSupportedOnCurrentClients("importmap"),
    });
    finalKitchen.pluginController.pushPlugin(
      buildSpecifierManager.jsenvPluginMoveToBuildDirectory,
    );

    const bundlers = {};
    bundle: {
      rawKitchen.pluginController.plugins.forEach((plugin) => {
        const bundle = plugin.bundle;
        if (!bundle) {
          return;
        }
        if (typeof bundle !== "object") {
          throw new Error(
            `bundle must be an object, found "${bundle}" on plugin named "${plugin.name}"`,
          );
        }
        Object.keys(bundle).forEach((type) => {
          const bundleFunction = bundle[type];
          if (!bundleFunction) {
            return;
          }
          const bundlerForThatType = bundlers[type];
          if (bundlerForThatType) {
            // first plugin to define a bundle hook wins
            return;
          }
          bundlers[type] = {
            plugin,
            bundleFunction: bundle[type],
            urlInfoMap: new Map(),
          };
        });
      });
      const addToBundlerIfAny = (rawUrlInfo) => {
        const bundler = bundlers[rawUrlInfo.type];
        if (bundler) {
          bundler.urlInfoMap.set(rawUrlInfo.url, rawUrlInfo);
        }
      };
      // ignore unused urls thanks to "forEachUrlInfoStronglyReferenced"
      // it avoid bundling things that are not actually used
      // happens for:
      // - js import assertions
      // - conversion to js classic using ?as_js_classic or ?js_module_fallback
      GRAPH_VISITOR.forEachUrlInfoStronglyReferenced(
        rawKitchen.graph.rootUrlInfo,
        (rawUrlInfo) => {
          if (rawUrlInfo.isEntryPoint) {
            addToBundlerIfAny(rawUrlInfo);
          }
          if (rawUrlInfo.type === "html") {
            rawUrlInfo.referenceToOthersSet.forEach((referenceToOther) => {
              if (referenceToOther.isWeak) {
                return;
              }
              const referencedUrlInfo = referenceToOther.urlInfo;
              if (referencedUrlInfo.isInline) {
                if (referencedUrlInfo.type === "js_module") {
                  // bundle inline script type module deps
                  referencedUrlInfo.referenceToOthersSet.forEach(
                    (jsModuleReferenceToOther) => {
                      if (jsModuleReferenceToOther.type === "js_import") {
                        const inlineUrlInfo = jsModuleReferenceToOther.urlInfo;
                        addToBundlerIfAny(inlineUrlInfo);
                      }
                    },
                  );
                }
                // inline content cannot be bundled
                return;
              }
              addToBundlerIfAny(referencedUrlInfo);
            });
            rawUrlInfo.referenceToOthersSet.forEach((referenceToOther) => {
              if (
                referenceToOther.isResourceHint &&
                referenceToOther.expectedType === "js_module"
              ) {
                const referencedUrlInfo = referenceToOther.urlInfo;
                if (
                  referencedUrlInfo &&
                  // something else than the resource hint is using this url
                  referencedUrlInfo.referenceFromOthersSet.size > 0
                ) {
                  addToBundlerIfAny(referencedUrlInfo);
                }
              }
            });
            return;
          }
          // File referenced with new URL('./file.js', import.meta.url)
          // are entry points that should be bundled
          // For instance we will bundle service worker/workers detected like this
          if (rawUrlInfo.type === "js_module") {
            rawUrlInfo.referenceToOthersSet.forEach((referenceToOther) => {
              if (referenceToOther.type === "js_url") {
                const referencedUrlInfo = referenceToOther.urlInfo;
                for (const referenceFromOther of referencedUrlInfo.referenceFromOthersSet) {
                  if (referenceFromOther.url === referencedUrlInfo.url) {
                    if (
                      referenceFromOther.subtype === "import_dynamic" ||
                      referenceFromOther.type === "script"
                    ) {
                      // will already be bundled
                      return;
                    }
                  }
                }
                addToBundlerIfAny(referencedUrlInfo);
                return;
              }
              if (referenceToOther.type === "js_inline_content") {
                // we should bundle it too right?
              }
            });
          }
        },
      );
      await Object.keys(bundlers).reduce(async (previous, type) => {
        await previous;
        const bundler = bundlers[type];
        const urlInfosToBundle = Array.from(bundler.urlInfoMap.values());
        if (urlInfosToBundle.length === 0) {
          return;
        }
        const bundleTask = createBuildTask(`bundle "${type}"`);
        try {
          const urlInfosBundled =
            await rawKitchen.pluginController.callAsyncHook(
              {
                plugin: bundler.plugin,
                hookName: "bundle",
                value: bundler.bundleFunction,
              },
              urlInfosToBundle,
            );
          Object.keys(urlInfosBundled).forEach((url) => {
            const urlInfoBundled = urlInfosBundled[url];
            if (urlInfoBundled.sourceUrls) {
              urlInfoBundled.sourceUrls.forEach((sourceUrl) => {
                const sourceRawUrlInfo = rawKitchen.graph.getUrlInfo(sourceUrl);
                if (sourceRawUrlInfo) {
                  sourceRawUrlInfo.data.bundled = true;
                }
              });
            }
            buildSpecifierManager.generateBuildUrlForBundle({
              url,
              urlInfoBundled,
            });
          });
        } catch (e) {
          bundleTask.fail();
          throw e;
        }
        bundleTask.done();
      }, Promise.resolve());
    }

    shape: {
      const generateBuildGraph = createBuildTask("generate build graph");
      try {
        if (outDirectoryUrl) {
          await ensureEmptyDirectory(new URL(`shape/`, outDirectoryUrl));
        }
        const finalRootUrlInfo = finalKitchen.graph.rootUrlInfo;
        await finalRootUrlInfo.dependencies.startCollecting(() => {
          entryUrls.forEach((entryUrl) => {
            finalRootUrlInfo.dependencies.found({
              trace: { message: `entryPoint` },
              isEntryPoint: true,
              type: "entry_point",
              specifier: entryUrl,
            });
          });
        });
        await finalRootUrlInfo.cookDependencies({
          operation: buildOperation,
        });
      } catch (e) {
        generateBuildGraph.fail();
        throw e;
      }
      generateBuildGraph.done();
    }

    refine: {
      replace_placeholders: {
        await buildSpecifierManager.replacePlaceholders();
      }
      cleanup_jsenv_attributes_from_html: {
        GRAPH_VISITOR.forEach(finalKitchen.graph, (urlInfo) => {
          if (!urlInfo.url.startsWith("file:")) {
            return;
          }
          if (urlInfo.type === "html") {
            const htmlAst = parseHtmlString(urlInfo.content, {
              storeOriginalPositions: false,
            });
            urlInfo.content = stringifyHtmlAst(htmlAst, {
              cleanupJsenvAttributes: true,
              cleanupPositionAttributes: true,
            });
          }
        });
      }
      /*
       * Update <link rel="preload"> and friends after build (once we know everything)
       * - Used to remove resource hint targeting an url that is no longer used:
       *   - because of bundlings
       *   - because of import assertions transpilation (file is inlined into JS)
       */
      // TODO: retest what is needed, removing injecting yes, updating not sure
      resync_resource_hints: {
        const actions = [];
        GRAPH_VISITOR.forEach(finalKitchen.graph, (urlInfo) => {
          if (urlInfo.type !== "html") {
            return;
          }
          const htmlAst = parseHtmlString(urlInfo.content, {
            storeOriginalPositions: false,
          });
          const mutations = [];
          const hintsToInject = {};
          visitHtmlNodes(htmlAst, {
            link: (node) => {
              const href = getHtmlNodeAttribute(node, "href");
              if (href === undefined || href.startsWith("data:")) {
                return;
              }
              const rel = getHtmlNodeAttribute(node, "rel");
              const isResourceHint = [
                "preconnect",
                "dns-prefetch",
                "prefetch",
                "preload",
                "modulepreload",
              ].includes(rel);
              if (!isResourceHint) {
                return;
              }
              let url;
              if (href.startsWith("file:")) {
                url = href;
                url = rawRedirections.get(url) || url;
                url = buildSpecifierManager.getFinalBuildUrl(url) || url;
                url = buildSpecifierManager.getRawUrl(url) || url;
              } else {
                url = null;
              }

              const buildUrlInfo = url
                ? finalKitchen.graph.getUrlInfo(url)
                : null;
              if (!buildUrlInfo) {
                logger.warn(
                  `remove resource hint because cannot find "${href}" in the graph`,
                );
                mutations.push(() => {
                  removeHtmlNode(node);
                });
                return;
              }
              if (!buildUrlInfo.isUsed()) {
                let rawUrl = buildSpecifierManager.getRawUrl(url);
                if (!rawUrl && rawKitchen.graph.getUrlInfo(url)) {
                  rawUrl = url;
                }
                if (rawUrl) {
                  const rawUrlInfo = rawKitchen.graph.getUrlInfo(rawUrl);
                  if (rawUrlInfo && rawUrlInfo.data.bundled) {
                    logger.warn(
                      `remove resource hint on "${rawUrl}" because it was bundled`,
                    );
                    mutations.push(() => {
                      removeHtmlNode(node);
                    });
                    return;
                  }
                }
                logger.warn(
                  `remove resource hint on "${href}" because it is not used anymore`,
                );
                mutations.push(() => {
                  removeHtmlNode(node);
                });
                return;
              }
              const buildUrlFormatted = buildUrlInfo.url;
              const buildSpecifier =
                buildSpecifierManager.getBuildUrlFromBuildSpecifier(
                  buildUrlFormatted,
                );
              mutations.push(() => {
                setHtmlNodeAttributes(node, {
                  href: buildSpecifier,
                  ...(buildUrlInfo.type === "js_classic"
                    ? { crossorigin: undefined }
                    : {}),
                });
              });
              for (const referenceToOther of buildUrlInfo.referenceToOthersSet) {
                if (referenceToOther.isWeak) {
                  continue;
                }
                const referencedUrlInfo = referenceToOther.urlInfo;
                if (referencedUrlInfo.data.generatedToShareCode) {
                  hintsToInject[referencedUrlInfo.url] = node;
                }
              }
            },
          });
          Object.keys(hintsToInject).forEach((urlToHint) => {
            const hintNode = hintsToInject[urlToHint];
            const urlFormatted = urlToHint;
            const buildSpecifier =
              buildSpecifierManager.getBuildUrlFromBuildSpecifier(urlFormatted);
            const found = findHtmlNode(htmlAst, (htmlNode) => {
              return (
                htmlNode.nodeName === "link" &&
                getHtmlNodeAttribute(htmlNode, "href") === buildSpecifier
              );
            });
            if (!found) {
              mutations.push(() => {
                const nodeToInsert = createHtmlNode({
                  tagName: "link",
                  href: buildSpecifier,
                  rel: getHtmlNodeAttribute(hintNode, "rel"),
                  as: getHtmlNodeAttribute(hintNode, "as"),
                  type: getHtmlNodeAttribute(hintNode, "type"),
                  crossorigin: getHtmlNodeAttribute(hintNode, "crossorigin"),
                });
                insertHtmlNodeAfter(nodeToInsert, hintNode);
              });
            }
          });
          if (mutations.length > 0) {
            actions.push(() => {
              mutations.forEach((mutation) => mutation());
              urlInfo.mutateContent({
                content: stringifyHtmlAst(htmlAst),
              });
            });
          }
        });
        if (actions.length > 0) {
          const resyncTask = createBuildTask("resync resource hints");
          actions.map((resourceHintAction) => resourceHintAction());
          buildOperation.throwIfAborted();
          resyncTask.done();
        }
      }
      // TODO: move this to specifier_manager
      inject_urls_in_service_workers: {
        const serviceWorkerEntryUrlInfos = GRAPH_VISITOR.filter(
          finalKitchen.graph,
          (finalUrlInfo) => {
            return (
              finalUrlInfo.subtype === "service_worker" &&
              finalUrlInfo.isEntryPoint &&
              finalUrlInfo.isUsed()
            );
          },
        );
        if (serviceWorkerEntryUrlInfos.length > 0) {
          const urlsInjectionInSw = createBuildTask(
            "inject urls in service worker",
          );
          const serviceWorkerResources = {};
          GRAPH_VISITOR.forEachUrlInfoStronglyReferenced(
            finalKitchen.graph.rootUrlInfo,
            (urlInfo) => {
              if (!urlInfo.url.startsWith("file:")) {
                return;
              }
              if (urlInfo.isInline) {
                return;
              }
              const {
                buildSpecifier,
                buildSpecifierVersioned,
                version,
                canUseVersionedSpecifier,
              } = buildSpecifierManager.getBuildMeta(urlInfo);

              if (canUseVersionedSpecifier) {
                serviceWorkerResources[buildSpecifier] = {
                  version,
                  versionedUrl: buildSpecifierVersioned,
                };
              } else {
                // when url is not versioned we compute a "version" for that url anyway
                // so that service worker source still changes and navigator
                // detect there is a change
                serviceWorkerResources[buildSpecifier] = {
                  version,
                };
              }
            },
          );
          for (const serviceWorkerEntryUrlInfo of serviceWorkerEntryUrlInfos) {
            const serviceWorkerResourcesWithoutSwScriptItSelf = {
              ...serviceWorkerResources,
            };
            const serviceWorkerBuildSpecifier =
              buildSpecifierManager.getBuildUrlFromBuildSpecifier(
                serviceWorkerEntryUrlInfo.url,
              );
            delete serviceWorkerResourcesWithoutSwScriptItSelf[
              serviceWorkerBuildSpecifier
            ];
            await prependContent(serviceWorkerEntryUrlInfo, {
              type: "js_classic",
              content: `\nself.resourcesFromJsenvBuild = ${JSON.stringify(
                serviceWorkerResourcesWithoutSwScriptItSelf,
                null,
                "  ",
              )};\n`,
            });
          }
          urlsInjectionInSw.done();
        }
        buildOperation.throwIfAborted();
      }
    }
    const { buildFileContents, buildInlineContents, buildManifest } =
      buildSpecifierManager.getBuildInfo();
    if (writeOnFileSystem) {
      const writingFiles = createBuildTask("write files in build directory");
      if (directoryToClean) {
        await ensureEmptyDirectory(directoryToClean);
      }
      const buildRelativeUrls = Object.keys(buildFileContents);
      buildRelativeUrls.forEach((buildRelativeUrl) => {
        writeFileSync(
          new URL(buildRelativeUrl, buildDirectoryUrl),
          buildFileContents[buildRelativeUrl],
        );
      });
      if (versioning && assetManifest && Object.keys(buildManifest).length) {
        writeFileSync(
          new URL(assetManifestFileRelativeUrl, buildDirectoryUrl),
          JSON.stringify(buildManifest, null, "  "),
        );
      }
      writingFiles.done();
    }
    logger.info(
      createUrlGraphSummary(finalKitchen.graph, {
        title: "build files",
      }),
    );
    return {
      buildFileContents,
      buildInlineContents,
      buildManifest,
    };
  };

  if (!watch) {
    return runBuild({ signal: operation.signal, logLevel });
  }

  let resolveFirstBuild;
  let rejectFirstBuild;
  const firstBuildPromise = new Promise((resolve, reject) => {
    resolveFirstBuild = resolve;
    rejectFirstBuild = reject;
  });
  let buildAbortController;
  let watchFilesTask;
  const startBuild = async () => {
    const buildTask = createTaskLog("build");
    buildAbortController = new AbortController();
    try {
      const result = await runBuild({
        signal: buildAbortController.signal,
        logLevel: "warn",
      });
      buildTask.done();
      resolveFirstBuild(result);
      watchFilesTask = createTaskLog("watch files");
    } catch (e) {
      if (Abort.isAbortError(e)) {
        buildTask.fail(`build aborted`);
      } else if (e.code === "PARSE_ERROR") {
        buildTask.fail();
        console.error(e.stack);
        watchFilesTask = createTaskLog("watch files");
      } else {
        buildTask.fail();
        rejectFirstBuild(e);
        throw e;
      }
    }
  };

  startBuild();
  let startTimeout;
  const stopWatchingSourceFiles = watchSourceFiles(
    sourceDirectoryUrl,
    ({ url, event }) => {
      if (watchFilesTask) {
        watchFilesTask.happen(
          `${url.slice(sourceDirectoryUrl.length)} ${event}`,
        );
        watchFilesTask = null;
      }
      buildAbortController.abort();
      // setTimeout is to ensure the abortController.abort() above
      // is properly taken into account so that logs about abort comes first
      // then logs about re-running the build happens
      clearTimeout(startTimeout);
      startTimeout = setTimeout(startBuild, 20);
    },
    {
      sourceFilesConfig,
      keepProcessAlive: true,
      cooldownBetweenFileEvents,
    },
  );
  operation.addAbortCallback(() => {
    stopWatchingSourceFiles();
  });
  await firstBuildPromise;
  return stopWatchingSourceFiles;
};
