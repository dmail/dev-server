import {
  versionHighest,
  versionCompare,
  pluginMapToPluginsForPlatform,
} from "@dmail/project-structure-compile-babel"

export const compatibilityDescriptionToGroupArrayForPlatform = ({
  compatibilityDescription,
  platformName,
}) => {
  const babelPluginNameArray = Object.keys(compatibilityDescription)
  const platformVersions = babelPluginNameArray
    .map((babelPluginName) => String(compatibilityDescription[babelPluginName][platformName]))
    .filter((babelPluginName) => platformName in compatibilityDescription[babelPluginName])
    .concat("0.0.0") // at least version 0
    // filter is to have unique version I guess
    .filter((platformVersion, index, array) => array.indexOf(platformVersion) === index)
    .sort(versionCompare)

  const groupArray = []

  platformVersions.forEach((platformVersion) => {
    const babelPluginDescription = {}
    Object.keys(compatibilityDescription).forEach((babelPluginName) => {
      babelPluginDescription[babelPluginName] = babelPluginName
    })

    const babelPluginNameArrayForPlatform = pluginMapToPluginsForPlatform(
      babelPluginDescription,
      platformName,
      platformVersion,
      compatibilityDescription,
    ).sort()

    const groupWithPlatformBabelPlugin = groupArray.find((platformGroup) => {
      return (
        platformGroup.babelPluginNameArray.join("") === babelPluginNameArrayForPlatform.join("")
      )
    })

    if (groupWithPlatformBabelPlugin) {
      groupWithPlatformBabelPlugin.compatibility[platformName] = versionHighest(
        groupWithPlatformBabelPlugin.compatibility[platformName],
        platformVersion,
      )
    } else {
      groupArray.push({
        babelPluginNameArray: babelPluginNameArrayForPlatform.slice(),
        compatibility: {
          [platformName]: platformVersion,
        },
      })
    }
  })

  return groupArray
}
