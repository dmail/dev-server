import { jsenvPluginReferenceExpectedTypes } from "./jsenv_plugin_reference_expected_types.js";
import { jsenvPluginDirectoryReferenceAnalysis } from "./directory/jsenv_plugin_directory_reference_analysis.js";
import { jsenvPluginDataUrlsAnalysis } from "./data_urls/jsenv_plugin_data_urls_analysis.js";
import { jsenvPluginHtmlReferenceAnalysis } from "./html/jsenv_plugin_html_reference_analysis.js";
import { jsenvPluginWebmanifestReferenceAnalysis } from "./webmanifest/jsenv_plugin_webmanifest_reference_analysis.js";
import { jsenvPluginCssReferenceAnalysis } from "./css/jsenv_plugin_css_reference_analysis.js";
import { jsenvPluginJsReferenceAnalysis } from "./js/jsenv_plugin_js_reference_analysis.js";

export const jsenvPluginReferenceAnalysis = ({
  inlineContent = true,
  inlineConvertedScript = false,
  fetchInlineUrls = true,
}) => {
  return [
    jsenvPluginDirectoryReferenceAnalysis(),
    jsenvPluginHtmlReferenceAnalysis({
      inlineContent,
      inlineConvertedScript,
    }),
    jsenvPluginWebmanifestReferenceAnalysis(),
    jsenvPluginCssReferenceAnalysis(),
    jsenvPluginJsReferenceAnalysis({
      inlineContent,
    }),
    ...(inlineContent ? [jsenvPluginDataUrlsAnalysis()] : []),
    ...(inlineContent && fetchInlineUrls
      ? [jsenvPluginInlineContentFetcher()]
      : []),
    jsenvPluginReferenceExpectedTypes(),
  ];
};

const jsenvPluginInlineContentFetcher = () => {
  return {
    name: "jsenv:inline_content_fetcher",
    appliesDuring: "*",
    fetchUrlContent: async (urlInfo) => {
      if (!urlInfo.isInline) {
        return null;
      }
      // we must use last reference because
      // when updating the file, first reference is the previous version
      const { lastReference } = urlInfo;
      const { prev } = lastReference;
      if (prev && !prev.isInline) {
        // got inlined, cook original url
        if (lastReference.content === undefined) {
          const originalUrlInfo = prev.urlInfo;
          await originalUrlInfo.cook();
          lastReference.content = originalUrlInfo.content;
          lastReference.contentType = originalUrlInfo.contentType;
        }
      }
      return {
        originalContent: urlInfo.originalContent,
        content: lastReference.content,
        contentType: lastReference.contentType,
      };
    },
  };
};
