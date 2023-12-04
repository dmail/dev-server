import { writeFileSync } from "node:fs";
import { memoryUsage } from "node:process";

import { startJsCoverage } from "./profiler_v8_coverage.js";
import { startObservingPerformances } from "./node_execution_performance.js";

export const executeUsingDynamicImport = async ({
  rootDirectoryUrl,
  fileUrl,
  measureMemoryUsage,
  collectPerformance,
  coverageEnabled,
  coverageConfig,
  coverageMethodForNodeJs,
  coverageFileUrl,
}) => {
  const result = {
    timings: {
      start: null,
      end: null,
    },
    memoryUsage: null,
    performance: null,
    namespace: null,
  };
  const afterImportCallbackSet = new Set();

  if (measureMemoryUsage) {
    global.gc();
    const memoryUsageBeforeImport = memoryUsage().heapUsed;
    afterImportCallbackSet.add(() => {
      global.gc();
      const memoryUsageAfterImport = memoryUsage().heapUsed;
      result.memoryUsage = memoryUsageAfterImport - memoryUsageBeforeImport;
    });
  }

  if (coverageEnabled && coverageMethodForNodeJs === "Profiler") {
    const { filterV8Coverage } = await import("../coverage/v8_coverage.js");
    const { stopJsCoverage } = await startJsCoverage();
    afterImportCallbackSet.add(async () => {
      const coverage = await stopJsCoverage();
      const coverageLight = await filterV8Coverage(coverage, {
        rootDirectoryUrl,
        coverageConfig,
      });
      writeFileSync(
        new URL(coverageFileUrl),
        JSON.stringify(coverageLight, null, "  "),
      );
    });
  }
  if (collectPerformance) {
    const getPerformance = startObservingPerformances();
    afterImportCallbackSet.add(async () => {
      const performance = await getPerformance();
      result.performance = performance;
    });
  }
  result.timings.start = Date.now();
  try {
    const namespace = await import(fileUrl);
    const namespaceResolved = {};
    await Promise.all(
      Object.keys(namespace).map(async (key) => {
        const value = await namespace[key];
        namespaceResolved[key] = value;
      }),
    );
    result.namespace = namespaceResolved;
  } finally {
    result.timings.end = Date.now();
    for (const afterImportCallback of afterImportCallbackSet) {
      await afterImportCallback();
    }
    return result;
  }
};
