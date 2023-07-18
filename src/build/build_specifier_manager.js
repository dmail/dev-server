import { ANSI } from "@jsenv/log";
import { urlIsInsideOf } from "@jsenv/urls";
import { generateSourcemapFileUrl } from "@jsenv/sourcemap";

import { createBuildUrlsGenerator } from "./build_urls_generator.js";
import { isWebWorkerEntryPointReference } from "../kitchen/web_workers.js";
import { GRAPH_VISITOR } from "../kitchen/url_graph/url_graph_visitor.js";

export const createBuildSpecifierManager = ({
  rawKitchen,
  finalKitchen,
  logger,
  buildDirectoryUrl,
  assetsDirectory,
  finalRedirections,
}) => {
  const buildUrlsGenerator = createBuildUrlsGenerator({
    buildDirectoryUrl,
    assetsDirectory,
  });

  const buildDirectoryRedirections = new Map();
  const associateBuildUrlAndRawUrl = (buildUrl, rawUrl, reason) => {
    if (urlIsInsideOf(rawUrl, buildDirectoryUrl)) {
      throw new Error(`raw url must be inside rawGraph, got ${rawUrl}`);
    }
    if (buildDirectoryRedirections.get(buildUrl) !== rawUrl) {
      logger.debug(`build url generated (${reason})
${ANSI.color(rawUrl, ANSI.GREY)} ->
${ANSI.color(buildUrl, ANSI.MAGENTA)}
`);
      buildDirectoryRedirections.set(buildUrl, rawUrl);
    }
  };

  return {
    buildUrlsGenerator,
    buildDirectoryRedirections,
    associateBuildUrlAndRawUrl,
    redirectToBuildDirectory: (reference) => {
      if (!reference.url.startsWith("file:")) {
        return null;
      }
      // referenced by resource hint
      // -> keep it untouched, it will be handled by "resync_resource_hints"
      if (reference.isResourceHint) {
        return reference.original ? reference.original.url : null;
      }
      // already a build url
      const rawUrl = buildDirectoryRedirections.get(reference.url);
      if (rawUrl) {
        return reference.url;
      }
      if (reference.isInline) {
        const ownerFinalUrlInfo = finalKitchen.graph.getUrlInfo(
          reference.ownerUrlInfo.url,
        );
        const ownerRawUrl = ownerFinalUrlInfo.originalUrl;
        const rawUrlInfo = GRAPH_VISITOR.find(
          rawKitchen.graph,
          (rawUrlInfo) => {
            const { inlineUrlSite } = rawUrlInfo;
            // not inline
            if (!inlineUrlSite) return false;
            if (
              inlineUrlSite.url === ownerRawUrl &&
              inlineUrlSite.line === reference.specifierLine &&
              inlineUrlSite.column === reference.specifierColumn
            ) {
              return true;
            }
            if (rawUrlInfo.content === reference.content) {
              return true;
            }
            if (rawUrlInfo.originalContent === reference.content) {
              return true;
            }
            return false;
          },
        );

        if (!rawUrlInfo) {
          // generated during final graph
          // (happens for JSON.parse injected for import assertions for instance)
          // throw new Error(`cannot find raw url for "${reference.url}"`)
          return reference.url;
        }
        const buildUrl = buildUrlsGenerator.generate(reference.url, {
          urlInfo: rawUrlInfo,
          ownerUrlInfo: ownerFinalUrlInfo,
        });
        associateBuildUrlAndRawUrl(buildUrl, rawUrlInfo.url, "inline content");
        return buildUrl;
      }
      // from "js_module_fallback":
      //   - injecting "?js_module_fallback" for the first time
      //   - injecting "?js_module_fallback" because the parentUrl has it
      if (reference.original) {
        const urlBeforeRedirect = reference.original.url;
        const urlAfterRedirect = reference.url;
        const isEntryPoint =
          reference.isEntryPoint || isWebWorkerEntryPointReference(reference);
        // the url info do not exists yet (it will be created after this "redirectReference" hook)
        // And the content will be generated when url is cooked by url graph loader.
        // Here we just want to reserve an url for that file
        const urlInfo = {
          data: reference.data,
          isEntryPoint,
          type: reference.expectedType,
          subtype: reference.expectedSubtype,
          filename: reference.filename,
        };
        if (urlIsInsideOf(urlBeforeRedirect, buildDirectoryUrl)) {
          // the redirection happened on a build url, happens due to:
          // 1. bundling
          const buildUrl = buildUrlsGenerator.generate(urlAfterRedirect, {
            urlInfo,
          });
          finalRedirections.set(urlBeforeRedirect, buildUrl);
          return buildUrl;
        }
        const rawUrl = urlAfterRedirect;
        const buildUrl = buildUrlsGenerator.generate(rawUrl, {
          urlInfo,
        });
        finalRedirections.set(urlBeforeRedirect, buildUrl);
        associateBuildUrlAndRawUrl(
          buildUrl,
          rawUrl,
          "redirected during postbuild",
        );
        return buildUrl;
      }
      // from "js_module_fallback":
      // - to inject "s.js"
      if (reference.injected) {
        const buildUrl = buildUrlsGenerator.generate(reference.url, {
          urlInfo: {
            data: {},
            type: "js_classic",
          },
        });
        associateBuildUrlAndRawUrl(
          buildUrl,
          reference.url,
          "injected during postbuild",
        );
        finalRedirections.set(buildUrl, buildUrl);
        return buildUrl;
      }
      const rawUrlInfo = rawKitchen.graph.getUrlInfo(reference.url);
      const ownerFinalUrlInfo = finalKitchen.graph.getUrlInfo(
        reference.ownerUrlInfo.url,
      );
      // files from root directory but not given to rollup nor postcss
      if (rawUrlInfo) {
        const referencedUrlObject = new URL(reference.url);
        referencedUrlObject.searchParams.delete("as_js_classic");
        referencedUrlObject.searchParams.delete("as_json_module");
        const buildUrl = buildUrlsGenerator.generate(referencedUrlObject.href, {
          urlInfo: rawUrlInfo,
          ownerUrlInfo: ownerFinalUrlInfo,
        });
        associateBuildUrlAndRawUrl(buildUrl, rawUrlInfo.url, "raw file");
        return buildUrl;
      }
      if (reference.type === "sourcemap_comment") {
        // inherit parent build url
        return generateSourcemapFileUrl(reference.ownerUrlInfo.url);
      }
      // files generated during the final graph:
      // - sourcemaps
      // const finalUrlInfo = finalGraph.getUrlInfo(url)
      const buildUrl = buildUrlsGenerator.generate(reference.url, {
        urlInfo: {
          data: {},
          type: "asset",
        },
      });
      return buildUrl;
    },
  };
};
