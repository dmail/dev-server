import { computeBabelPluginMapForPlatform } from "internal/generateGroupMap/computeBabelPluginMapForPlatform.js"
import { generateCommonJsBundle } from "src/generateCommonJsBundle.js"
import { jsenvBabelPluginMap } from "src/jsenvBabelPluginMap.js"

export const generateCommonJsBundleForNode = ({
  babelPluginMap = jsenvBabelPluginMap,
  bundleDirectoryRelativeUrl,
  nodeMinimumVersion = decideNodeMinimumVersion(),
  cjsExtension,
  ...rest
}) => {
  const babelPluginMapForNode = computeBabelPluginMapForPlatform({
    babelPluginMap,
    platformName: "node",
    platformVersion: nodeMinimumVersion,
  })

  return generateCommonJsBundle({
    bundleDirectoryRelativeUrl,
    cjsExtension,
    compileGroupCount: 1,
    babelPluginMap: babelPluginMapForNode,
    ...rest,
  })
}

const decideNodeMinimumVersion = () => {
  return process.version.slice(1)
}
