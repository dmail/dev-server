/*
 * Export a function capable to run a file on a runtime.
 *
 * - Used internally by "executeTestPlan" part of the documented API
 * - Used internally by "execute" an advanced API not documented
 * - logs generated during file execution can be collected
 * - logs generated during file execution can be mirrored (re-logged to the console)
 * - File is given allocatedMs to complete
 * - Errors are collected
 * - File execution result is returned, it contains status/errors/namespace/consoleCalls
 */

import crypto from "node:crypto";
import { Abort, raceCallbacks } from "@jsenv/abort";
import { ensureParentDirectories } from "@jsenv/filesystem";

export const run = async ({
  signal = new AbortController().signal,
  logger,
  allocatedMs,
  keepRunning = false,
  mirrorConsole = false,
  collectConsole = false,
  measureMemoryUsage = false,
  collectPerformance = false,
  coverageEnabled = false,
  coverageTempDirectoryUrl,
  runtime,
  runtimeParams,
}) => {
  const timingOrigin = Date.now();
  const relativeToTimingOrigin = (ms) => ms - timingOrigin;

  const result = {
    status: "pending",
    errors: [],
    namespace: null,
    consoleCalls: null,
    timings: {
      origin: timingOrigin,
      start: 0,
      runtimeStart: null,
      executionStart: null,
      executionEnd: null,
      runtimeEnd: null,
      end: null,
    },
    memoryUsage: null,
    performance: null,
    coverageFileUrl: null,
  };
  const onConsoleRef = { current: () => {} };
  const stopSignal = { notify: () => {} };
  const runtimeLabel = `${runtime.name}/${runtime.version}`;

  const runOperation = Abort.startOperation();
  runOperation.addAbortSignal(signal);
  let timeoutAbortSource;
  if (
    // ideally we would rather log than the timeout is ignored
    // when keepRunning is true
    !keepRunning &&
    typeof allocatedMs === "number" &&
    allocatedMs !== Infinity
  ) {
    timeoutAbortSource = runOperation.timeout(allocatedMs);
  }
  const consoleCalls = [];
  onConsoleRef.current = ({ type, text }) => {
    if (mirrorConsole) {
      if (type === "error") {
        process.stderr.write(text);
      } else {
        process.stdout.write(text);
      }
    }
    if (collectConsole) {
      consoleCalls.push({ type, text });
    }
  };
  if (collectConsole) {
    result.consoleCalls = consoleCalls;
  }

  // we do not keep coverage in memory, it can grow very big
  // instead we store it on the filesystem
  // and they can be read later at "coverageFileUrl"
  let coverageFileUrl;
  if (coverageEnabled) {
    coverageFileUrl = new URL(
      `./${runtime.name}/${crypto.randomUUID()}.json`,
      coverageTempDirectoryUrl,
    ).href;
    await ensureParentDirectories(coverageFileUrl);
    result.coverageFileUrl = coverageFileUrl;
    // written within the child_process/worker_thread or during runtime.run()
    // for browsers
    // (because it takes time to serialize and transfer the coverage object)
  }

  try {
    logger.debug(`run() ${runtimeLabel}`);
    runOperation.throwIfAborted();
    const winnerPromise = new Promise((resolve) => {
      raceCallbacks(
        {
          aborted: (cb) => {
            runOperation.signal.addEventListener("abort", cb);
            return () => {
              runOperation.signal.removeEventListener("abort", cb);
            };
          },
          runned: async (cb) => {
            try {
              const runResult = await runtime.run({
                signal: runOperation.signal,
                logger,
                ...runtimeParams,
                collectConsole,
                measureMemoryUsage,
                collectPerformance,
                coverageFileUrl,
                keepRunning,
                stopSignal,
                onConsole: (log) => onConsoleRef.current(log),
                onRuntimeStarted: () => {
                  result.timings.runtimeStart = relativeToTimingOrigin(
                    Date.now(),
                  );
                },
                onRuntimeStopped: () => {
                  result.timings.runtimeEnd = relativeToTimingOrigin(
                    Date.now(),
                  );
                },
              });
              cb(runResult);
            } catch (e) {
              cb({
                status: "failed",
                errors: [e],
              });
            }
          },
        },
        resolve,
      );
    });
    const winner = await winnerPromise;
    if (winner.name === "aborted") {
      runOperation.throwIfAborted();
    }
    const {
      status,
      namespace,
      errors,
      timings = {},
      memoryUsage,
      performance,
    } = winner.data;
    result.status = status;
    result.errors.push(...errors);
    result.namespace = namespace;
    if (timings) {
      if (timings.start) {
        result.timings.executionStart = relativeToTimingOrigin(timings.start);
      }
      if (timings.end) {
        result.timings.executionEnd = relativeToTimingOrigin(timings.end);
      }
    }
    result.memoryUsage = memoryUsage;
    result.performance = performance;
  } catch (e) {
    if (Abort.isAbortError(e)) {
      if (timeoutAbortSource && timeoutAbortSource.signal.aborted) {
        result.status = "timedout";
      } else {
        result.status = "aborted";
      }
    } else {
      result.status = "failed";
      result.errors.push(e);
    }
  } finally {
    await runOperation.end();
    result.timings.end = relativeToTimingOrigin(Date.now());
    return result;
  }
};
