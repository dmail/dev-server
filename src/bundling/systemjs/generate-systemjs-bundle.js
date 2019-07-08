import { generateBundle } from "../generate-bundle.js"
import {
  DEFAULT_BUNDLE_INTO_RELATIVE_PATH,
  DEFAULT_BALANCER_TEMPLATE_RELATIVE_PATH,
} from "./generate-systemjs-bundle-constant.js"

export const generateSystemJsBundle = async ({
  projectPath,
  bundleIntoRelativePath = DEFAULT_BUNDLE_INTO_RELATIVE_PATH,
  balancerTemplateRelativePath = DEFAULT_BALANCER_TEMPLATE_RELATIVE_PATH,
  importMapRelativePath,
  specifierMap,
  dynamicSpecifierMap,
  entryPointMap,
  babelPluginMap,
  logLevel,
  minify,
  throwUnhandled,
  writeOnFileSystem,
  compileGroupCount,
  platformGroupResolverRelativePath,
  platformScoreMap,
  platformAlwaysInsidePlatformScoreMap,
}) =>
  generateBundle({
    format: "systemjs",
    balancerTemplateRelativePath,
    balancerDataClientPathname: "/.jsenv/systemjs-balancer-data.js",
    projectPath,
    bundleIntoRelativePath,
    importMapRelativePath,
    specifierMap,
    dynamicSpecifierMap,
    entryPointMap,
    babelPluginMap,
    logLevel,
    minify,
    throwUnhandled,
    writeOnFileSystem,
    compileGroupCount,
    platformGroupResolverRelativePath,
    platformScoreMap,
    platformAlwaysInsidePlatformScoreMap,
  })
