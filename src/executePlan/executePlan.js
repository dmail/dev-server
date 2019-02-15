import { createCancellationToken, createConcurrentOperations } from "@dmail/cancellation"
import { launchAndExecute } from "../launchAndExecute/index.js"
import {
  createExecutionPlanStartLog,
  createExecutionResultLog,
  createExecutionPlanResultLog,
} from "./createExecutionLog.js"

export const executePlan = async (
  executionPlan,
  {
    cancellationToken = createCancellationToken(),
    cover = false,
    maxParallelExecution = 5,
    beforeEachExecutionCallback = () => {},
    afterEachExecutionCallback = (executionResult) => {
      console.log(createExecutionResultLog(executionResult))
    },
  } = {},
) => {
  const plannedExecutionArray = []
  Object.keys(executionPlan).forEach((filenameRelative) => {
    const fileExecutionPlan = executionPlan[filenameRelative]
    Object.keys(fileExecutionPlan).forEach((platformName) => {
      const { launch, allocatedMs } = fileExecutionPlan[platformName]
      plannedExecutionArray.push({
        launch,
        allocatedMs,
        platformName,
        filenameRelative,
      })
    })
  })

  console.log(createExecutionPlanStartLog({ executionPlan }))

  const planResult = {}
  await createConcurrentOperations({
    cancellationToken,
    maxParallelExecution,
    array: plannedExecutionArray,
    start: async ({ launch, allocatedMs, platformName, filenameRelative }) => {
      beforeEachExecutionCallback({ allocatedMs, platformName, filenameRelative })

      const result = await launchAndExecute({
        launch,
        cancellationToken,
        allocatedMs,
        measureDuration: true,
        // mirrorConsole: false because file will be executed in parallel
        // so log would be a mess to read
        mirrorConsole: false,
        // instead use captureConsole: true, we will wait for the file
        // to be executed before displaying the whole corresponding console output
        captureConsole: true,
        // stopOnError: true to ensure platform is stopped on error
        // because we know what we want: execution has failed
        // and we can use capturedConsole to know how it failed
        stopOnError: true,
        // stopOnceExecuted: true to ensure platform is stopped once executed
        // because we have what we wants: execution is completed and
        // we have associated coverageMap and capturedConsole
        stopOnceExecuted: true,
        // no need to log when disconnected
        disconnectAfterExecutedCallback: () => {},
        filenameRelative,
        collectCoverage: cover,
      })
      afterEachExecutionCallback({ allocatedMs, platformName, filenameRelative, ...result })

      if (filenameRelative in planResult === false) {
        planResult[filenameRelative] = {}
      }
      planResult[filenameRelative][platformName] = result

      // if (cover && result.value.coverageMap === null) {
      // coverageMap can be null for 2 reason:
      // - test file import a source file which is not instrumented
      // here we should throw
      // - test file import nothing so global__coverage__ is not set
      // here it's totally normal
      // throw new Error(`missing coverageMap after ${file} execution, it was not instrumented`)
      // }
    },
  })

  console.log(createExecutionPlanResultLog({ executionPlan, planResult }))

  return planResult
}
