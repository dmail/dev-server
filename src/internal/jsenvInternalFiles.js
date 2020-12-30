import { resolveUrl, fileSystemPathToUrl } from "@jsenv/util"
import { require } from "./require.js"
import { jsenvCoreDirectoryUrl } from "./jsenvCoreDirectoryUrl.js"

export const jsenvNodeSystemRelativeUrl = "./src/internal/node-launcher/node-js-file.js"
const jsenvNodeSystemBuildRelativeUrl = "./dist/jsenv-node-system.cjs"
export const jsenvNodeSystemUrl = resolveUrl(jsenvNodeSystemRelativeUrl, jsenvCoreDirectoryUrl)
export const jsenvNodeSystemBuildUrl = resolveUrl(
  jsenvNodeSystemBuildRelativeUrl,
  jsenvCoreDirectoryUrl,
)

export const jsenvBrowserSystemRelativeUrl =
  "./src/internal/browser-launcher/jsenv-browser-system.js"
const jsenvBrowserSystemBuildRelativeUrl = "./dist/jsenv-browser-system.js"
export const jsenvBrowserSystemUrl = resolveUrl(
  jsenvBrowserSystemRelativeUrl,
  jsenvCoreDirectoryUrl,
)
export const jsenvBrowserSystemBuildUrl = resolveUrl(
  jsenvBrowserSystemBuildRelativeUrl,
  jsenvCoreDirectoryUrl,
)

export const sourcemapMainFileUrl = fileSystemPathToUrl(
  require.resolve("source-map/dist/source-map.js"),
)

export const sourcemapMappingFileUrl = fileSystemPathToUrl(
  require.resolve("source-map/lib/mappings.wasm"),
)

// Exploring redirection
// (auto redirection to a compile group depending on browser capabilities)
export const jsenvExploringRedirectorHtmlUrl = resolveUrl(
  "./src/internal/exploring/exploring.redirector.html",
  jsenvCoreDirectoryUrl,
)
export const jsenvExploringRedirectorJsRelativeUrl =
  "./src/internal/exploring/exploring.redirector.js"
const jsenvExploringRedirectorJsBuildRelativeUrl = "./dist/jsenv-exploring-redirector.js"
export const jsenvExploringRedirectorJsUrl = resolveUrl(
  jsenvExploringRedirectorJsRelativeUrl,
  jsenvCoreDirectoryUrl,
)
export const jsenvExploringRedirectorJsBuildUrl = resolveUrl(
  jsenvExploringRedirectorJsBuildRelativeUrl,
  jsenvCoreDirectoryUrl,
)

// Exploring index and toolbar
export const jsenvExploringHtmlUrl = resolveUrl(
  "./src/internal/exploring/exploring.html",
  jsenvCoreDirectoryUrl,
)
export const jsenvToolbarHtmlUrl = resolveUrl(
  "./src/internal/toolbar/toolbar.html",
  jsenvCoreDirectoryUrl,
)
export const jsenvToolbarInjectorRelativeUrl = "./src/internal/toolbar/toolbar.injector.js"
const jsenvToolbarInjectorBuildRelativeUrl = "./dist/jsenv-toolbar-injector.js"
export const jsenvToolbarInjectorBuildUrl = resolveUrl(
  jsenvToolbarInjectorBuildRelativeUrl,
  jsenvCoreDirectoryUrl,
)
export const jsenvToolbarJsRelativeUrl = "./src/internal/toolbar/toolbar.main.js"
const jsenvToolbarJsBuildRelativeUrl = "dist/jsenv-toolbar.js"
export const jsenvToolbarJsUrl = resolveUrl(jsenvToolbarJsRelativeUrl, jsenvCoreDirectoryUrl)
export const jsenvToolbarJsBuildUrl = resolveUrl(
  jsenvToolbarJsBuildRelativeUrl,
  jsenvCoreDirectoryUrl,
)

export const jsenvImportMetaResolveGlobalUrl = resolveUrl(
  "helpers/import-meta-resolve/import-meta-resolve-global.js",
  jsenvCoreDirectoryUrl,
)
export const jsenvImportMetaResolveCommonjsUrl = resolveUrl(
  "helpers/import-meta-resolve/import-meta-resolve-commonjs.js",
  jsenvCoreDirectoryUrl,
)
