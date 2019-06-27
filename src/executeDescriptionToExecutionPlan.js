import { namedValueDescriptionToMetaDescription } from "@dmail/project-structure"
import { matchAllFileInsideFolder } from "@dmail/filesystem-matching"
import { pathnameToOperatingSystemPath } from "@jsenv/operating-system-path"
import { startCompileServer } from "./compile-server/index.js"

export const executeDescriptionToExecutionPlan = async ({
  cancellationToken,
  projectPathname,
  compileIntoRelativePath,
  importMapRelativePath,
  browserGroupResolverRelativePath,
  nodeGroupResolverRelativePath,
  compileGroupCount,
  babelPluginMap,
  executeDescription,
  defaultAllocatedMsPerExecution,
  compileServerLogLevel,
  cover = false,
}) => {
  const projectPath = pathnameToOperatingSystemPath(projectPathname)

  const { origin: compileServerOrigin } = await startCompileServer({
    cancellationToken,
    projectPath,
    compileIntoRelativePath,
    importMapRelativePath,
    browserGroupResolverRelativePath,
    nodeGroupResolverRelativePath,
    compileGroupCount,
    babelPluginMap,
    logLevel: compileServerLogLevel,
  })

  const metaDescription = namedValueDescriptionToMetaDescription({
    execute: executeDescription,
  })

  const executionPlan = {}
  await matchAllFileInsideFolder({
    cancellationToken,
    folderPath: projectPathname,
    metaDescription,
    predicate: ({ execute }) => execute,
    matchingFileOperation: ({ relativePath, meta }) => {
      const executionMeta = meta.execute
      const fileExecutionPlan = {}
      Object.keys(executionMeta).forEach((executionName) => {
        const singleExecutionPlan = executionMeta[executionName]
        if (singleExecutionPlan === null || singleExecutionPlan === undefined) return
        if (typeof singleExecutionPlan !== "object") {
          throw new TypeError(`a single execution must be an object.
          fileRelativePath: ${relativePath}
executionName: ${executionName}
singleExecutionPlan: ${singleExecutionPlan}`)
        }

        const { launch, allocatedMs } = singleExecutionPlan
        fileExecutionPlan[executionName] = {
          launch: (options) =>
            launch({
              ...options,
              cancellationToken,
              compileServerOrigin,
              projectPath,
              compileIntoRelativePath,
              babelPluginMap,
              cover,
            }),
          allocatedMs: allocatedMs === undefined ? defaultAllocatedMsPerExecution : allocatedMs,
        }
      })

      executionPlan[relativePath] = fileExecutionPlan
    },
  })
  return executionPlan
}
