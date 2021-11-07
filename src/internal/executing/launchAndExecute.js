import cuid from "cuid"
import { createLogger, createDetailedMessage } from "@jsenv/logger"
import { Abort, raceCallbacks } from "@jsenv/abort"
import { resolveUrl, writeFile } from "@jsenv/filesystem"

import { composeTwoFileByFileIstanbulCoverages } from "./coverage_utils/istanbul_coverage_composition.js"

export const launchAndExecute = async ({
  signal = new AbortController().signal,
  launchAndExecuteLogLevel,

  runtime,
  runtimeParams,
  executeParams,

  allocatedMs,
  measureDuration = false,
  mirrorConsole = false,
  captureConsole = false, // rename collectConsole ?
  collectRuntimeName = false,
  collectRuntimeVersion = false,
  inheritCoverage = false,
  collectCoverage = false,
  coverageTempDirectoryUrl,
  measurePerformance,
  collectPerformance = false,

  // stopAfterExecute false by default because you want to keep browser alive
  // or nodejs process
  // however unit test will pass true because they want to move on
  stopAfterExecute = false,
  stopAfterExecuteReason = "stop after execute",
  // when launch returns { stoppedCallbackList, gracefulStop, stop }
  // the launched runtime have that amount of ms for disconnected to resolve
  // before we call stop
  gracefulStopAllocatedMs = 4000,

  runtimeConsoleCallback = () => {},
  runtimeStartedCallback = () => {},
  runtimeStoppedCallback = () => {},
  runtimeErrorAfterExecutionCallback = (error) => {
    // by default throw on error after execution
    throw error
  },
} = {}) => {
  const logger = createLogger({ logLevel: launchAndExecuteLogLevel })

  if (typeof runtime !== "object") {
    throw new TypeError(`runtime must be an object, got ${runtime}`)
  }
  if (typeof runtime.launch !== "function") {
    throw new TypeError(
      `runtime.launch must be a function, got ${runtime.launch}`,
    )
  }

  let executionResultTransformer = (executionResult) => executionResult

  const launchAndExecuteOperation = Abort.startOperation()
  launchAndExecuteOperation.addAbortSignal(signal)

  const hasAllocatedMs =
    typeof allocatedMs === "number" && allocatedMs !== Infinity
  let timeoutAbortSource

  if (hasAllocatedMs) {
    timeoutAbortSource = launchAndExecuteOperation.timeout(
      // FIXME: if allocatedMs is veryyyyyy big
      // setTimeout may be called immediatly
      // in that case we should just throw that the number is too big
      allocatedMs,
    )
  }

  if (mirrorConsole) {
    runtimeConsoleCallback = composeCallback(
      runtimeConsoleCallback,
      ({ type, text }) => {
        if (type === "error") {
          process.stderr.write(text)
        } else {
          process.stdout.write(text)
        }
      },
    )
  }

  if (captureConsole) {
    const consoleCalls = []
    runtimeConsoleCallback = composeCallback(
      runtimeConsoleCallback,
      ({ type, text }) => {
        consoleCalls.push({ type, text })
      },
    )
    executionResultTransformer = composeTransformer(
      executionResultTransformer,
      (executionResult) => {
        executionResult.consoleCalls = consoleCalls
        return executionResult
      },
    )
  }

  if (collectRuntimeName) {
    executionResultTransformer = composeTransformer(
      executionResultTransformer,
      (executionResult) => {
        executionResult.runtimeName = runtime.name
        return executionResult
      },
    )
  }

  if (collectRuntimeVersion) {
    executionResultTransformer = composeTransformer(
      executionResultTransformer,
      (executionResult) => {
        executionResult.runtimeVersion = runtime.version
        return executionResult
      },
    )
  }

  if (
    inheritCoverage &&
    // NODE_V8_COVERAGE is doing the coverage propagation for us
    !process.env.NODE_V8_COVERAGE
  ) {
    const collectCoverageSaved = collectCoverage
    collectCoverage = true
    executionResultTransformer = composeTransformer(
      executionResultTransformer,
      (executionResult) => {
        const { coverage } = executionResult
        // propagate coverage from execution to this process
        global.__coverage__ = composeTwoFileByFileIstanbulCoverages(
          global.__coverage__ || {},
          coverage || {},
        )

        if (!collectCoverageSaved) {
          delete executionResult.coverage
        }

        return executionResult
      },
    )
  }

  if (collectCoverage) {
    executionResultTransformer = composeTransformer(
      executionResultTransformer,
      async (executionResult) => {
        // we do not keep coverage in memory, it can grow very big
        // instead we store it on the filesystem, they will be read and merged together later on
        // in "executeConcurrently"
        const { coverage } = executionResult
        if (coverage) {
          const coverageFileUrl = resolveUrl(
            `./${runtime.name}/${cuid()}`,
            coverageTempDirectoryUrl,
          )
          await writeFile(coverageFileUrl, JSON.stringify(coverage, null, "  "))
          executionResult.coverageFileUrl = coverageFileUrl
          delete executionResult.coverage
        }

        // indirectCoverage is a feature making possible to collect
        // coverage generated by executing a node process which executes
        // a browser. The coverage coming the browser execution would be lost
        // if not propagated somehow.
        // This is possible if the node process collect the browser coverage
        // and write it into global.__indirectCoverage__
        // This is used by jsenv during tests execution
        const { indirectCoverage } = executionResult
        if (indirectCoverage) {
          const indirectCoverageFileUrl = resolveUrl(
            `./${runtime.name}/${cuid()}`,
            coverageTempDirectoryUrl,
          )
          await writeFile(
            indirectCoverageFileUrl,
            JSON.stringify(indirectCoverage, null, "  "),
          )
          executionResult.indirectCoverageFileUrl = indirectCoverageFileUrl
          delete executionResult.indirectCoverage
        }

        return executionResult
      },
    )
  } else {
    executionResultTransformer = composeTransformer(
      executionResultTransformer,
      (executionResult) => {
        // as collectCoverage is disabled
        // executionResult.coverage is undefined or {}
        // we delete it just to have a cleaner object
        delete executionResult.coverage
        delete executionResult.indirectCoverage
        return executionResult
      },
    )
  }

  if (measureDuration) {
    const startMs = Date.now()
    executionResultTransformer = composeTransformer(
      executionResultTransformer,
      (executionResult) => {
        const endMs = Date.now()
        executionResult.startMs = startMs
        executionResult.endMs = endMs
        return executionResult
      },
    )
  }

  try {
    const runtimeLabel = `${runtime.name}/${runtime.version}`
    logger.debug(`launch ${runtimeLabel} to execute something in it`)

    launchAndExecuteOperation.throwIfAborted()
    const launchReturnValue = await runtime.launch({
      signal: launchAndExecuteOperation.signal,
      logger,
      stopAfterExecute,
      measurePerformance,
      collectPerformance,
      ...runtimeParams,
    })
    validateLaunchReturnValue(launchReturnValue)

    const stopRuntime = async (reason) => {
      const { stop } = launchReturnValue
      logger.debug(`${runtimeLabel}: stop() because ${reason}`)
      const { graceful } = await stop({ reason, gracefulStopAllocatedMs })
      if (graceful) {
        logger.debug(`${runtimeLabel}: runtime stopped gracefully`)
      } else {
        logger.debug(`${runtimeLabel}: runtime stopped`)
      }
    }
    launchAndExecuteOperation.addAbortCallback(async () => {
      await stopRuntime("Operation aborted")
    })

    logger.debug(createDetailedMessage(`${runtimeLabel}: runtime launched`))
    runtimeStartedCallback()

    logger.debug(`${runtimeLabel}: start execution`)
    const {
      errorCallbackList,
      outputCallbackList,
      stoppedCallbackList,
      execute,
      finalizeExecutionResult = (executionResult) => executionResult,
    } = launchReturnValue
    executionResultTransformer = composeTransformer(
      executionResultTransformer,
      finalizeExecutionResult,
    )
    outputCallbackList.add(runtimeConsoleCallback)

    let executionResult = await callExecute({
      launchAndExecuteOperation,
      errorCallbackList,
      stoppedCallbackList,
      execute,
      executeParams,
    })

    if (stopAfterExecute) {
      // stopping runtime is part of the execution
      try {
        await stopRuntime(stopAfterExecuteReason)
      } catch (e) {
        executionResult = createErroredExecutionResult({
          error: e,
        })
      }
    } else {
      // when the process is still alive
      // we want to catch error to notify runtimeErrorAfterExecutionCallback
      // and throw that error by default
      errorCallbackList.add((error) => {
        runtimeErrorAfterExecutionCallback(error)
      })
      stoppedCallbackList.add(() => {
        logger.debug(`${runtimeLabel}: runtime stopped after execution`)
        runtimeStoppedCallback()
      })
    }

    if (executionResult.status === "errored") {
      // debug log level because this error happens during execution
      // there is no need to log it.
      // the code will know the execution errored because it receives
      // an errored execution result
      logger.debug(
        createDetailedMessage(`error during execution`, {
          ["error stack"]: executionResult.error.stack,
          ["execute params"]: JSON.stringify(executeParams, null, "  "),
          ["runtime"]: runtime,
        }),
      )
    } else {
      logger.debug(`${runtimeLabel}: execution ${executionResult.status}`)
    }

    return executionResultTransformer(executionResult)
  } catch (e) {
    if (Abort.isAbortError(e)) {
      // we should stop runtime too

      if (timeoutAbortSource && timeoutAbortSource.signal.aborted) {
        const executionResult = createTimedoutExecutionResult()
        return executionResultTransformer(executionResult)
      }
      const executionResult = createAbortedExecutionResult()
      return executionResultTransformer(executionResult)
    }
    throw e
  } finally {
    await launchAndExecuteOperation.end()
  }
}

