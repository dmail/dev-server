import { resolveFileUrl } from "./internal/urlUtils.js"
import { jsenvCoreDirectoryUrl } from "./internal/jsenvCoreDirectoryUrl.js"
import { generateBundle } from "./internal/bundle/generateBundle/generateBundle.js"

export const generateCommonJsBundle = async ({
  bundleDirectoryRelativePath = "./dist/commonjs",
  node = true,
  ...rest
}) =>
  generateBundle({
    format: "commonjs",
    bundleDirectoryRelativePath,
    node,
    balancerTemplateFileUrl: resolveFileUrl(
      "./src/internal/bundle/commonjs-balancer-template.js",
      jsenvCoreDirectoryUrl,
    ),
    balancerDataAbstractSpecifier: "/.jsenv/commonjs-balancer-data.js",
    ...rest,
  })
