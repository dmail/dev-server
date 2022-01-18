import { require } from "@jsenv/core/src/internal/require.js"
import { composeTwoFileByFileIstanbulCoverages } from "@jsenv/core/src/internal/executing/coverage_utils/istanbul_coverage_composition.js"
import { evalSource } from "@jsenv/core/src/internal/node_runtime/evalSource.js"
import { coverageIsEnabled } from "./coverageIsEnabled.js"

const { chromium } = require("playwright")

export const openBrowserPage = async (
  url,
  {
    inheritCoverage = coverageIsEnabled(),
    collectConsole = true,
    collectErrors = true,
    debug = false,
    headless = !debug,
    pageFunction,
  } = {},
) => {
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

  await page.goto(url)

  let removeErrorListener
  const errorPromise = new Promise((resolve, reject) => {
    page.on("pageerror", reject)
    removeErrorListener = () => {
      page.removeListener("pageerror", reject)
    }
  })

  const executionResult = await Promise.race([
    pageFunction
      ? page.evaluate(pageFunction)
      : getHtmlExecutionResult(page, { inheritCoverage }),
    errorPromise,
  ])
  removeErrorListener()

  return {
    browser,
    page,
    pageErrors,
    pageLogs,
    executionResult,
  }
}

export const getHtmlExecutionResult = async (
  page,
  { inheritCoverage = false } = {},
) => {
  const executionResult = await page.evaluate(
    /* istanbul ignore next */
    () => {
      // eslint-disable-next-line no-undef
      return window.__jsenv__.executionResultPromise
    },
  )
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
  return executionResult
}
