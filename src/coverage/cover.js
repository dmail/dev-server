/* eslint-disable import/max-dependencies */
import { fileWrite } from "@dmail/helper"
import { namedValueDescriptionToMetaDescription, pathnameToMeta } from "@dmail/project-structure"
import { matchAllFileInsideFolder } from "@dmail/filesystem-matching"
import {
  operatingSystemPathToPathname,
  pathnameToOperatingSystemPath,
} from "@jsenv/operating-system-path"
import { executePlan } from "../executePlan/index.js"
import { executeDescriptionToExecutionPlan } from "../executeDescriptionToExecutionPlan.js"
import {
  catchAsyncFunctionCancellation,
  createProcessInterruptionCancellationToken,
} from "../cancellationHelper.js"
import { createInstrumentPlugin } from "./createInstrumentPlugin.js"
import { executionPlanResultToCoverageMap } from "./executionPlanResultToCoverageMap/index.js"
import { relativePathToEmptyCoverage } from "./relativePathToEmptyCoverage.js"
import { generateCoverageHTML } from "./generateCoverageHTML.js"
import { generateCoverageLog } from "./generateCoverageLog.js"
import {
  DEFAULT_COVERAGE_RELATIVE_PATH,
  DEFAULT_COVER_DESCRIPTION,
  DEFAULT_EXECUTE_DESCRIPTION,
  DEFAULT_MAX_PARALLEL_EXECUTION,
} from "./cover-constant.js"
import { LOG_LEVEL_ERRORS_WARNINGS_AND_LOGS, LOG_LEVEL_OFF } from "../logger.js"

