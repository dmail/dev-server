import { defaultLookupPackageScope } from "@jsenv/node-esm-resolution";
import { URL_META } from "@jsenv/url-meta";
import { injectQueryParams, urlToBasename, urlToExtension } from "@jsenv/urls";

import { commonJsToJsModule } from "./cjs_to_esm.js";

const compileCacheDirectoryUrlDefault = new URL("../.cache/", import.meta.url);

export const jsenvPluginCommonJs = ({
  name = "jsenv:commonjs",
  logLevel,
  include,
  compileCacheDirectoryUrl,
  dev,
}) => {
  const markAsJsModuleProxy = (reference) => {
    reference.expectedType = "js_module";
    const onwerUrlExtension = urlToExtension(reference.ownerUrlInfo.url);
    const referenceUrlExtension = urlToExtension(reference.url);
    if (referenceUrlExtension !== onwerUrlExtension) {
      const packageFileUrl = defaultLookupPackageScope(reference.url);
      if (packageFileUrl) {
        const basename = isBareSpecifier(reference.specifier)
          ? reference.specifier
          : urlToBasename(reference.url);
        reference.filenameHint = `${basename}${onwerUrlExtension}`;
      }
    }
  };
  const turnIntoJsModuleProxy = (reference) => {
    const urlTransformed = injectQueryParams(reference.url, {
      cjs_as_js_module: "",
    });
    markAsJsModuleProxy(reference);
    return urlTransformed;
  };

  let associations;

  return {
    name,
    appliesDuring: "*",
    init: ({ rootDirectoryUrl }) => {
      associations = URL_META.resolveAssociations(
        {
          commonjs: {
            ...include,
            "/**/*.map": false,
          },
        },
        rootDirectoryUrl,
      );
    },
    redirectReference: (reference) => {
      if (reference.type === "sourcemap_comment") {
        return null;
      }
      if (reference.searchParams.has("cjs_as_js_module")) {
        markAsJsModuleProxy(reference);
        return null;
      }
      // when search param is injected, it will be removed later
      // by "getWithoutSearchParam". We don't want to redirect again
      // (would create infinite recursion)
      if (
        reference.prev &&
        reference.prev.searchParams.has(`cjs_as_js_module`)
      ) {
        return null;
      }
      const { commonjs } = URL_META.applyAssociations({
        url: reference.url,
        associations,
      });
      if (!commonjs) {
        return null;
      }
      reference.data.commonjs = commonjs;
      return turnIntoJsModuleProxy(reference);
    },
    fetchUrlContent: async (urlInfo) => {
      const commonJsUrlInfo = urlInfo.getWithoutSearchParam(
        "cjs_as_js_module",
        {
          // during this fetch we don't want to alter the original file
          // so we consider it as text
          expectedType: "text",
        },
      );
      if (!commonJsUrlInfo) {
        return null;
      }
      await commonJsUrlInfo.cook();
      const nodeRuntimeEnabled = Object.keys(
        urlInfo.context.runtimeCompat,
      ).includes("node");
      if (compileCacheDirectoryUrl === undefined) {
        if (urlInfo.context.outDirectoryUrl) {
          compileCacheDirectoryUrl = new URL(
            "./cjs_to_esm/",
            urlInfo.context.outDirectoryUrl,
          ).href;
        } else {
          compileCacheDirectoryUrl = compileCacheDirectoryUrlDefault;
        }
      }
      const { content, sourcemap, isValid } = await commonJsToJsModule({
        logLevel,
        compileCacheDirectoryUrl,
        sourceFileUrl: commonJsUrlInfo.url,
        browsers: !nodeRuntimeEnabled,
        processEnvNodeEnv:
          dev || urlInfo.context.dev ? "development" : "production",
        ...urlInfo.data.commonjs,
      });
      if (isValid) {
        urlInfo.isValid = isValid;
      }
      return {
        content,
        contentType: "text/javascript",
        type: "js_module",
        originalUrl: commonJsUrlInfo.originalUrl,
        originalContent: commonJsUrlInfo.originalContent,
        sourcemap,
        data: commonJsUrlInfo.data,
      };
    },
  };
};

const isBareSpecifier = (specifier) => {
  if (
    specifier[0] === "/" ||
    specifier.startsWith("./") ||
    specifier.startsWith("../")
  ) {
    return false;
  }
  try {
    // eslint-disable-next-line no-new
    new URL(specifier);
    return false;
  } catch (e) {
    return true;
  }
};
