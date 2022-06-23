import { executeTestPlan, nodeProcess } from "@jsenv/core"

await executeTestPlan({
  rootDirectoryUrl: new URL("../", import.meta.url),
  testPlan: {
    "tests/**/*.test.mjs": {
      node: {
        runtime: nodeProcess,
      },
    },
    "tests/**/react_build.test.mjs": {
      node: {
        runtime: nodeProcess,
        allocatedMs: 90_000,
      },
    },
  },
  failFast: process.argv.includes("--workspace"),
  completedExecutionLogMerging: process.argv.includes("--workspace"),
  coverage: process.argv.includes("--coverage"),
})