const callExecute = async ({
  launchAndExecuteOperation,
  errorCallbackList,
  stoppedCallbackList,
  execute,
  executeParams,
}) => {
  const winnerPromise = new Promise((resolve, reject) => {
    raceCallbacks(
      {
        aborted: (cb) => {
          launchAndExecuteOperation.signal.addEventListener("abort", cb)
          return () => {
            launchAndExecuteOperation.signal.removeEventListener("abort", cb)
          }
        },
        error: (cb) => {
          return errorCallbackList.add(cb)
        },
        stopped: (cb) => {
          return stoppedCallbackList.add(cb)
        },
        executed: (cb) => {
          const executed = execute({
            signal: launchAndExecuteOperation.signal,
            ...executeParams,
          })
          executed.then(cb, reject)
        },
      },
      resolve,
    )
  })

  launchAndExecuteOperation.throwIfAborted()
  const winner = await winnerPromise

  if (winner.name === "aborted") {
    launchAndExecuteOperation.throwIfAborted()
  }

  if (winner.name === "error") {
    return createErroredExecutionResult({
      error: winner.data,
    })
  }

  if (winner.name === "stopped") {
    return createErroredExecutionResult({
      error: new Error(`runtime stopped during execution`),
    })
  }

  const executeResult = winner.data
  const { status } = executeResult

  if (status === "errored") {
    return createErroredExecutionResult(executeResult)
  }
  return createCompletedExecutionResult(executeResult)
}

