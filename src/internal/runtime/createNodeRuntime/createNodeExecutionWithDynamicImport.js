import { uneval } from "@jsenv/uneval"
import { resolveUrl } from "@jsenv/util"

import { measureAsyncFnPerf } from "@jsenv/core/src/internal/perf_node.js"

export const createNodeExecutionWithDynamicImport = ({ projectDirectoryUrl }) => {
  const executeFile = async (specifier, { measurePerf, errorExposureInConsole = false } = {}) => {
    // we can't dynamically import from compileServerOrigin I guess
    // we have to use the filesystem
    const fileUrl = resolveUrl(specifier, projectDirectoryUrl)

    const importWithDynamicImport = async () => {
      try {
        const status = "completed"
        const importPromise = import(fileUrl)
        const namespace = await makePromiseKeepNodeProcessAlive(importPromise)

        return {
          status,
          namespace,
        }
      } catch (error) {
        if (errorExposureInConsole) console.error(error)
        const status = "errored"
        const exceptionSource = unevalException(error)
        return {
          status,
          exceptionSource,
        }
      }
    }

    if (measurePerf) {
      return measureAsyncFnPerf(importWithDynamicImport, "jsenv:file import")
    }
    return importWithDynamicImport()
  }

  return {
    executeFile,
  }
}

const makePromiseKeepNodeProcessAlive = async (promise) => {
  const timerId = setInterval(() => {}, 1000)

  try {
    const value = await promise
    return value
  } finally {
    clearInterval(timerId)
  }
}

const unevalException = (value) => {
  if (value.hasOwnProperty("toString")) {
    delete value.toString
  }
  return uneval(value)
}
