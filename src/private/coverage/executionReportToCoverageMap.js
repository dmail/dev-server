import { coverageMapCompose } from "./coverageMapCompose.js"

export const executionReportToCoverageMap = (report) => {
  const coverageMapArray = []

  Object.keys(report).forEach((file) => {
    const executionResultForFile = report[file]
    Object.keys(executionResultForFile).forEach((executionName) => {
      const executionResultForFileOnPlatform = executionResultForFile[executionName]

      const { coverageMap } = executionResultForFileOnPlatform
      if (!coverageMap) {
        // several reasons not to have coverageMap here:
        // 1. the file we executed did not import an instrumented file.
        // - a test file without import
        // - a test file importing only file excluded from coverage
        // - a coverDescription badly configured so that we don't realize
        // a file should be covered

        // 2. the file we wanted to executed timedout
        // - infinite loop
        // - too extensive operation
        // - a badly configured or too low allocatedMs for that execution.

        // 3. the file we wanted to execute contains syntax-error

        // in any scenario we are fine because
        // coverDescription will generate empty coverage for files
        // that were suppose to be coverage but were not.
        return
      }

      coverageMapArray.push(coverageMap)
    })
  })

  const executionCoverageMap = coverageMapCompose(...coverageMapArray)

  return executionCoverageMap
}
