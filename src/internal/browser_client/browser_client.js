import { fetchUrl } from "@jsenv/core/src/internal/browser_utils/fetch_browser.js"
import { fetchAndEval } from "@jsenv/core/src/internal/browser_utils/fetch_and_eval.js"
import { unevalException } from "@jsenv/core/src/internal/unevalException.js"
import { memoize } from "@jsenv/core/src/internal/memoize.js"

import { createBrowserClient } from "./browser_client_factory.js"
import { installBrowserErrorStackRemapping } from "./browser_error_stack_remap.js"
import { displayErrorInDocument } from "./error_in_document.js"
import { displayErrorNotification } from "./error_in_notification.js"

const getNavigationStartTime = () => {
  try {
    return window.performance.timing.navigationStart
  } catch (e) {
    return Date.now()
  }
}

const navigationStartTime = getNavigationStartTime()

const readyPromise = new Promise((resolve) => {
  if (document.readyState === "complete") {
    resolve()
  } else {
    const loadCallback = () => {
      window.removeEventListener("load", loadCallback)
      resolve()
    }
    window.addEventListener("load", loadCallback)
  }
})

const fileExecutionMap = {}

const executionResultPromise = readyPromise.then(async () => {
  const fileExecutionResultMap = {}
  const fileExecutionResultPromises = []
  let status = "completed"
  let exceptionSource = ""
  Object.keys(fileExecutionMap).forEach((key) => {
    fileExecutionResultMap[key] = null // to get always same order for Object.keys(executionResult)
    const fileExecutionResultPromise = fileExecutionMap[key]
    fileExecutionResultPromises.push(fileExecutionResultPromise)
    fileExecutionResultPromise.then((fileExecutionResult) => {
      fileExecutionResultMap[key] = fileExecutionResult
      if (fileExecutionResult.status === "errored") {
        status = "errored"
        exceptionSource = fileExecutionResult.exceptionSource
      }
    })
  })
  await Promise.all(fileExecutionResultPromises)

  return {
    status,
    ...(status === "errored" ? { exceptionSource } : {}),
    startTime: navigationStartTime,
    endTime: Date.now(),
    fileExecutionResultMap,
  }
})

const executeFileUsingDynamicImport = async (
  specifier,
  identifier = specifier,
) => {
  const { currentScript } = document
  const fileExecutionResultPromise = (async () => {
    try {
      const url = new URL(specifier, document.location.href).href
      performance.mark(`jsenv_file_import_start`)
      const namespace = await import(url)
      performance.measure(`jsenv_file_import`, `jsenv_file_import_start`)
      const executionResult = {
        status: "completed",
        namespace,
        coverage: readCoverage(),
      }
      return executionResult
    } catch (e) {
      performance.measure(`jsenv_file_import`, `jsenv_file_import_start`)
      const executionResult = {
        status: "errored",
        error: e,
        coverage: readCoverage(),
      }
      onExecutionError(executionResult, { currentScript })
      return executionResult
    }
  })()
  fileExecutionMap[identifier] = fileExecutionResultPromise
  return fileExecutionResultPromise
}

const executeFileUsingSystemJs = (specifier) => {
  // si on a déja importer ce fichier ??
  // if (specifier in fileExecutionMap) {

  // }

  const { currentScript } = document

  const fileExecutionResultPromise = (async () => {
    const browserRuntime = await getBrowserRuntime()
    const executionResult = await browserRuntime.executeFile(specifier, {
      measurePerformance: true,
      collectPerformance: true,
    })
    if (executionResult.status === "errored") {
      onExecutionError(executionResult, { currentScript })
    }
    return executionResult
  })()
  fileExecutionMap[specifier] = fileExecutionResultPromise
  return fileExecutionResultPromise
}

const onExecutionError = (
  executionResult,
  {
    currentScript,
    errorExposureInConsole = true,
    errorExposureInNotification = false,
    errorExposureInDocument = true,
  },
) => {
  const error = executionResult.error
  if (error && error.code === "NETWORK_FAILURE") {
    if (currentScript) {
      const errorEvent = new Event("error")
      currentScript.dispatchEvent(errorEvent)
    }
  } else if (typeof error === "object") {
    const { parsingError } = error
    const globalErrorEvent = new Event("error")
    if (parsingError) {
      globalErrorEvent.filename = parsingError.filename
      globalErrorEvent.lineno = parsingError.lineNumber
      globalErrorEvent.message = parsingError.message
      globalErrorEvent.colno = parsingError.columnNumber
    } else {
      globalErrorEvent.filename = error.filename
      globalErrorEvent.lineno = error.lineno
      globalErrorEvent.message = error.message
      globalErrorEvent.colno = error.columnno
    }
    window.dispatchEvent(globalErrorEvent)
  }

  if (errorExposureInConsole) {
    console.error(error)
  }
  if (errorExposureInNotification) {
    displayErrorNotification(error)
  }
  if (errorExposureInDocument) {
    displayErrorInDocument(error)
  }

  executionResult.exceptionSource = unevalException(error)
  delete executionResult.error
}

const getBrowserRuntime = memoize(async () => {
  const compileServerOrigin = document.location.origin
  const compileServerResponse = await fetchUrl(
    `${compileServerOrigin}/__jsenv_compile_profile__`,
  )
  const compileServerMeta = await compileServerResponse.json()
  const { jsenvDirectoryRelativeUrl, errorStackRemapping } = compileServerMeta
  const jsenvDirectoryServerUrl = `${compileServerOrigin}/${jsenvDirectoryRelativeUrl}`
  const afterJsenvDirectory = document.location.href.slice(
    jsenvDirectoryServerUrl.length,
  )
  const parts = afterJsenvDirectory.split("/")
  const compileId = parts[0]

  const browserClient = await createBrowserClient({
    compileServerOrigin,
    jsenvDirectoryRelativeUrl,
    compileId,
  })

  if (errorStackRemapping && Error.captureStackTrace) {
    const { sourcemapMainFileRelativeUrl, sourcemapMappingFileRelativeUrl } =
      compileServerMeta
    await fetchAndEval(`${compileServerOrigin}/${sourcemapMainFileRelativeUrl}`)
    const { SourceMapConsumer } = window.sourceMap
    SourceMapConsumer.initialize({
      "lib/mappings.wasm": `${compileServerOrigin}/${sourcemapMappingFileRelativeUrl}`,
    })
    const { getErrorOriginalStackString } = installBrowserErrorStackRemapping({
      SourceMapConsumer,
    })
    const errorTransform = async (error) => {
      // code can throw something else than an error
      // in that case return it unchanged
      if (!error || !(error instanceof Error)) return error
      const originalStack = await getErrorOriginalStackString(error)
      error.stack = originalStack
      return error
    }
    const executeFile = browserClient.executeFile
    browserClient.executeFile = (file, options = {}) => {
      return executeFile(file, { errorTransform, ...options })
    }
  }
  return browserClient
})

const livereloadingCallbacks = {}

const readCoverage = () => window.__coverage__

window.__jsenv__ = {
  livereloadingCallbacks,
  executionResultPromise,
  executeFileUsingDynamicImport,
  executeFileUsingSystemJs,
}
