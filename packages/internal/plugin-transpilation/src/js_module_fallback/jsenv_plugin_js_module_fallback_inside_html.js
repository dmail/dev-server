/*
 * when <script type="module"> cannot be used:
 * - ?js_module_fallback is injected into the src of <script type="module">
 * - js inside <script type="module"> is transformed into classic js
 * - <link rel="modulepreload"> are converted to <link rel="preload">
 */

import { injectQueryParams } from "@jsenv/urls";
import {
  parseHtmlString,
  visitHtmlNodes,
  stringifyHtmlAst,
  getHtmlNodeAttribute,
  setHtmlNodeAttributes,
  analyzeScriptNode,
} from "@jsenv/ast";

export const jsenvPluginJsModuleFallbackInsideHtml = () => {
  const turnIntoJsClassicProxy = (reference) => {
    return injectQueryParams(reference.url, { js_module_fallback: "" });
  };

  return {
    name: "jsenv:js_module_fallback_inside_html",
    appliesDuring: "*",
    redirectReference: {
      link_href: (reference, context) => {
        if (
          context.systemJsTranspilation &&
          reference.subtype === "modulepreload"
        ) {
          return turnIntoJsClassicProxy(reference);
        }
        if (
          context.systemJsTranspilation &&
          reference.subtype === "preload" &&
          reference.expectedType === "js_module"
        ) {
          return turnIntoJsClassicProxy(reference);
        }
        return null;
      },
      script: (reference, context) => {
        if (
          context.systemJsTranspilation &&
          reference.expectedType === "js_module"
        ) {
          return turnIntoJsClassicProxy(reference);
        }
        return null;
      },
      js_url: (reference, context) => {
        if (
          context.systemJsTranspilation &&
          reference.expectedType === "js_module"
        ) {
          return turnIntoJsClassicProxy(reference);
        }
        return null;
      },
    },
    finalizeUrlContent: {
      html: async (urlInfo, context) => {
        const htmlAst = parseHtmlString(urlInfo.content);
        const mutations = [];
        visitHtmlNodes(htmlAst, {
          link: (node) => {
            const rel = getHtmlNodeAttribute(node, "rel");
            if (rel !== "modulepreload" && rel !== "preload") {
              return;
            }
            const href = getHtmlNodeAttribute(node, "href");
            if (!href) {
              return;
            }
            const reference = context.referenceUtils.find(
              (ref) =>
                ref.generatedSpecifier === href &&
                ref.type === "link_href" &&
                ref.subtype === rel,
            );
            if (!isOrWasExpectingJsModule(reference)) {
              return;
            }
            if (
              rel === "modulepreload" &&
              reference.expectedType === "js_classic"
            ) {
              mutations.push(() => {
                setHtmlNodeAttributes(node, {
                  rel: "preload",
                  as: "script",
                  crossorigin: undefined,
                });
              });
            }
            if (rel === "preload" && reference.expectedType === "js_classic") {
              mutations.push(() => {
                setHtmlNodeAttributes(node, { crossorigin: undefined });
              });
            }
          },
          script: (node) => {
            const { type } = analyzeScriptNode(node);
            if (type !== "js_module") {
              return;
            }
            const src = getHtmlNodeAttribute(node, "src");
            if (src) {
              const reference = context.referenceUtils.find(
                (ref) =>
                  ref.generatedSpecifier === src &&
                  ref.type === "script" &&
                  ref.subtype === "js_module",
              );
              if (!reference) {
                return;
              }
              if (reference.expectedType === "js_classic") {
                mutations.push(() => {
                  setHtmlNodeAttributes(node, { type: undefined });
                });
              }
            } else if (context.systemJsTranspilation) {
              mutations.push(() => {
                setHtmlNodeAttributes(node, { type: undefined });
              });
            }
          },
        });
        await Promise.all(mutations.map((mutation) => mutation()));
        return stringifyHtmlAst(htmlAst, {
          cleanupPositionAttributes: context.dev,
        });
      },
    },
  };
};

const isOrWasExpectingJsModule = (reference) => {
  if (isExpectingJsModule(reference)) {
    return true;
  }
  if (reference.original && isExpectingJsModule(reference.original)) {
    return true;
  }
  return false;
};

const isExpectingJsModule = (reference) => {
  return (
    reference.expectedType === "js_module" ||
    reference.searchParams.has("js_module_fallback") ||
    reference.searchParams.has("as_js_classic")
  );
};