import {
  isFileSystemPath,
  fileSystemPathToUrl,
  urlToFileSystemPath,
} from "@jsenv/filesystem"

export const loadBabelConfigFromFile = async ({ projectDirectoryUrl }) => {
  const { loadOptionsAsync } = await import("@babel/core")
  const babelOptions = await loadOptionsAsync({
    root: urlToFileSystemPath(projectDirectoryUrl),
  })

  const babelPluginMap = {}
  babelOptions.plugins.forEach((plugin) => {
    const babelPluginName = babelPluginNameFromPlugin(plugin)

    babelPluginMap[babelPluginName] = plugin
  })
  return { babelPluginMap }
}

const babelPluginNameFromPlugin = ({ key }) => {
  if (
    isFileSystemPath(key) &&
    fileSystemPathToUrl(key).endsWith(
      "babel-plugin-transform-async-to-promises/async-to-promises.js",
    )
  ) {
    return "transform-async-to-promises"
  }
  return key
}
