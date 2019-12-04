/* eslint-disable import/max-dependencies */
import { cpus } from "os"
import { stat } from "fs"
import { createConcurrentOperations } from "@jsenv/cancellation"
import { fileUrlToPath } from "internal/urlUtils.js"
import { launchAndExecute } from "internal/executing/launchAndExecute.js"
import { reportToCoverageMap } from "./coverage/reportToCoverageMap.js"
import { createExecutionResultLog } from "./executionLogs.js"
import { createSummaryLog } from "./createSummaryLog.js"

export const executeConcurrently = async (
  executionSteps,
  {
    cancellationToken,
    logger,
    launchLogger,
    executeLogger,

    projectDirectoryUrl,
    outDirectoryRelativeUrl,
    compileServerOrigin,

    babelPluginMap,

    measurePlanExecutionDuration,
    concurrencyLimit = Math.max(cpus.length - 1, 1),
    executionDefaultOptions = {},
    logSummary,

    coverage,
    coverageConfig,
    coverageIncludeMissing,
  },
) => {
  if (typeof compileServerOrigin !== "string") {
    throw new TypeError(`compileServerOrigin must be a string, got ${compileServerOrigin}`)
  }

  const executionOptionsFromDefault = {
    allocatedMs: 30000,
    measureDuration: true,
    // mirrorConsole: false because file will be executed in parallel
    // so log would be a mess to read
    mirrorConsole: false,
    captureConsole: true,
    collectPlatformName: true,
    collectPlatformVersion: true,
    collectNamespace: false,
    collectCoverage: coverage,

    logSuccess: true,
    mainFileNotFoundCallback: ({ fileRelativeUrl }) => {
      logger.error(
        new Error(`an execution main file does not exists.
--- file relative path ---
${fileRelativeUrl}`),
      )
    },
    beforeExecutionCallback: () => {},
    afterExecutionCallback: () => {},
    ...executionDefaultOptions,
  }

  let startMs
  if (measurePlanExecutionDuration) {
    startMs = Date.now()
  }

  const report = {}
  const executionCount = executionSteps.length
  await createConcurrentOperations({
    cancellationToken,
    concurrencyLimit,
    array: executionSteps,
    start: async (executionOptionsFromStep) => {
      const executionIndex = executionSteps.indexOf(executionOptionsFromStep)
      const executionOptions = {
        ...executionOptionsFromDefault,
        ...executionOptionsFromStep,
      }

      const {
        name,
        executionId,
        fileRelativeUrl,
        launch,
        allocatedMs,
        measureDuration,
        mirrorConsole,
        captureConsole,
        collectPlatformName,
        collectPlatformVersion,
        collectCoverage,
        collectNamespace,

        mainFileNotFoundCallback,
        beforeExecutionCallback,
        afterExecutionCallback,
        logSuccess,
      } = executionOptions

      const beforeExecutionInfo = {
        allocatedMs,
        name,
        executionId,
        fileRelativeUrl,
        executionIndex,
      }

      const filePath = fileUrlToPath(`${projectDirectoryUrl}${fileRelativeUrl}`)
      const fileExists = await pathLeadsToFile(filePath)
      if (!fileExists) {
        mainFileNotFoundCallback(beforeExecutionInfo)
        return
      }

      beforeExecutionCallback(beforeExecutionInfo)
      const executionResult = await launchAndExecute({
        cancellationToken,
        launchLogger,
        executeLogger,
        launch: (params) =>
          launch({
            projectDirectoryUrl,
            outDirectoryRelativeUrl,
            compileServerOrigin,
            ...params,
          }),
        allocatedMs,
        measureDuration,
        collectPlatformName,
        collectPlatformVersion,
        mirrorConsole,
        captureConsole,
        // stopPlatformAfterExecute: true to ensure platform is stopped once executed
        // because we have what we wants: execution is completed and
        // we have associated coverageMap and capturedConsole
        stopPlatformAfterExecute: true,
        executionId,
        fileRelativeUrl,
        collectCoverage,
        collectNamespace,
      })
      const afterExecutionInfo = {
        ...beforeExecutionInfo,
        ...executionResult,
      }
      afterExecutionCallback(afterExecutionInfo)

      if (executionResult.status !== "completed" || logSuccess) {
        logger.info(createExecutionResultLog(afterExecutionInfo, { executionCount }))
      }

      if (fileRelativeUrl in report === false) {
        report[fileRelativeUrl] = {}
      }
      report[fileRelativeUrl][name] = executionResult
    },
  })

  const summary = reportToSummary(report)
  if (measurePlanExecutionDuration) {
    summary.startMs = startMs
    summary.endMs = Date.now()
  }

  if (logSummary) {
    logger.info(createSummaryLog(summary))
  }

  return {
    summary,
    report,
    ...(coverage
      ? {
          coverageMap: await reportToCoverageMap(report, {
            cancellationToken,
            projectDirectoryUrl,
            babelPluginMap,
            coverageConfig,
            coverageIncludeMissing,
          }),
        }
      : {}),
  }
}

const pathLeadsToFile = (path) =>
  new Promise((resolve, reject) => {
    stat(path, (error, stats) => {
      if (error) {
        if (error.code === "ENOENT") {
          resolve(false)
        } else {
          reject(error)
        }
      } else {
        resolve(stats.isFile())
      }
    })
  })

const reportToSummary = (report) => {
  const fileNames = Object.keys(report)
  const executionCount = fileNames.reduce((previous, fileName) => {
    return previous + Object.keys(report[fileName]).length
  }, 0)

  const countResultMatching = (predicate) => {
    return fileNames.reduce((previous, fileName) => {
      const fileExecutionResult = report[fileName]

      return (
        previous +
        Object.keys(fileExecutionResult).filter((executionName) => {
          const fileExecutionResultForPlatform = fileExecutionResult[executionName]
          return predicate(fileExecutionResultForPlatform)
        }).length
      )
    }, 0)
  }

  const disconnectedCount = countResultMatching(({ status }) => status === "disconnected")
  const timedoutCount = countResultMatching(({ status }) => status === "timedout")
  const erroredCount = countResultMatching(({ status }) => status === "errored")
  const completedCount = countResultMatching(({ status }) => status === "completed")

  return {
    executionCount,
    disconnectedCount,
    timedoutCount,
    erroredCount,
    completedCount,
  }
}
