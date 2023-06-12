// https://bundlers.tooling.report/hashing/avoid-cascade/

import {
  parseHtmlString,
  injectHtmlNodeAsEarlyAsPossible,
  createHtmlNode,
  stringifyHtmlAst,
} from "@jsenv/ast";

import { isWebWorkerUrlInfo } from "@jsenv/core/src/kitchen/web_workers.js";
import { prependContent } from "../kitchen/prepend_content.js";

export const injectVersionMappingsAsGlobal = async ({
  kitchen,
  urlInfo,
  versionMappings,
}) => {
  if (urlInfo.type === "html") {
    return prependContent(kitchen.urlInfoTransformer, urlInfo, {
      type: "js_classic",
      content: generateClientCodeForVersionMappings(versionMappings, {
        globalName: "window",
        minification: kitchen.kitchenContext.minification,
      }),
    });
  }
  if (urlInfo.type === "js_classic" || urlInfo.type === "js_module") {
    return prependContent(kitchen.urlInfoTransformer, urlInfo, {
      type: "js_classic",
      content: generateClientCodeForVersionMappings(versionMappings, {
        globalName: isWebWorkerUrlInfo(urlInfo) ? "self" : "window",
        minification: kitchen.kitchenContext.minification,
      }),
    });
  }
  return null;
};

const generateClientCodeForVersionMappings = (
  versionMappings,
  { globalName, minification },
) => {
  if (minification) {
    return `;(function(){var m = ${JSON.stringify(
      versionMappings,
    )}; ${globalName}.__v__ = function (s) { return m[s] || s }; })();`;
  }
  return `;(function() {
  var __versionMappings__ = ${JSON.stringify(versionMappings, null, "  ")};
  ${globalName}.__v__ = function (specifier) {
    return __versionMappings__[specifier] || specifier
  };
})();`;
};

export const injectVersionMappingsAsImportmap = async ({
  kitchen,
  urlInfo,
  versionMappings,
}) => {
  const htmlAst = parseHtmlString(urlInfo.content, {
    storeOriginalPositions: false,
  });
  // jsenv_plugin_importmap.js is removing importmap during build
  // it means at this point we know HTML has no importmap in it
  // we can safely inject one
  injectHtmlNodeAsEarlyAsPossible(
    htmlAst,
    createHtmlNode({
      tagName: "script",
      type: "importmap",
      textContent: kitchen.kitchenContext.minification
        ? JSON.stringify({ imports: versionMappings })
        : JSON.stringify({ imports: versionMappings }, null, "  "),
    }),
    "jsenv:versioning",
  );
  kitchen.urlInfoTransformer.applyTransformations(urlInfo, {
    content: stringifyHtmlAst(htmlAst),
  });
};
