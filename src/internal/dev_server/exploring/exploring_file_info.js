import { jsenvCoreDirectoryUrl } from "@jsenv/core/src/internal/jsenvCoreDirectoryUrl.js"

const htmlSourceUrl = new URL(
  "./src/internal/dev_server/exploring/exploring.html",
  jsenvCoreDirectoryUrl,
).href
export const exploringIndexHtmlFileInfo = {
  sourceUrl: htmlSourceUrl,
}

const jsRelativeUrl = "./src/internal/dev_server/exploring/exploring.js"
const jsBuildRelativeUrl = "./jsenv_exploring_index.js"
const jsBuildUrl = new URL(
  "./dist/jsenv_exploring_index.js",
  jsenvCoreDirectoryUrl,
).href
export const exploringIndexJsFileInfo = {
  relativeUrl: jsRelativeUrl,
  buildRelativeUrl: jsBuildRelativeUrl,
  buildUrl: jsBuildUrl,
}
