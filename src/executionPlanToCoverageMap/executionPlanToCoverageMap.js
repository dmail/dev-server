import { executionPlanToPlatformResultMap } from "./executionPlanToPlatformResultMap.js"
import { platformCoverageMapToCoverageMap } from "./platformCoverageMapToCoverageMap.js"
import { platformResultMapToCoverageMap } from "./platformResultMapToCoverageMap.js"

export const executionPlanToCoverageMap = async (
  executionPlan,
  { cancellationToken, localRoot, filesToCover },
) => {
  filesToCover.forEach((file) => {
    Object.keys(executionPlan).some((platformName) => {
      if (executionPlan[platformName].files.includes(file)) {
        throw new Error(
          `${file} must be covered but is also part of ${platformName} execution plan`,
        )
      }
    })
  })

  const platformResultMap = await executionPlanToPlatformResultMap(executionPlan, {
    cancellationToken,
  })

  const platformCoverageMap = platformResultMapToCoverageMap(platformResultMap)

  const coverageMap = await platformCoverageMapToCoverageMap({
    platformCoverageMap,
    cancellationToken,
    localRoot,
    filesToCover,
  })

  return coverageMap
}
