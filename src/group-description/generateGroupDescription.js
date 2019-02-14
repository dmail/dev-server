// we could reuse this to get a list of polyfill
// using https://github.com/babel/babel/blob/master/packages/babel-preset-env/data/built-ins.json#L1
// adding a featureNameArray to every group
// and according to that featureNameArray, add these polyfill
// to the generated bundle

import { arrayWithoutValue } from "@dmail/helper"
import { decreaseArrayByComposingValues } from "../decreaseArrayByComposingValues.js"
import { babelPluginCompatibilityDescription as defaultBabelPluginCompatibilityDescription } from "./babelPluginCompatibilityDescription.js"
import { compatibilityDescriptionToGroupArray } from "./compatibility-description/compatibilityDescriptionToGroupArray.js"
import { compatibilityToScore } from "./compatibility/compatibilityToScore.js"
import { babelPluginNameArrayToScore } from "./babel-plugin-name-array/babelPluginNameArrayToScore.js"
import { composeGroup } from "./group/composeGroup.js"

const BEST_ID = "best"
const OTHERWISE_ID = "otherwise"

export const generateGroupDescription = ({
  babelPluginDescription,
  platformScoring,
  groupCount = 4,
  babelPluginCompatibilityDescription = defaultBabelPluginCompatibilityDescription,
}) => {
  if (typeof babelPluginDescription !== "object")
    throw new TypeError(`babelPluginDescription must be an object, got ${babelPluginDescription}`)
  if (typeof platformScoring !== "object")
    throw new TypeError(`platformScoring must be an object, got ${platformScoring}`)
  if (typeof groupCount < 1) throw new TypeError(`groupCount must be above 1, got ${groupCount}`)

  const babelPluginNameArray = Object.keys(babelPluginDescription)

  const groupWithEverything = {
    babelPluginNameArray: babelPluginNameArray.sort(),
    compatibility: {},
  }

  if (groupCount === 1) {
    return {
      [OTHERWISE_ID]: groupWithEverything,
    }
  }

  const specificBabelPluginCompatibilityDescription = {}
  babelPluginNameArray.forEach((babelPluginName) => {
    specificBabelPluginCompatibilityDescription[babelPluginName] =
      babelPluginName in babelPluginCompatibilityDescription
        ? babelPluginCompatibilityDescription[babelPluginName]
        : {}
  })

  const groupArrayWithEveryCombination = compatibilityDescriptionToGroupArray({
    compatibilityDescription: specificBabelPluginCompatibilityDescription,
    platformNames: arrayWithoutValue(Object.keys(platformScoring), "other"),
  })
  if (groupArrayWithEveryCombination.length === 0) {
    return {
      [OTHERWISE_ID]: groupWithEverything,
    }
  }

  const groupToScore = ({ compatibility }) => compatibilityToScore(compatibility, platformScoring)
  const groupArrayWithEveryCombinationSortedByPlatformScore = groupArrayWithEveryCombination.sort(
    (a, b) => groupToScore(b) - groupToScore(a),
  )

  const groupArrayDecreased = decreaseArrayByComposingValues({
    array: groupArrayWithEveryCombinationSortedByPlatformScore,
    length: groupCount,
    composer: composeGroup,
  })

  const groupToComplexityScore = ({ babelPluginNameArray }) =>
    babelPluginNameArrayToScore(babelPluginNameArray)
  const groupArrayDecreasedSortedByCompexityScore = groupArrayDecreased.sort(
    (a, b) => groupToComplexityScore(a) - groupToComplexityScore(b),
  )

  const length = groupArrayDecreasedSortedByCompexityScore.length
  const groupDescription = {}

  groupDescription[BEST_ID] = groupArrayDecreasedSortedByCompexityScore[0]
  groupArrayDecreasedSortedByCompexityScore
    .slice(
      // the first group is already marked as being the best
      1,
      // if we have a lot of group, the last group must be replaced by
      // the groupWithEverything to ensure all plugins are enabled
      // when we cannot detect the platform or it is not compatible
      // but if we have few groups, we can keep the last one
      length === groupCount ? -1 : groupArrayDecreasedSortedByCompexityScore.length,
    )
    .forEach((intermediatePluginGroup, index) => {
      groupDescription[`intermediate-${index + 1}`] = intermediatePluginGroup
    })
  groupDescription[OTHERWISE_ID] = groupWithEverything

  return groupDescription
}
