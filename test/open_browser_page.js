import { chromium } from "playwright"

import { composeTwoFileByFileIstanbulCoverages } from "@jsenv/core/src/internal/executing/coverage_utils/istanbul_coverage_composition.js"
import { evalSource } from "@jsenv/core/src/internal/node_runtime/evalSource.js"
import { coverageIsEnabled } from "./coverageIsEnabled.js"

export const openBrowserPage = async ({
  inheritCoverage = coverageIsEnabled(),
  collectConsole = true,
  collectErrors = true,
  debug = false,
  headless = !debug,
} = {}) => {
  const browser = await chromium.launch({
    headless,
  })
  const page = await browser.newPage({ ignoreHTTPSErrors: true })
  const pageLogs = []
  if (collectConsole) {
    page.on("console", (message) => {
      pageLogs.push({ type: message.type(), text: message.text() })
    })
  }
  const pageErrors = []
  if (collectErrors) {
    page.on("pageerror", (error) => {
      pageErrors.push(error)
    })
  }

  const getJsenvExecutionResult = async () => {
    let removeErrorListener
    const errorPromise = new Promise((resolve, reject) => {
      page.on("pageerror", reject)
      removeErrorListener = () => {
        page.removeListener("pageerror", reject)
      }
    })
    const executionResult = await Promise.race([
      page.evaluate(
        /* eslint-disable no-undef */
        /* istanbul ignore next */
        () => {
          return window.__jsenv__.executionResultPromise
        },
        /* eslint-enable no-undef */
      ),
      errorPromise,
    ])
    removeErrorListener()
    if (executionResult.status === "errored") {
      executionResult.error = evalSource(executionResult.exceptionSource)
      delete executionResult.exceptionSource
    }
    if (inheritCoverage) {
      const { coverage } = executionResult
      global.__indirectCoverage__ = composeTwoFileByFileIstanbulCoverages(
        global.__indirectCoverage__ || {},
        coverage || {},
      )
    }
    delete executionResult.coverage
    const { fileExecutionResultMap } = executionResult
    Object.keys(fileExecutionResultMap).forEach((file) => {
      const fileExecutionResult = fileExecutionResultMap[file]
      delete fileExecutionResult.coverage
    })
    delete executionResult.performance
    return {
      executionResult,
      pageErrors,
      pageLogs,
    }
  }

  return {
    browser,
    page,
    pageErrors,
    pageLogs,
    getJsenvExecutionResult,
  }
}
