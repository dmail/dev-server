import { stat } from "node:fs"
import wrapAnsi from "wrap-ansi"
import cuid from "cuid"
import { loggerToLevels, createDetailedMessage } from "@jsenv/logger"
import {
  urlToFileSystemPath,
  resolveUrl,
  writeDirectory,
  ensureEmptyDirectory,
  normalizeStructuredMetaMap,
  urlToMeta,
} from "@jsenv/filesystem"
import { createLog } from "@jsenv/log"
import { Abort } from "@jsenv/abort"

import { launchAndExecute } from "../executing/launchAndExecute.js"
import { reportToCoverage } from "./coverage/reportToCoverage.js"
import { createExecutionResultLog } from "./executionLogs.js"
import { createSummaryLog } from "./createSummaryLog.js"

export const executeConcurrently = async (
  executionSteps,
  {
    multipleExecutionsOperation,

    logger,
    launchAndExecuteLogLevel,

    projectDirectoryUrl,
    compileServerOrigin,
    outDirectoryRelativeUrl,

    babelPluginMap,

    defaultMsAllocatedPerExecution = 30000,
    maxExecutionsInParallel = 1,
    completedExecutionLogMerging,
    completedExecutionLogAbbreviation,
    measureGlobalDuration = true,

    coverage,
    coverageConfig,
    coverageIncludeMissing,
    coverageForceIstanbul,
    coverageV8ConflictWarning,
    coverageTempDirectoryRelativeUrl,
    runtimeSupport,

    mainFileNotFoundCallback = ({ fileRelativeUrl }) => {
      logger.error(
        new Error(
          createDetailedMessage(`an execution main file does not exists.`, {
            ["file relative path"]: fileRelativeUrl,
          }),
        ),
      )
    },
    beforeExecutionCallback = () => {},
    afterExecutionCallback = () => {},

    logSummary,
  },
) => {
  const startMs = Date.now()

  const report = {}
  const executionCount = executionSteps.length

  let transformReturnValue = (value) => value

  const coverageTempDirectoryUrl = resolveUrl(
    coverageTempDirectoryRelativeUrl,
    projectDirectoryUrl,
  )

  const structuredMetaMapForCover = normalizeStructuredMetaMap(
    {
      cover: coverageConfig,
    },
    projectDirectoryUrl,
  )
  const coverageIgnorePredicate = (url) => {
    return !urlToMeta({
      url: resolveUrl(url, projectDirectoryUrl),
      structuredMetaMap: structuredMetaMapForCover,
    }).cover
  }

  if (coverage) {
    // in case runned multiple times, we don't want to keep writing lot of files in this directory
    if (!process.env.NODE_V8_COVERAGE) {
      await ensureEmptyDirectory(coverageTempDirectoryUrl)
    }

    if (runtimeSupport.node) {
      // v8 coverage is written in a directoy and auto propagate to subprocesses
      // through process.env.NODE_V8_COVERAGE.
      if (!coverageForceIstanbul && !process.env.NODE_V8_COVERAGE) {
        const v8CoverageDirectory = resolveUrl(
          `./node_v8/${cuid()}`,
          coverageTempDirectoryUrl,
        )
        await writeDirectory(v8CoverageDirectory, { allowUseless: true })
        process.env.NODE_V8_COVERAGE = urlToFileSystemPath(v8CoverageDirectory)
      }
    }

    transformReturnValue = async (value) => {
      if (multipleExecutionsOperation.signal.aborted) {
        // don't try to do the coverage stuff
        return value
      }

      try {
        value.coverage = await reportToCoverage(value.report, {
          multipleExecutionsOperation,
          logger,
          projectDirectoryUrl,
          babelPluginMap,
          coverageConfig,
          coverageIncludeMissing,
          coverageForceIstanbul,
          coverageIgnorePredicate,
          coverageV8ConflictWarning,
        })
      } catch (e) {
        if (Abort.isAbortError(e)) {
          return value
        }
        throw e
      }
      return value
    }
  }

  let previousExecutionResult
  let previousExecutionLog
  let abortedCount = 0
  let timedoutCount = 0
  let erroredCount = 0
  let completedCount = 0
  const executionsDone = await executeInParallel({
    multipleExecutionsOperation,
    maxExecutionsInParallel,
    executionSteps,
    start: async (paramsFromStep) => {
      const executionIndex = executionSteps.indexOf(paramsFromStep)
      const { executionName, fileRelativeUrl } = paramsFromStep
      const executionParams = {
        // the params below can be overriden by executionDefaultParams
        measurePerformance: false,
        collectPerformance: false,
        measureDuration: true,
        captureConsole: true,
        collectRuntimeName: true,
        collectRuntimeVersion: true,
        // stopAfterExecute: true to ensure runtime is stopped once executed
        // because we have what we wants: execution is completed and
        // we have associated coverage and capturedConsole
        // passsing false means all node process and browsers launched stays opened
        // (can eventually be used for debug)
        stopAfterExecute: true,
        stopAfterExecuteReason: "execution-done",
        allocatedMs: defaultMsAllocatedPerExecution,
        ...paramsFromStep,
        // mirrorConsole: false because file will be executed in parallel
        // so log would be a mess to read
        mirrorConsole: false,
      }

      const beforeExecutionInfo = {
        fileRelativeUrl,
        executionIndex,
        executionParams,
      }

      const filePath = urlToFileSystemPath(
        `${projectDirectoryUrl}${fileRelativeUrl}`,
      )
      const fileExists = await pathLeadsToFile(filePath)
      if (!fileExists) {
        mainFileNotFoundCallback(beforeExecutionInfo)
        return
      }

      beforeExecutionCallback(beforeExecutionInfo)

      // launchAndExecute peut retourner un aborted
      // et c'est bien, on veut le gérer, si tous les suivants sont aborted
      // on le gere en dehors de cette boucle
      const executionResult = await launchAndExecute({
        signal: multipleExecutionsOperation.signal,
        launchAndExecuteLogLevel,

        ...executionParams,
        collectCoverage: coverage,
        coverageTempDirectoryUrl,
        runtimeParams: {
          projectDirectoryUrl,
          compileServerOrigin,
          outDirectoryRelativeUrl,
          collectCoverage: coverage,
          coverageIgnorePredicate,
          coverageForceIstanbul,
          ...executionParams.runtimeParams,
        },
        executeParams: {
          fileRelativeUrl,
          ...executionParams.executeParams,
        },
        coverageV8ConflictWarning,
      })
      const afterExecutionInfo = {
        ...beforeExecutionInfo,
        executionResult,
      }
      afterExecutionCallback(afterExecutionInfo)

      if (executionResult.status === "aborted") {
        abortedCount++
      } else if (executionResult.status === "timedout") {
        timedoutCount++
      } else if (executionResult.status === "errored") {
        erroredCount++
      } else if (executionResult.status === "completed") {
        completedCount++
      }

      if (loggerToLevels(logger).info) {
        let log = createExecutionResultLog(afterExecutionInfo, {
          completedExecutionLogAbbreviation,
          executionCount,
          abortedCount,
          timedoutCount,
          erroredCount,
          completedCount,
        })
        const { columns = 80 } = process.stdout
        log = wrapAnsi(log, columns, {
          trim: false,
          hard: true,
          wordWrap: false,
        })

        if (
          previousExecutionLog &&
          completedExecutionLogMerging &&
          previousExecutionResult &&
          previousExecutionResult.status === "completed" &&
          (previousExecutionResult.consoleCalls
            ? previousExecutionResult.consoleCalls.length === 0
            : true) &&
          executionResult.status === "completed"
        ) {
          previousExecutionLog.write(log)
        } else {
          if (previousExecutionLog) {
            previousExecutionLog.destroy()
          }
          previousExecutionLog = createLog()
          previousExecutionLog.write(log)
        }
      }

      if (fileRelativeUrl in report === false) {
        report[fileRelativeUrl] = {}
      }
      report[fileRelativeUrl][executionName] = executionResult
      previousExecutionResult = executionResult
    },
  })

  const summaryCounts = reportToSummary(report)

  const summary = {
    executionCount,
    ...summaryCounts,
    // when execution is aborted, the remaining executions are "cancelled"
    cancelledCount:
      executionCount -
      executionsDone.length -
      // we substract abortedCount because they are not pushed into executionsDone
      summaryCounts.abortedCount,
    ...(measureGlobalDuration ? { startMs, endMs: Date.now() } : {}),
  }
  if (logSummary) {
    logger.info(createSummaryLog(summary))
  }

  return transformReturnValue({
    summary,
    report,
  })
}

