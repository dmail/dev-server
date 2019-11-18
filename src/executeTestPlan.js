/* eslint-disable import/max-dependencies */
import {
  catchAsyncFunctionCancellation,
  createCancellationTokenForProcessSIGINT,
} from "@jsenv/cancellation"
import { createLogger } from "@jsenv/logger"
import { metaMapToSpecifierMetaMap, normalizeSpecifierMetaMap, urlToMeta } from "@jsenv/url-meta"
import { pathToDirectoryUrl, resolveDirectoryUrl, resolveFileUrl } from "internal/urlUtils.js"
import {
  assertProjectDirectoryPath,
  assertProjectDirectoryExists,
  assertImportMapFileRelativePath,
  assertImportMapFileInsideProject,
  assertCompileDirectoryRelativePath,
  assertCompileDirectoryInsideProject,
} from "internal/argUtils.js"
import { executePlan } from "internal/executing/executePlan.js"
import { executionIsPassed } from "internal/executing/executionIsPassed.js"
import { generateCoverageJsonFile } from "internal/executing/coverage/generateCoverageJsonFile.js"
import { generateCoverageHtmlDirectory } from "internal/executing/coverage/generateCoverageHtmlDirectory.js"
import { generateCoverageTextLog } from "internal/executing/coverage/generateCoverageTextLog.js"

export const executeTestPlan = async ({
  cancellationToken = createCancellationTokenForProcessSIGINT(),
  logLevel,
  compileServerLogLevel = "off",
  launchLogLevel = "off",
  executeLogLevel = "off",

  projectDirectoryPath,
  compileDirectoryRelativePath = "./.dist/",
  compileDirectoryClean,
  importMapFileRelativePath = "./importMap.json",
  compileGroupCount = 2,

  testPlan,
  measurePlanExecutionDuration = false,
  concurrencyLimit,
  executionDefaultOptions = {},
  logSummary = true,
  updateProcessExitCode = true,

  coverage = false,
  coverageConfig = {
    "./index.js": true,
    "./src/**/*.js": true,
    "./**/*.test.*": false, // contains .test. -> nope
    "./**/test/": false, // inside a test folder -> nope,
  },
  coverageIncludeMissing = true,
  coverageAndExecutionAllowed = false,
  coverageTextLog = true,
  coverageJsonFile = Boolean(process.env.CI),
  coverageJsonFileLog = true,
  coverageJsonFileRelativePath = "./coverage/coverage-final.json",
  coverageHtmlDirectory = !process.env.CI,
  coverageHtmlDirectoryRelativePath = "./coverage",
  coverageHtmlDirectoryIndexLog = true,
}) => {
  const logger = createLogger({ logLevel })
  const launchLogger = createLogger({ logLevel: launchLogLevel })
  const executeLogger = createLogger({ logLevel: executeLogLevel })

  assertProjectDirectoryPath({ projectDirectoryPath })
  const projectDirectoryUrl = pathToDirectoryUrl(projectDirectoryPath)
  await assertProjectDirectoryExists({ projectDirectoryUrl })

  assertImportMapFileRelativePath({ importMapFileRelativePath })
  const importMapFileUrl = resolveFileUrl(importMapFileRelativePath, projectDirectoryUrl)
  assertImportMapFileInsideProject({ importMapFileUrl, projectDirectoryUrl })

  assertCompileDirectoryRelativePath({ compileDirectoryRelativePath })
  const compileDirectoryUrl = resolveDirectoryUrl({
    compileDirectoryRelativePath,
    projectDirectoryUrl,
  })
  assertCompileDirectoryInsideProject({ compileDirectoryUrl, projectDirectoryUrl })

  if (coverage) {
    if (typeof coverageConfig !== "object") {
      throw new TypeError(`coverageConfig must be an object, got ${coverageConfig}`)
    }
    if (Object.keys(coverageConfig).length === 0) {
      logger.warn(
        `coverageConfig is an empty object. Nothing will be instrumented for coverage so your coverage will be empty`,
      )
    }
    if (!coverageAndExecutionAllowed) {
      const fileSpecifierMapForExecute = normalizeSpecifierMetaMap(
        metaMapToSpecifierMetaMap({
          execute: testPlan,
        }),
        "file:///",
      )

      const fileSpecifierMapForCover = normalizeSpecifierMetaMap(
        metaMapToSpecifierMetaMap({
          cover: coverageConfig,
        }),
        "file:///",
      )

      const fileSpecifierMatchingCoverAndExecuteArray = Object.keys(
        fileSpecifierMapForExecute,
      ).filter((fileUrl) => {
        return urlToMeta({
          url: fileUrl,
          specifierMetaMap: fileSpecifierMapForCover,
        }).cover
      })

      if (fileSpecifierMatchingCoverAndExecuteArray.length) {
        // I think it is an error, it would be strange, for a given file
        // to be both covered and executed
        throw new Error(`some file will be both covered and executed
--- specifiers ---
${fileSpecifierMatchingCoverAndExecuteArray.join("\n")}`)
      }
    }
  }

  return catchAsyncFunctionCancellation(async () => {
    const result = await executePlan({
      cancellationToken,
      compileServerLogLevel,
      logger,
      launchLogger,
      executeLogger,

      compileGroupCount,
      projectDirectoryUrl,
      compileDirectoryUrl,
      compileDirectoryClean,
      importMapFileUrl,

      plan: testPlan,
      measurePlanExecutionDuration,
      concurrencyLimit,
      executionDefaultOptions,
      logSummary,

      coverage,
      coverageConfig,
      coverageIncludeMissing,
    })

    if (updateProcessExitCode && !executionIsPassed(result)) {
      process.exitCode = 1
    }

    const promises = []
    if (coverage && coverageJsonFile) {
      promises.push(
        generateCoverageJsonFile({
          projectDirectoryUrl,
          coverageJsonFileRelativePath,
          coverageJsonFileLog,
          coverageMap: result.coverageMap,
        }),
      )
    }
    if (coverage && coverageHtmlDirectory) {
      promises.push(
        generateCoverageHtmlDirectory({
          coverageMap: result.coverageMap,
          projectDirectoryUrl,
          coverageHtmlDirectoryRelativePath,
          coverageHtmlDirectoryIndexLog,
        }),
      )
    }
    if (coverage && coverageTextLog) {
      promises.push(
        generateCoverageTextLog({
          coverageMap: result.coverageMap,
        }),
      )
    }
    await Promise.all(promises)

    return result
  })
}
