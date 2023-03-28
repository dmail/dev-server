import { executeTestPlan, nodeChildProcess } from "@jsenv/core"

await executeTestPlan({
  logLevel: "info",
  rootDirectoryUrl: new URL("./", import.meta.url),
  testPlan: {
    "*.spec.js": {
      node: {
        runtime: nodeChildProcess,
        captureConsole: true,
      },
    },
  },
  completedExecutionLogAbbreviation: true,
  completedExecutionLogMerging: true,
  defaultMsAllocatedPerExecution: 3000,
})
