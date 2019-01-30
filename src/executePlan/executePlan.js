import {
  createCancellationSource,
  createCancellationToken,
  cancellationTokenCompose,
  createConcurrentOperations,
} from "@dmail/cancellation"
import { launchAndExecute } from "../launchAndExecute/index.js"

export const executePlan = async (
  executionPlan,
  {
    cancellationToken = createCancellationToken(),
    cover = false,
    maxParallelExecution = 5,
    beforeEach = () => {},
    afterEach = () => {},
    cancelSIGINT = true,
  } = {},
) => {
  if (cancelSIGINT) {
    const SIGINTCancelSource = createCancellationSource()
    process.on("SIGINT", () => SIGINTCancelSource.cancel("process interruption"))
    cancellationToken = cancellationTokenCompose(cancellationToken, SIGINTCancelSource.token)
  }

  const plannedExecutionArray = []
  Object.keys(executionPlan).forEach((file) => {
    const fileExecutionPlan = executionPlan[file]
    Object.keys(fileExecutionPlan).forEach((name) => {
      // TODO: add allocatedMs { launch, allocatedMs }
      // and pass it
      const { launch } = fileExecutionPlan[name]
      plannedExecutionArray.push({
        file,
        name,
        launch,
      })
    })
  })

  const planResult = {}
  await createConcurrentOperations({
    cancellationToken,
    maxParallelExecution,
    array: plannedExecutionArray,
    start: async ({ file, name, launch }) => {
      beforeEach({ file, name })
      // TODO: if the test fails to execute it should not prevent
      // subsequent execution (or an option should control that)
      // in other words I think I have to catch
      // and wrap result into passed: true/false, value: {namespace, coverageMap}

      const result = await launchAndExecute(launch, file, {
        cancellationToken,
        collectCoverage: cover,
        stopOnceExecuted: true, // ensure platform is closed
        captureConsole: true, // does not exists yet, but will be needed
        // and will add something like result.capturedConsole
      })
      afterEach({ file, name, result })

      if (file in planResult === false) {
        planResult[file] = {}
      }
      planResult[file][name] = result

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
  return planResult
}