export const cover = async ({
  projectPath,
  compileIntoRelativePath,
  importMapRelativePath,
  importDefaultExtension,
  browserPlatformRelativePath,
  nodePlatformRelativePath,
  browserGroupResolverRelativePath,
  nodeGroupResolverRelativePath,
  globalThisHelperRelativePath,
  coverageRelativePath = DEFAULT_COVERAGE_RELATIVE_PATH,
  // coverDescription could be deduced from passing
  // an entryPointMap and collecting all dependencies
  // for now we stick to coverDescription using project-structure api
  coverDescription = DEFAULT_COVER_DESCRIPTION,
  executeDescription = DEFAULT_EXECUTE_DESCRIPTION,
  babelPluginMap,
  compileGroupCount = 2,
  maxParallelExecution = DEFAULT_MAX_PARALLEL_EXECUTION,
  defaultAllocatedMsPerExecution = 30000,
  writeCoverageFile = true,
  logCoverageFilePath = true,
  logCoverageTable = false,
  writeCoverageHtmlFolder = false,
  updateProcessExitCode = true,
  throwUnhandled = true,
  compileServerLogLevel = LOG_LEVEL_OFF,
  executionLogLevel = LOG_LEVEL_ERRORS_WARNINGS_AND_LOGS,
  launchLogLevel = LOG_LEVEL_OFF,
  collectNamespace = false,
  measureDuration = true,
  captureConsole = true,
  generateMissedCoverage = true,
}) => {
  if (!writeCoverageFile) {
    if (logCoverageTable)
      throw new Error(`logCoverageTable must be false when writeCoverageFile is false`)
    if (writeCoverageHtmlFolder)
      throw new Error(`writeCoverageHtmlFolder must be false when writeCoverageFile is false`)
  }

  const start = async () => {
    const projectPathname = operatingSystemPathToPathname(projectPath)
    const cancellationToken = createProcessInterruptionCancellationToken()

    const coverMetaDescription = namedValueDescriptionToMetaDescription({
      cover: coverDescription,
    })

    const coverRelativePathPredicate = (relativePath) =>
      pathnameToMeta({
        pathname: relativePath,
        metaDescription: coverMetaDescription,
      }).cover === true

    ensureNoFileIsBothCoveredAndExecuted({ executeDescription, coverRelativePathPredicate })

    const [{ planResult, planResultSummary }, relativePathToCoverArray] = await Promise.all([
      (async () => {
        const instrumentBabelPlugin = createInstrumentPlugin({
          predicate: ({ relativePath }) => {
            return coverRelativePathPredicate(relativePath)
          },
        })

        const babelPluginMapWithInstrumentation = {
          ...babelPluginMap,
          "transform-instrument": [instrumentBabelPlugin],
        }

        const executionPlan = await executeDescriptionToExecutionPlan({
          cancellationToken,
          projectPathname,
          compileIntoRelativePath,
          importMapRelativePath,
          importDefaultExtension,
          browserPlatformRelativePath,
          nodePlatformRelativePath,
          browserGroupResolverRelativePath,
          nodeGroupResolverRelativePath,
          globalThisHelperRelativePath,
          babelPluginMap: babelPluginMapWithInstrumentation,
          compileGroupCount,
          executeDescription,
          compileServerLogLevel,
          cover: true,
        })

        return executePlan(executionPlan, {
          logLevel: executionLogLevel,
          launchLogLevel,
          cancellationToken,
          defaultAllocatedMsPerExecution,
          maxParallelExecution,
          measureDuration,
          captureConsole,
          collectNamespace,
          collectCoverage: true,
        })
      })(),
      listRelativePathToCover({
        cancellationToken,
        projectPathname,
        coverDescription,
      }),
    ])

    const executionCoverageMap = executionPlanResultToCoverageMap(planResult)
    const relativePathMissingCoverageArray = relativePathToCoverArray.filter(
      (relativePathToCover) => relativePathToCover.slice(1) in executionCoverageMap === false,
    )

    let coverageMap
    if (generateMissedCoverage) {
      const missedCoverageMap = {}
      await Promise.all(
        relativePathMissingCoverageArray.map(async (relativePathMissingCoverage) => {
          const emptyCoverage = await relativePathToEmptyCoverage({
            cancellationToken,
            projectPathname,
            relativePath: relativePathMissingCoverage,
          })
          missedCoverageMap[relativePathMissingCoverage.slice(1)] = emptyCoverage
          return emptyCoverage
        }),
      )

      coverageMap = {
        ...executionCoverageMap,
        ...missedCoverageMap,
      }
    } else {
      coverageMap = executionCoverageMap
    }

    if (updateProcessExitCode) {
      if (planResultSummary.executionCount !== planResultSummary.completedCount) {
        process.exitCode = 1
      }
    }

    if (writeCoverageFile) {
      const coverageFilename = pathnameToOperatingSystemPath(
        `${projectPathname}${coverageRelativePath}`,
      )

      await fileWrite(coverageFilename, JSON.stringify(coverageMap, null, "  "))
      if (logCoverageFilePath) {
        console.log(`-> ${coverageFilename}`)
      }
    }

    if (logCoverageTable) {
      generateCoverageLog(coverageMap)
    }
    if (writeCoverageHtmlFolder) {
      generateCoverageHTML(coverageMap)
    }

    return {
      planResult,
      planResultSummary,
      coverageMap,
    }
  }

  const promise = catchAsyncFunctionCancellation(start)
  if (!throwUnhandled) return promise
  return promise.catch((e) => {
    setTimeout(() => {
      throw e
    })
  })
}

const ensureNoFileIsBothCoveredAndExecuted = ({
  executeDescription,
  coverRelativePathPredicate,
}) => {
  const fileToExecuteAndCoverArray = Object.keys(executeDescription).filter((relativePath) =>
    coverRelativePathPredicate(relativePath),
  )
  if (fileToExecuteAndCoverArray.length) {
    // I think it is an error, it would be strange, for a given file
    // to be both covered and executed
    throw new Error(`some file are both covered and executed:
${fileToExecuteAndCoverArray.join("\n")}`)
  }
}

const listRelativePathToCover = async ({
  cancellationToken,
  projectPathname,
  coverDescription,
}) => {
  const metaDescriptionForCover = namedValueDescriptionToMetaDescription({
    cover: coverDescription,
  })

  const matchingFileResultArray = await matchAllFileInsideFolder({
    cancellationToken,
    folderPath: projectPathname,
    metaDescription: metaDescriptionForCover,
    predicate: ({ cover }) => cover,
    transformFile: ({ relativePath }) => relativePath,
  })

  const relativePathToCoverArray = matchingFileResultArray.map(({ relativePath }) => relativePath)
  return relativePathToCoverArray
}
