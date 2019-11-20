import { resolveFileUrl } from "internal/urlUtils.js"
import { jsenvCoreDirectoryUrl } from "internal/jsenvCoreDirectoryUrl.js"
import { generateBundle } from "internal/bundling/generateBundle.js"

export const generateSystemJsBundle = async ({
  bundleDirectoryRelativeUrl = "./dist/systemjs",
  ...rest
}) =>
  generateBundle({
    format: "systemjs",
    balancerTemplateFileUrl: resolveFileUrl(
      "./src/internal/bundling/systemjs-balancer-template.js",
      jsenvCoreDirectoryUrl,
    ),
    bundleDirectoryRelativeUrl,
    ...rest,
  })
