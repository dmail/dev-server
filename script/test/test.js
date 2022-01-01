import { executeTestPlan, nodeRuntime } from "@jsenv/core"

import { projectDirectoryUrl, runtimeSupport } from "../../jsenv.config.mjs"

await executeTestPlan({
  projectDirectoryUrl,
  runtimeSupport,
  logLevel: "debug",
  testPlan: {
    "test/**/entry_html/**/*.test.js": {
      node: {
        runtime: nodeRuntime,
        allocatedMs: 30 * 1000,
      },
    },
    // give more time to some tests
    // "test/coverage/**/*.test.js": {
    //   node: {
    //     runtime: nodeRuntime,
    //     allocatedMs: 60 * 1000,
    //   },
    // },
    // "test/dev_server/**/*.test.js": {
    //   node: {
    //     runtime: nodeRuntime,
    //     allocatedMs: 60 * 1000,
    //   },
    // },
    // "test/execute/**/*.test.js": {
    //   node: {
    //     runtime: nodeRuntime,
    //     allocatedMs: 60 * 1000,
    //   },
    // },
    // "test/test_plan/**/*.test.js": {
    //   node: {
    //     runtime: nodeRuntime,
    //     allocatedMs: 60 * 1000,
    //   },
    // },
  },
  logMemoryHeapUsage: true,
  // completedExecutionLogMerging: true,
  // completedExecutionLogAbbreviation: false,
  coverage: process.argv.includes("--coverage"),
  coverageConfig: {
    "./index.js": true,
    "./src/**/*.js": true,
    "./**/*.test.*": false,
    "./**/test/": false,
  },
})
