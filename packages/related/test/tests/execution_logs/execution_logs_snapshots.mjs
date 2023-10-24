import stripAnsi from "strip-ansi";

import { writeSnapshotsIntoDirectory } from "@jsenv/core/tests/snapshots_directory.js";
import { createExecutionLog } from "@jsenv/test/src/execution/logs_file_execution.js";

const snapshotsDirectoryUrl = new URL("./snapshots/", import.meta.url);

const test = (data, options) =>
  stripAnsi(
    createExecutionLog(data, {
      logRuntime: true,
      logEachDuration: true,
      ...options,
    }),
  );

const snapshots = {
  "1_over_2_executing.txt": test(
    {
      executionIndex: 0,
      fileRelativeUrl: "file.js",
      runtimeName: "chrome",
      runtimeVersion: "10.0.0",
      executionResult: {
        status: "executing",
      },
      startMs: 1000,
      nowMs: 2000,
    },
    {
      counters: {
        total: 2,
        aborted: 0,
        timedout: 0,
        failed: 0,
        completed: 0,
        done: 0,
      },
    },
  ),
  "1_over_2_aborted.txt": test(
    {
      executionIndex: 0,
      fileRelativeUrl: "file.js",
      runtimeName: "chrome",
      runtimeVersion: "10.0.0",
      executionResult: {
        status: "aborted",
      },
      startMs: 10,
      endMs: 20,
    },
    {
      counters: {
        total: 2,
        aborted: 1,
        timedout: 0,
        failed: 0,
        completed: 0,
        done: 0,
      },
    },
  ),
  "1_over_2_timeout.txt": test(
    {
      executionIndex: 0,
      fileRelativeUrl: "file.js",
      runtimeName: "chrome",
      runtimeVersion: "10.0.0",
      executionResult: { status: "timedout" },
      executionParams: { allocatedMs: 100 },
      startMs: 10,
      endMs: 20,
    },
    {
      counters: {
        total: 2,
        aborted: 0,
        timedout: 1,
        failed: 0,
        completed: 0,
        done: 0,
      },
    },
  ),
  "1_over_2_failed.txt": test(
    {
      executionIndex: 0,
      fileRelativeUrl: "file.js",
      runtimeName: "chrome",
      runtimeVersion: "10.0.0",
      executionResult: {
        status: "failed",
        errors: [
          {
            stack: `AssertionError: unequal values
--- found ---
false
--- expected ---
true
--- path ---
actual.foo
  at node_modules/@jsenv/assert/src/main.js:10:3`,
          },
        ],
      },
      startMs: 10,
      endMs: 20,
    },
    {
      counters: {
        total: 2,
        aborted: 0,
        timedout: 0,
        failed: 1,
        completed: 0,
        done: 0,
      },
    },
  ),
  "1_over_2_completed.txt": test(
    {
      executionIndex: 0,
      fileRelativeUrl: "file.js",
      runtimeName: "chrome",
      runtimeVersion: "10.0.0",
      executionResult: { status: "completed" },
      startMs: 10,
      endMs: 20,
    },
    {
      counters: {
        total: 2,
        aborted: 0,
        timedout: 0,
        failed: 0,
        completed: 1,
        done: 0,
      },
    },
  ),
};
writeSnapshotsIntoDirectory(snapshotsDirectoryUrl, snapshots);