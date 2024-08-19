import { ensureWindowsDriveLetter } from "@jsenv/filesystem";
import { generateSourcemapFileUrl } from "@jsenv/sourcemap";
import { moveUrl, setUrlFilename, urlIsInsideOf } from "@jsenv/urls";

export const determineFileUrlForOutDirectory = (urlInfo) => {
  let { url, filenameHint } = urlInfo;
  const { rootDirectoryUrl, outDirectoryUrl } = urlInfo.context;
  if (!outDirectoryUrl) {
    return url;
  }
  if (!url.startsWith("file:")) {
    return url;
  }
  if (!urlIsInsideOf(url, rootDirectoryUrl)) {
    const fsRootUrl = ensureWindowsDriveLetter("file:///", url);
    url = `${rootDirectoryUrl}@fs/${url.slice(fsRootUrl.length)}`;
  }
  if (filenameHint) {
    url = setUrlFilename(url, filenameHint);
  }
  return moveUrl({
    url,
    from: rootDirectoryUrl,
    to: outDirectoryUrl,
  });
};

export const determineSourcemapFileUrl = (urlInfo) => {
  // sourcemap is a special kind of reference:
  // It's a reference to a content generated dynamically the content itself.
  // when jsenv is done cooking the file
  //   during build it's urlInfo.url to be inside the build
  //   but otherwise it's generatedUrl to be inside .jsenv/ directory
  const generatedUrlObject = new URL(urlInfo.generatedUrl);
  generatedUrlObject.searchParams.delete("js_module_fallback");
  generatedUrlObject.searchParams.delete("as_js_module");
  generatedUrlObject.searchParams.delete("as_js_classic");
  generatedUrlObject.searchParams.delete("as_css_module");
  generatedUrlObject.searchParams.delete("as_json_module");
  generatedUrlObject.searchParams.delete("as_text_module");
  generatedUrlObject.searchParams.delete("dynamic_import");
  generatedUrlObject.searchParams.delete("cjs_as_js_module");
  const urlForSourcemap = generatedUrlObject.href;
  return generateSourcemapFileUrl(urlForSourcemap);
};