const createAbortedExecutionResult = () => {
  return {
    status: "aborted",
  }
}

const createTimedoutExecutionResult = () => {
  return {
    status: "timedout",
  }
}

const createErroredExecutionResult = (executionResult) => {
  return {
    ...executionResult,
    status: "errored",
  }
}

const createCompletedExecutionResult = (executionResult) => {
  return {
    ...executionResult,
    status: "completed",
    namespace: normalizeNamespace(executionResult.namespace),
  }
}

const normalizeNamespace = (namespace) => {
  if (typeof namespace !== "object") return namespace
  if (namespace instanceof Promise) return namespace
  const normalized = {}
  // remove "__esModule" or Symbol.toStringTag from namespace object
  Object.keys(namespace).forEach((key) => {
    normalized[key] = namespace[key]
  })
  return normalized
}

const composeCallback = (previousCallback, callback) => {
  return (...args) => {
    previousCallback(...args)
    return callback(...args)
  }
}

const composeTransformer = (previousTransformer, transformer) => {
  return async (value) => {
    const transformedValue = await previousTransformer(value)
    return transformer(transformedValue)
  }
}

const validateLaunchReturnValue = (launchReturnValue) => {
  if (launchReturnValue === null) {
    throw new Error(`runtime.launch must return an object, got null`)
  }

  if (typeof launchReturnValue !== "object") {
    throw new Error(
      `runtime.launch must return an object, got ${launchReturnValue}`,
    )
  }

  const { execute } = launchReturnValue
  if (typeof execute !== "function") {
    throw new Error(
      `runtime.launch must return an execute function, got ${execute}`,
    )
  }

  const { stoppedCallbackList } = launchReturnValue
  if (!stoppedCallbackList) {
    throw new Error(
      `runtime.launch must return a stoppedCallbackList object, got ${stoppedCallbackList}`,
    )
  }
}
