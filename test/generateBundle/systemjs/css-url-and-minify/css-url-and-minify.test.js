import { basename } from "path"
import { assert } from "@jsenv/assert"
import { resolveDirectoryUrl, urlToRelativeUrl, resolveUrl, readFile } from "@jsenv/util"
import { generateBundle } from "@jsenv/core/index.js"
import { jsenvCoreDirectoryUrl } from "@jsenv/core/src/internal/jsenvCoreDirectoryUrl.js"
import { parseCssUrls } from "@jsenv/core/src/internal/bundling/css/parseCssUrls.js"
import { GENERATE_SYSTEMJS_BUNDLE_TEST_PARAMS } from "../TEST_PARAMS.js"

const testDirectoryUrl = resolveDirectoryUrl("./", import.meta.url)
const testDirectoryRelativeUrl = urlToRelativeUrl(testDirectoryUrl, jsenvCoreDirectoryUrl)
const testDirectoryname = basename(testDirectoryRelativeUrl)
const jsenvDirectoryRelativeUrl = `${testDirectoryRelativeUrl}.jsenv/`
const bundleDirectoryRelativeUrl = `${testDirectoryRelativeUrl}dist/systemjs/`
const mainFilename = `${testDirectoryname}.html`
const entryPointMap = {
  [`./${testDirectoryRelativeUrl}${mainFilename}`]: "./main.html",
}

const { bundleManifest } = await generateBundle({
  ...GENERATE_SYSTEMJS_BUNDLE_TEST_PARAMS,
  // logLevel: "info",
  jsenvDirectoryRelativeUrl,
  bundleDirectoryRelativeUrl,
  entryPointMap,
  minify: true,
})

const getBundleRelativeUrl = (urlRelativeToTestDirectory) => {
  const relativeUrl = `${testDirectoryRelativeUrl}${urlRelativeToTestDirectory}`
  const bundleRelativeUrl = bundleManifest[relativeUrl]
  return bundleRelativeUrl
}

const bundleDirectoryUrl = resolveUrl(bundleDirectoryRelativeUrl, jsenvCoreDirectoryUrl)
const styleBundleRelativeUrl = getBundleRelativeUrl("style.css")
const imgBundleRelativeUrl = getBundleRelativeUrl("img.png")
const styleBundleUrl = resolveUrl(styleBundleRelativeUrl, bundleDirectoryUrl)
const imgBundleUrl = resolveUrl(imgBundleRelativeUrl, bundleDirectoryUrl)

// ensure background image url is properly updated
{
  const styleCssString = await readFile(styleBundleUrl)
  const styleUrls = await parseCssUrls(styleCssString, styleBundleUrl)
  const actual = styleUrls.urlDeclarations[0].specifier
  const expected = urlToRelativeUrl(imgBundleUrl, styleBundleUrl)
  assert({ actual, expected })
}
