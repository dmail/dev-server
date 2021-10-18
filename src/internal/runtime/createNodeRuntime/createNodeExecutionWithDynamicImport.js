import { resolveUrl } from "@jsenv/filesystem"

import { unevalException } from "@jsenv/core/src/internal/unevalException.js"
import { measureAsyncFnPerf } from "@jsenv/core/src/internal/perf_node.js"

export const createNodeExecutionWithDynamicImport = ({
  projectDirectoryUrl,
}) => {
  const executeFile = async (
    specifier,
    { measurePerformance, errorExposureInConsole = false } = {},
  ) => {
    // we can't dynamically import from compileServerOrigin I guess
    // we have to use the filesystem
    const fileUrl = resolveUrl(specifier, projectDirectoryUrl)

    const importWithDynamicImport = async () => {
      try {
        const status = "completed"
        const namespace = await import(fileUrl)

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

    if (measurePerformance) {
      return measureAsyncFnPerf(importWithDynamicImport, "jsenv_file_import")
    }
    return importWithDynamicImport()
  }

  return {
    executeFile,
  }
}