const executeInParallel = async ({
  multipleExecutionsOperation,
  executionSteps,
  start,
  maxExecutionsInParallel = 1,
}) => {
  const executionResults = []
  let progressionIndex = 0
  let remainingExecutionCount = executionSteps.length

  const nextChunk = async () => {
    if (multipleExecutionsOperation.signal.aborted) {
      return
    }

    const outputPromiseArray = []
    while (
      remainingExecutionCount > 0 &&
      outputPromiseArray.length < maxExecutionsInParallel
    ) {
      remainingExecutionCount--
      const outputPromise = executeOne(progressionIndex)
      progressionIndex++
      outputPromiseArray.push(outputPromise)
    }

    if (outputPromiseArray.length) {
      await Promise.all(outputPromiseArray)
      if (remainingExecutionCount > 0) {
        await nextChunk()
      }
    }
  }

  const executeOne = async (index) => {
    const input = executionSteps[index]
    const output = await start(input)
    if (!multipleExecutionsOperation.signal.aborted) {
      executionResults[index] = output
    }
  }

  await nextChunk()

  return executionResults
}

const pathLeadsToFile = (path) => {
  return new Promise((resolve, reject) => {
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
}

const reportToSummary = (report) => {
  const fileNames = Object.keys(report)

  const countResultMatching = (predicate) => {
    return fileNames.reduce((previous, fileName) => {
      const fileExecutionResult = report[fileName]

      return (
        previous +
        Object.keys(fileExecutionResult).filter((executionName) => {
          const fileExecutionResultForRuntime =
            fileExecutionResult[executionName]
          return predicate(fileExecutionResultForRuntime)
        }).length
      )
    }, 0)
  }

  const abortedCount = countResultMatching(({ status }) => status === "aborted")
  const timedoutCount = countResultMatching(
    ({ status }) => status === "timedout",
  )
  const erroredCount = countResultMatching(({ status }) => status === "errored")
  const completedCount = countResultMatching(
    ({ status }) => status === "completed",
  )

  return {
    abortedCount,
    timedoutCount,
    erroredCount,
    completedCount,
  }
}
