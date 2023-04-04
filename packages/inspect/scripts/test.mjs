import {
  executeTestPlan,
  chromium,
  firefox,
  webkit,
  nodeWorkerThread,
} from "@jsenv/core"

await executeTestPlan({
  rootDirectoryUrl: new URL("../", import.meta.url),
  testPlan: {
    "./src/**/*.test.js": {
      node: {
        runtime: nodeWorkerThread,
      },
    },
    "./src/**/*.test.html": {
      chromium: {
        runtime: chromium,
      },
      firefox: {
        runtime: firefox,
        allocatedMs: process.platform === "win32" ? 60_000 : 30_000,
      },
      webkit: {
        runtime: webkit,
      },
    },
  },
  webServer: {
    origin: "http://localhost:3456",
    moduleUrl: new URL("./dev.mjs", import.meta.url),
  },
  completedExecutionLogAbbreviation: true,
  failFast: process.argv.includes("--workspace"),
  completedExecutionLogMerging: process.argv.includes("--workspace"),
})
