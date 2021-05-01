import { startCompileServer } from "../compiling/startCompileServer.js"
import { babelPluginInstrument } from "./coverage/babel-plugin-instrument.js"
import { generateExecutionSteps } from "./generateExecutionSteps.js"
import { executeConcurrently } from "./executeConcurrently.js"

export const executePlan = async (
  plan,
  {
    cancellationToken,
    compileServerLogLevel,
    logger,
    executionLogLevel,

    projectDirectoryUrl,
    jsenvDirectoryRelativeUrl,
    jsenvDirectoryClean,
    importMapFileRelativeUrl,
    importDefaultExtension,
    importMetaEnvFileRelativeUrl,
    importMeta,

    compileServerProtocol,
    compileServerPrivateKey,
    compileServerCertificate,
    compileServerIp,
    compileServerPort,
    babelPluginMap,
    convertMap,
    compileGroupCount,

    concurrencyLimit,
    executionDefaultOptions,
    stopAfterExecute,
    completedExecutionLogMerging,
    completedExecutionLogAbbreviation,
    logSummary,
    measureGlobalDuration,

    // coverage parameters
    coverage,
    coverageConfig,
    coverageIncludeMissing,

    ...rest
  } = {},
) => {
  if (coverage) {
    babelPluginMap = {
      ...babelPluginMap,
      "transform-instrument": [babelPluginInstrument, { projectDirectoryUrl, coverageConfig }],
    }
  }

  const { origin: compileServerOrigin, outDirectoryRelativeUrl, stop } = await startCompileServer({
    cancellationToken,
    compileServerLogLevel,

    projectDirectoryUrl,
    jsenvDirectoryRelativeUrl,
    jsenvDirectoryClean,
    importMapFileRelativeUrl,
    importDefaultExtension,
    importMetaEnvFileRelativeUrl,
    importMeta,

    compileServerProtocol,
    compileServerPrivateKey,
    compileServerCertificate,
    compileServerIp,
    compileServerPort,
    keepProcessAlive: true, // to be sure it stays alive
    babelPluginMap,
    convertMap,
    compileGroupCount,
  })

  const executionSteps = await generateExecutionSteps(
    {
      ...plan,
      [outDirectoryRelativeUrl]: null,
    },
    {
      cancellationToken,
      projectDirectoryUrl,
    },
  )

  const executionResult = await executeConcurrently(executionSteps, {
    cancellationToken,
    logger,
    executionLogLevel,

    projectDirectoryUrl,
    outDirectoryRelativeUrl,
    compileServerOrigin,
    importMapFileRelativeUrl,
    importDefaultExtension,

    babelPluginMap,

    stopAfterExecute,
    concurrencyLimit,
    executionDefaultOptions,
    completedExecutionLogMerging,
    completedExecutionLogAbbreviation,
    logSummary,
    measureGlobalDuration,

    coverage,
    coverageConfig,
    coverageIncludeMissing,

    ...rest,
  })

  stop("all execution done")

  return executionResult
}
