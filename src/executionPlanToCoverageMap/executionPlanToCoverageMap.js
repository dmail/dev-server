import { projectConfigToJsCompileService } from "../createJsCompileService.js"
import { open as serverCompileOpen } from "../server-compile/index.js"
import { predicateCompose } from "../functionHelper.js"
import { executionPlanToPlatformResultMap } from "./executionPlanToPlatformResultMap.js"
import { platformCoverageMapToCoverageMap } from "./platformCoverageMapToCoverageMap.js"
import { platformResultMapToCoverageMap } from "./platformResultMapToCoverageMap.js"

const executionPlanToFileIsInsidePlan = (executionPlan) => {
  const files = new Set()

  Object.keys(executionPlan).forEach((name) => {
    executionPlan[name].files.forEach((file) => {
      files.add(file)
    })
  })

  return (file) => files.has(file)
}

export const executionPlanToCoverageMap = async (
  executionPlan,
  {
    localRoot,
    compileInto,
    pluginMap,

    instrumentPredicate,
    cacheIgnore,
    cacheTrackHit,
    cacheStrategy,
    watchPredicate = () => true,
    listFilesToCover = () => [],
  },
  { cancellationToken, watch = false },
) => {
  const fileIsInsidePlan = executionPlanToFileIsInsidePlan(executionPlan)
  const jsCompileService = await projectConfigToJsCompileService({
    localRoot,
    compileInto,
    pluginMap,
    instrumentPredicate: predicateCompose(
      instrumentPredicate,
      (file) => fileIsInsidePlan(file) === false,
    ),
    cacheIgnore,
    cacheTrackHit,
    cacheStrategy,
  })

  const [server, filesToCover] = await Promise.all([
    serverCompileOpen({
      cancellationToken,
      protocol: "http",
      ip: "127.0.0.1",
      port: 0,
      localRoot,
      compileInto,
      compileService: jsCompileService,
      watchPredicate,
      watch,
    }),
    listFilesToCover(),
  ])

  const platformResultMap = await executionPlanToPlatformResultMap(executionPlan, {
    cancellationToken,
    localRoot,
    compileInto,
    remoteRoot: server.origin,
    watch,
  })

  const platformCoverageMap = platformResultMapToCoverageMap(platformResultMap)

  const coverageMap = await platformCoverageMapToCoverageMap(platformCoverageMap, {
    cancellationToken,
    localRoot,
    filesToCover: filesToCover.filter((file) => fileIsInsidePlan(file) === false),
  })

  return coverageMap
}
