import { require } from "@jsenv/core/src/internal/require.js"
import { composeIstanbulCoverages } from "@jsenv/core/src/internal/executing/coverage/composeIstanbulCoverages.js"
import { evalSource } from "@jsenv/core/src/internal/runtime/createNodeRuntime/evalSource.js"
import { coverageIsEnabled } from "./coverageIsEnabled.js"

const { chromium } = require("playwright-chromium")

export const openBrowserPage = async (
  url,
  {
    inheritCoverage = coverageIsEnabled(),
    collectConsole = true,
    collectErrors = true,
    debug = false,
    headless = !debug,
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

  const executionResult = await Promise.race([getHtmlExecutionResult(page), errorPromise])
  removeErrorListener()

  if (executionResult.status === "errored") {
    executionResult.error = evalSource(executionResult.exceptionSource)
    delete executionResult.exceptionSource
  }

  if (inheritCoverage) {
    const { coverageMap } = executionResult
    global.__coverage__ = composeIstanbulCoverages(global.__coverage__ || {}, coverageMap || {})
  }

  delete executionResult.coverageMap
  const { fileExecutionResultMap } = executionResult
  Object.keys(fileExecutionResultMap).forEach((file) => {
    const fileExecutionResult = fileExecutionResultMap[file]
    delete fileExecutionResult.coverageMap
  })

  return {
    browser,
    page,
    pageErrors,
    pageLogs,
    executionResult,
  }
}

export const getHtmlExecutionResult = async (page) => {
  await page.waitForFunction(
    /* istanbul ignore next */
    () => {
      // eslint-disable-next-line no-undef
      return Boolean(window.__jsenv__)
    },
  )

  return page.evaluate(
    /* istanbul ignore next */
    () => {
      // eslint-disable-next-line no-undef
      return window.__jsenv__.executionResultPromise
    },
  )
}
