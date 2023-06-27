import { readFileSync } from "node:fs";
import { serveDirectory, composeTwoResponses } from "@jsenv/server";
import { bufferToEtag } from "@jsenv/filesystem";
import { asUrlWithoutSearch } from "@jsenv/urls";
import { URL_META } from "@jsenv/url-meta";
import { RUNTIME_COMPAT } from "@jsenv/runtime-compat";

import { WEB_URL_CONVERTER } from "../helpers/web_url_converter.js";
import { watchSourceFiles } from "../helpers/watch_source_files.js";
import { createKitchen } from "../kitchen/kitchen.js";
import { getCorePlugins } from "../plugins/plugins.js";
import { jsenvPluginServerEventsClientInjection } from "../plugins/server_events/jsenv_plugin_server_events_client_injection.js";
import { parseUserAgentHeader } from "./user_agent.js";

export const createFileService = ({
  signal,
  logLevel,
  serverStopCallbacks,
  serverEventsDispatcher,
  kitchenCache,

  sourceDirectoryUrl,
  sourceMainFilePath,
  ignore,
  sourceFilesConfig,
  runtimeCompat,

  plugins,
  referenceAnalysis,
  nodeEsmResolution,
  magicExtensions,
  magicDirectoryIndex,
  supervisor,
  transpilation,
  clientAutoreload,
  cooldownBetweenFileEvents,
  cacheControl,
  ribbon,
  sourcemaps,
  sourcemapsSourcesProtocol,
  sourcemapsSourcesContent,
  outDirectoryUrl,
}) => {
  const clientFileChangeCallbackList = [];
  const clientFilesPruneCallbackList = [];
  const stopWatchingSourceFiles = watchSourceFiles(
    sourceDirectoryUrl,
    (fileInfo) => {
      clientFileChangeCallbackList.forEach((callback) => {
        callback(fileInfo);
      });
    },
    {
      sourceFilesConfig,
      keepProcessAlive: false,
      cooldownBetweenFileEvents,
    },
  );
  serverStopCallbacks.push(stopWatchingSourceFiles);

  const getOrCreateKitchen = (request) => {
    const { runtimeName, runtimeVersion } = parseUserAgentHeader(
      request.headers["user-agent"] || "",
    );
    const runtimeId = `${runtimeName}@${runtimeVersion}`;
    const existing = kitchenCache.get(runtimeId);
    if (existing) {
      return existing;
    }
    const watchAssociations = URL_META.resolveAssociations(
      { watch: stopWatchingSourceFiles.watchPatterns },
      sourceDirectoryUrl,
    );
    let kitchen;
    clientFileChangeCallbackList.push(({ url }) => {
      const exactUrlInfo = kitchen.graph.getUrlInfo(url);
      if (exactUrlInfo) {
        exactUrlInfo.considerModified();
      }
      kitchen.graph.urlInfoMap.forEach((urlInfo) => {
        if (urlInfo === exactUrlInfo) return;
        const urlWithoutSearch = asUrlWithoutSearch(urlInfo.url);
        if (urlWithoutSearch !== url) return;
        if (exactUrlInfo) {
          for (const referenceFromOther of exactUrlInfo.referenceFromOthersSet) {
            if (referenceFromOther.url === urlInfo.url) {
              return;
            }
          }
        }
        urlInfo.considerModified();
      });
    });
    const clientRuntimeCompat = { [runtimeName]: runtimeVersion };

    kitchen = createKitchen({
      name: runtimeId,
      signal,
      logLevel,
      rootDirectoryUrl: sourceDirectoryUrl,
      mainFilePath: sourceMainFilePath,
      ignore,
      dev: true,
      runtimeCompat,
      clientRuntimeCompat,
      systemJsTranspilation:
        !RUNTIME_COMPAT.isSupported(
          clientRuntimeCompat,
          "script_type_module",
        ) ||
        !RUNTIME_COMPAT.isSupported(clientRuntimeCompat, "import_dynamic") ||
        !RUNTIME_COMPAT.isSupported(clientRuntimeCompat, "import_meta"),
      plugins: [
        ...plugins,
        ...getCorePlugins({
          rootDirectoryUrl: sourceDirectoryUrl,
          runtimeCompat,

          referenceAnalysis,
          nodeEsmResolution,
          magicExtensions,
          magicDirectoryIndex,
          supervisor,
          transpilation,

          clientAutoreload,
          clientFileChangeCallbackList,
          clientFilesPruneCallbackList,
          cacheControl,
          ribbon,
        }),
      ],
      supervisor,
      minification: false,
      sourcemaps,
      sourcemapsSourcesProtocol,
      sourcemapsSourcesContent,
      outDirectoryUrl: outDirectoryUrl
        ? new URL(`${runtimeName}@${runtimeVersion}/`, outDirectoryUrl)
        : undefined,
    });
    kitchen.graph.createUrlInfoCallbackRef.current = (urlInfo) => {
      const { watch } = URL_META.applyAssociations({
        url: urlInfo.url,
        associations: watchAssociations,
      });
      urlInfo.isWatched = watch;
      // wehn an url depends on many others, we check all these (like package.json)
      urlInfo.isValid = () => {
        if (!urlInfo.url.startsWith("file:")) {
          return false;
        }
        if (urlInfo.content === undefined) {
          // urlInfo content is undefined when:
          // - url info content never fetched
          // - it is considered as modified because undelying file is watched and got saved
          // - it is considered as modified because underlying file content
          //   was compared using etag and it has changed
          return false;
        }
        if (!watch) {
          // file is not watched, check the filesystem
          let fileContentAsBuffer;
          try {
            fileContentAsBuffer = readFileSync(new URL(urlInfo.url));
          } catch (e) {
            if (e.code === "ENOENT") {
              urlInfo.considerModified();
              urlInfo.deleteFromGraph();
              return false;
            }
            return false;
          }
          const fileContentEtag = bufferToEtag(fileContentAsBuffer);
          if (fileContentEtag !== urlInfo.originalContentEtag) {
            urlInfo.considerModified();
            // restore content to be able to compare it again later
            urlInfo.kitchen.context.urlInfoTransformer.setContent(
              urlInfo,
              String(fileContentAsBuffer),
              {
                contentEtag: fileContentEtag,
              },
            );
            return false;
          }
        }
        for (const implicitUrl of urlInfo.implicitUrlSet) {
          const implicitUrlInfo = kitchen.graph.getUrlInfo(implicitUrl);
          if (implicitUrlInfo && !implicitUrlInfo.isValid()) {
            return false;
          }
        }
        return true;
      };
    };
    kitchen.graph.prunedUrlInfosCallbackRef.current = (
      urlInfos,
      firstUrlInfo,
    ) => {
      clientFilesPruneCallbackList.forEach((callback) => {
        callback(urlInfos, firstUrlInfo);
      });
    };
    serverStopCallbacks.push(() => {
      kitchen.pluginController.callHooks("destroy", kitchen.context);
    });
    server_events: {
      const allServerEvents = {};
      kitchen.pluginController.plugins.forEach((plugin) => {
        const { serverEvents } = plugin;
        if (serverEvents) {
          Object.keys(serverEvents).forEach((serverEventName) => {
            // we could throw on serverEvent name conflict
            // we could throw if serverEvents[serverEventName] is not a function
            allServerEvents[serverEventName] = serverEvents[serverEventName];
          });
        }
      });
      const serverEventNames = Object.keys(allServerEvents);
      if (serverEventNames.length > 0) {
        Object.keys(allServerEvents).forEach((serverEventName) => {
          allServerEvents[serverEventName]({
            rootDirectoryUrl: sourceDirectoryUrl,
            graph: kitchen.graph,
            dev: true,
            sendServerEvent: (data) => {
              serverEventsDispatcher.dispatch({
                type: serverEventName,
                data,
              });
            },
          });
        });
        // "pushPlugin" so that event source client connection can be put as early as possible in html
        kitchen.pluginController.pushPlugin(
          jsenvPluginServerEventsClientInjection(),
        );
      }
    }

    kitchenCache.set(runtimeId, kitchen);
    return kitchen;
  };

  return async (request) => {
    const kitchen = getOrCreateKitchen(request);
    const responseFromPlugin =
      await kitchen.pluginController.callAsyncHooksUntil(
        "serve",
        request,
        kitchen.context,
      );
    if (responseFromPlugin) {
      return responseFromPlugin;
    }
    let reference;
    const parentUrl = inferParentFromRequest(
      request,
      sourceDirectoryUrl,
      sourceMainFilePath,
    );
    if (parentUrl) {
      reference = kitchen.graph.inferReference(request.resource, parentUrl);
    }
    if (!reference) {
      reference = kitchen.graph.rootUrlInfo.dependencies.prepare({
        trace: { message: parentUrl || sourceDirectoryUrl },
        parentUrl: parentUrl || sourceDirectoryUrl,
        type: "http_request",
        specifier: request.resource,
      });
    }
    const urlInfo = reference.urlInfo;
    const ifNoneMatch = request.headers["if-none-match"];
    const urlInfoTargetedByCache = urlInfo.findParentIfInline() || urlInfo;

    try {
      if (ifNoneMatch) {
        const [clientOriginalContentEtag, clientContentEtag] =
          ifNoneMatch.split("_");
        if (
          urlInfoTargetedByCache.originalContentEtag ===
            clientOriginalContentEtag &&
          urlInfoTargetedByCache.contentEtag === clientContentEtag &&
          urlInfoTargetedByCache.isValid()
        ) {
          const headers = {
            "cache-control": `private,max-age=0,must-revalidate`,
          };
          Object.keys(urlInfo.headers).forEach((key) => {
            if (key !== "content-length") {
              headers[key] = urlInfo.headers[key];
            }
          });
          return {
            status: 304,
            headers,
          };
        }
      }

      // urlInfo objects are reused, they must be "reset" before cooking them again
      if (
        (urlInfo.error || urlInfo.content !== undefined) &&
        !urlInfo.isInline &&
        urlInfo.type !== "sourcemap"
      ) {
        urlInfo.error = null;
        urlInfo.type = null;
        urlInfo.subtype = null;
        urlInfo.timing = {};
        urlInfo.kitchen.context.urlInfoTransformer.resetContent(urlInfo);
      }
      await urlInfo.cook({ request });
      let { response } = urlInfo;
      if (response) {
        return response;
      }
      response = {
        url: reference.url,
        status: 200,
        headers: {
          // when we send eTag to the client the next request to the server
          // will send etag in request headers.
          // If they match jsenv bypass cooking and returns 304
          // This must not happen when a plugin uses "no-store" or "no-cache" as it means
          // plugin logic wants to happens for every request to this url
          ...(urlInfo.headers["cache-control"] === "no-store" ||
          urlInfo.headers["cache-control"] === "no-cache"
            ? {}
            : {
                "cache-control": `private,max-age=0,must-revalidate`,
                // it's safe to use "_" separator because etag is encoded with base64 (see https://stackoverflow.com/a/13195197)
                "eTag": `${urlInfoTargetedByCache.originalContentEtag}_${urlInfoTargetedByCache.contentEtag}`,
              }),
          ...urlInfo.headers,
          "content-type": urlInfo.contentType,
          "content-length": Buffer.byteLength(urlInfo.content),
        },
        body: urlInfo.content,
        timing: urlInfo.timing,
      };
      kitchen.pluginController.callHooks(
        "augmentResponse",
        { reference, urlInfo },
        kitchen.context,
        (returnValue) => {
          response = composeTwoResponses(response, returnValue);
        },
      );
      return response;
    } catch (e) {
      urlInfo.error = e;
      const originalError = e ? e.cause || e : e;
      if (originalError.asResponse) {
        return originalError.asResponse();
      }
      const code = originalError.code;
      if (code === "PARSE_ERROR") {
        // when possible let browser re-throw the syntax error
        // it's not possible to do that when url info content is not available
        // (happens for js_module_fallback for instance)
        if (urlInfo.content !== undefined) {
          return {
            url: reference.url,
            status: 200,
            // reason becomes the http response statusText, it must not contain invalid chars
            // https://github.com/nodejs/node/blob/0c27ca4bc9782d658afeaebcec85ec7b28f1cc35/lib/_http_common.js#L221
            statusText: e.reason,
            statusMessage: originalError.message,
            headers: {
              "content-type": urlInfo.contentType,
              "content-length": Buffer.byteLength(urlInfo.content),
              "cache-control": "no-store",
            },
            body: urlInfo.content,
          };
        }
        return {
          url: reference.url,
          status: 500,
          statusText: e.reason,
          statusMessage: originalError.message,
          headers: {
            "cache-control": "no-store",
          },
          body: urlInfo.content,
        };
      }
      if (code === "DIRECTORY_REFERENCE_NOT_ALLOWED") {
        return serveDirectory(reference.url, {
          headers: {
            accept: "text/html",
          },
          canReadDirectory: true,
          rootDirectoryUrl: sourceDirectoryUrl,
        });
      }
      if (code === "NOT_ALLOWED") {
        return {
          url: reference.url,
          status: 403,
          statusText: originalError.reason,
        };
      }
      if (code === "NOT_FOUND") {
        return {
          url: reference.url,
          status: 404,
          statusText: originalError.reason,
          statusMessage: originalError.message,
        };
      }
      return {
        url: reference.url,
        status: 500,
        statusText: e.reason,
        statusMessage: e.stack,
      };
    } finally {
      if (reference.type === "http_request") {
        // otherwise http_request ref keeps accumulating
        reference.remove();
      }
    }
  };
};

const inferParentFromRequest = (
  request,
  sourceDirectoryUrl,
  sourceMainFilePath,
) => {
  const { referer } = request.headers;
  if (!referer) {
    return null;
  }
  const refererUrlObject = new URL(referer);
  const refererUrl =
    refererUrlObject.pathname === `/`
      ? new URL(sourceMainFilePath, request.origin).href
      : referer;
  return WEB_URL_CONVERTER.asFileUrl(refererUrl, {
    origin: request.origin,
    rootDirectoryUrl: sourceDirectoryUrl,
  });
};
