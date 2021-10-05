import { startCompileServer } from "../compiling/startCompileServer.js"
import { babelPluginInstrument } from "./coverage/babel-plugin-instrument.js"
import { generateExecutionSteps } from "./generateExecutionSteps.js"
import { executeConcurrently } from "./executeConcurrently.js"

export const executePlan = async (
  plan,
  {
    logger,
    compileServerLogLevel,
    launchAndExecuteLogLevel,
    cancellationToken,

    projectDirectoryUrl,
    jsenvDirectoryRelativeUrl,
    jsenvDirectoryClean,

    importResolutionMethod,
    importDefaultExtension,

    defaultMsAllocatedPerExecution,
    concurrencyLimit,
    completedExecutionLogMerging,
    completedExecutionLogAbbreviation,
    logSummary,
    measureGlobalDuration,

    coverage,
    coverageConfig,
    coverageIncludeMissing,
    coverageForceIstanbul,
    coverageV8MergeConflictIsExpected,

    compileServerProtocol,
    compileServerPrivateKey,
    compileServerCertificate,
    compileServerIp,
    compileServerPort,
    compileServerCanReadFromFilesystem,
    compileServerCanWriteOnFilesystem,
    babelPluginMap,
    babelConfigFileUrl,
    customCompilers,
    runtimeSupport,
  } = {},
) => {
  if (coverage) {
    babelPluginMap = {
      ...babelPluginMap,
      "transform-instrument": [
        babelPluginInstrument,
        { projectDirectoryUrl, coverageConfig },
      ],
    }
  }

  const compileServer = await startCompileServer({
    cancellationToken,
    compileServerLogLevel,

    projectDirectoryUrl,
    jsenvDirectoryRelativeUrl,
    jsenvDirectoryClean,
    outDirectoryName: "out-dev",

    importResolutionMethod,
    importDefaultExtension,

    compileServerProtocol,
    compileServerPrivateKey,
    compileServerCertificate,
    compileServerIp,
    compileServerPort,
    compileServerCanReadFromFilesystem,
    compileServerCanWriteOnFilesystem,
    keepProcessAlive: true, // to be sure it stays alive
    babelPluginMap,
    babelConfigFileUrl,
    customCompilers,
    runtimeSupport,
  })

  const executionSteps = await generateExecutionSteps(
    {
      ...plan,
      [compileServer.outDirectoryRelativeUrl]: null,
    },
    {
      cancellationToken,
      projectDirectoryUrl,
    },
  )

  const result = await executeConcurrently(executionSteps, {
    logger,
    launchAndExecuteLogLevel,
    cancellationToken,

    projectDirectoryUrl,
    compileServerOrigin: compileServer.origin,
    outDirectoryRelativeUrl: compileServer.outDirectoryRelativeUrl,

    // not sure we actually have to pass import params to executeConcurrently
    importResolutionMethod,
    importDefaultExtension,

    babelPluginMap: compileServer.babelPluginMap,

    defaultMsAllocatedPerExecution,
    concurrencyLimit,
    completedExecutionLogMerging,
    completedExecutionLogAbbreviation,
    logSummary,
    measureGlobalDuration,

    coverage,
    coverageConfig,
    coverageIncludeMissing,
    coverageForceIstanbul,
    coverageV8MergeConflictIsExpected,
  })

  compileServer.stop("all execution done")

  return {
    planSummary: result.summary,
    planReport: result.report,
    planCoverage: result.coverage,
  }
}
