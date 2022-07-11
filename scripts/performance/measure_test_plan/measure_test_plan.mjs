import { startMeasures } from "@jsenv/performance-impact"

const measures = startMeasures({
  gc: true,
  memoryHeapUsage: true,
  filesystemUsage: true,
})

const { executeTestPlan, chromium, firefox, webkit, nodeWorkerThread } =
  await import("@jsenv/core")

await executeTestPlan({
  rootDirectoryUrl: new URL("./", import.meta.url),
  testPlan: {
    "./animals.test.html": {
      chromium: {
        runtime: chromium,
        captureConsole: false,
      },
      firefox: {
        runtime: firefox,
        captureConsole: false,
      },
      webkit: {
        runtime: webkit,
        captureConsole: false,
      },
    },
    "animals.test.js": {
      node: {
        runtime: nodeWorkerThread,
        captureConsole: false,
      },
    },
  },
  logLevel: "warn",
  protocol: "http",
  coverageEnabled: true,
  coverageConfig: {
    "./animals.js": true,
  },
  coverageMethodForNodeJs: "Profiler",
  coverageV8ConflictWarning: false,
  coverageReportTextLog: false,
  coverageReportHtmlDirectory: false,
})

const {
  duration,
  heapUsed,
  fileSystemReadOperationCount,
  fileSystemWriteOperationCount,
} = measures.stop()

export const testPlanMetrics = {
  "test plan duration": { value: duration, unit: "ms" },
  "test plan memory heap used": { value: heapUsed, unit: "byte" },
  "number of fs read operation": { value: fileSystemReadOperationCount },
  "number of fs write operation": {
    value: fileSystemWriteOperationCount,
  },
}
