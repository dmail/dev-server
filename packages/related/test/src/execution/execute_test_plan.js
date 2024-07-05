/*
 *
 */

import {
  release,
  cpus,
  availableParallelism,
  totalmem,
  freemem,
} from "node:os";
import { memoryUsage } from "node:process";
import { existsSync } from "node:fs";
import { takeCoverage } from "node:v8";
import stripAnsi from "strip-ansi";
import { Abort, raceProcessTeardownEvents } from "@jsenv/abort";
import { URL_META } from "@jsenv/url-meta";
import {
  ensureEmptyDirectory,
  assertAndNormalizeDirectoryUrl,
  collectFiles,
} from "@jsenv/filesystem";
import { createLogger, createDetailedMessage, UNICODE } from "@jsenv/humanize";
import {
  startGithubCheckRun,
  readGitHubWorkflowEnv,
} from "@jsenv/github-check-run";

import { startMeasuringTotalCpuUsage } from "../helpers/cpu_usage.js";
import { createCallOrderer } from "../helpers/call_orderer.js";
import { generateCoverage } from "../coverage/generate_coverage.js";
import { assertAndNormalizeWebServer } from "./web_server_param.js";
import { githubAnnotationFromError } from "./github_annotation_from_error.js";
import { run } from "./run.js";
import { reporterList, renderOutroContent } from "./reporters/reporter_list.js";

/**
 * Execute a list of files and log how it goes.
 * @param {Object} testPlanParameters
 * @param {string|url} testPlanParameters.rootDirectoryUrl Directory containing test files;
 * @param {Object} [testPlanParameters.webServer] Web server info; required when executing test on browsers
 * @param {Object} testPlanParameters.testPlan Object associating files with runtimes where they will be executed
 * @param {Object|false} [testPlanParameters.parallel] Maximum amount of execution running at the same time
 * @param {number} [testPlanParameters.defaultMsAllocatedPerExecution=30000] Milliseconds after which execution is aborted and considered as failed by timeout
 * @param {boolean} [testPlanParameters.failFast=false] Fails immediatly when a test execution fails
 * @param {Object|false} [testPlanParameters.coverage=false] Controls if coverage is collected during files executions
 * @return {Object} An object containing the result of all file executions
 */
const logsDefault = {
  level: "info",
  type: "list",
  animated: true,
  platformInfo: false,
  memoryUsage: false,
  cpuUsage: false,
  fileUrl: undefined,
};
const githubCheckDefault = {
  logLevel: "info",
  name: "Jsenv tests",
  title: "Tests execution",
  token: undefined,
  repositoryOwner: undefined,
  repositoryName: undefined,
  commitSha: undefined,
};
const coverageDefault = {
  include: {
    "./**/*.js": true,
    "./**/*.ts": true,
    "./**/*.jsx": true,
    "./**/*.tsx": true,
    "file:///**/node_modules/": false,
    "./**/.*": false,
    "./**/.*/": false,
    "./**/tests/": false,
    "./**/*.test.html": false,
    "./**/*.test.html@*.js": false,
    "./**/*.test.js": false,
    "./**/*.test.mjs": false,
  },
  includeMissing: true,
  coverageAndExecutionAllowed: false,
  methodForNodeJs: process.env.NODE_V8_COVERAGE
    ? "NODE_V8_COVERAGE"
    : "Profiler",
  // - When chromium only -> coverage generated by v8
  // - When chromium + node -> coverage generated by v8 are merged
  // - When firefox only -> coverage generated by babel+istanbul
  // - When chromium + firefox
  //   -> by default only coverage from chromium is used
  //   and a warning is logged according to coverageV8ConflictWarning
  //   -> to collect coverage from both browsers, pass coverageMethodForBrowsers: "istanbul"
  methodForBrowsers: undefined, // undefined | "playwright" | "istanbul"
  v8ConflictWarning: true,
  tempDirectoryUrl: undefined,
};
const parallelDefault = {
  max: "80%", // percentage resolved against the available cpus
  maxCpu: "80%",
  maxMemory: "50%",
};

export const executeTestPlan = async ({
  logs = logsDefault,

  rootDirectoryUrl,
  webServer,
  testPlan,

  signal = new AbortController().signal,
  handleSIGINT = true,
  handleSIGUP = true,
  handleSIGTERM = true,
  updateProcessExitCode = true,
  parallel = parallelDefault,
  defaultMsAllocatedPerExecution = 30_000,
  failFast = false,
  // keepRunning: false to ensure runtime is stopped once executed
  // because we have what we wants: execution is completed and
  // we have associated coverage and console output
  // passsing true means all node process and browsers launched stays opened
  // (can eventually be used for debug)
  keepRunning = false,

  githubCheck = process.env.GITHUB_WORKFLOW ? githubCheckDefault : null,
  coverage = process.argv.includes("--coverage") ? coverageDefault : null,

  reporters = [],
  ...rest
}) => {
  const teardownCallbackSet = new Set();

  const operation = Abort.startOperation();
  operation.addAbortSignal(signal);
  if (handleSIGINT || handleSIGUP || handleSIGTERM) {
    operation.addAbortSource((abort) => {
      return raceProcessTeardownEvents(
        {
          SIGINT: handleSIGINT,
          SIGHUP: handleSIGUP,
          SIGTERM: handleSIGTERM,
        },
        ({ name }) => {
          console.log(`${name} -> abort`);
          abort();
        },
      );
    });
  }

  const cpuUsage = startMeasuringTotalCpuUsage();
  operation.addEndCallback(cpuUsage.stop);
  const processCpuUsageMonitoring = startMonitoringMetric(() => {
    return cpuUsage.thisProcess.active;
  });
  const osCpuUsageMonitoring = startMonitoringMetric(() => {
    return cpuUsage.overall.active;
  });
  const processMemoryUsageMonitoring = startMonitoringMetric(() => {
    return memoryUsage().rss;
  });
  const osMemoryUsageMonitoring = startMonitoringMetric(() => {
    const total = totalmem();
    const free = freemem();
    return total - free;
  });

  const timingsOrigin = Date.now();
  const takeTiming = () => {
    return Date.now() - timingsOrigin;
  };
  const testPlanResult = {
    os: {
      name:
        process.platform === "darwin"
          ? "mac"
          : process.platform === "win32" || process.platform === "win64"
            ? "windows"
            : process.platform === "linux"
              ? "linux"
              : "other",
      version: release(),
      availableCpu: countAvailableCpus(),
      availableMemory: totalmem(),
    },
    process: {
      name: "node",
      version: process.version.slice(1),
    },
    memoryUsage: {
      os: osMemoryUsageMonitoring.info,
      process: processMemoryUsageMonitoring.info,
    },
    cpuUsage: {
      os: osCpuUsageMonitoring.info,
      process: processCpuUsageMonitoring.info,
    },
    timings: {
      origin: timingsOrigin,
      executionStart: null,
      executionEnd: null,
      teardownEnd: null,
      coverageTeardownEnd: null,
      end: null,
    },
    rootDirectoryUrl: String(rootDirectoryUrl),
    patterns: Object.keys(testPlan),
    groups: {},
    counters: {
      planified: 0,
      remaining: 0,
      waiting: 0,
      executing: 0,
      executed: 0,

      aborted: 0,
      cancelled: 0,
      timedout: 0,
      failed: 0,
      completed: 0,
    },
    aborted: false,
    failed: false,
    coverage: null,
    results: {},
  };
  const timings = testPlanResult.timings;
  const groups = testPlanResult.groups;
  const counters = testPlanResult.counters;
  const countersInOrder = { ...counters };
  const results = testPlanResult.results;

  const warnCallbackSet = new Set();
  const warn = (warning) => {
    if (warnCallbackSet.size === 0) {
      console.warn(warning.message);
    } else {
      for (const warnCallback of warnCallbackSet) {
        warnCallback(warning);
      }
    }
  };
  const beforeEachCallbackSet = new Set();
  const beforeEachInOrderCallbackSet = new Set();
  const afterEachCallbackSet = new Set();
  const afterEachInOrderCallbackSet = new Set();
  const afterAllCallbackSet = new Set();
  let finalizeCoverage;

  try {
    let logger;
    const runtimeInfo = {
      someNeedsServer: false,
      someHasCoverageV8: false,
      someNodeRuntime: false,
    };
    // param validation and normalization
    {
      const unexpectedParamNames = Object.keys(rest);
      if (unexpectedParamNames.length > 0) {
        throw new TypeError(`${unexpectedParamNames.join(",")}: no such param`);
      }
      // logs
      {
        if (typeof logs !== "object") {
          throw new TypeError(`logs must be an object, got ${logs}`);
        }
        const unexpectedLogsKeys = Object.keys(logs).filter(
          (key) => !Object.hasOwn(logsDefault, key),
        );
        if (unexpectedLogsKeys.length > 0) {
          throw new TypeError(
            `${unexpectedLogsKeys.join(",")}: no such key on logs`,
          );
        }
        logs = { ...logsDefault, ...logs };
        logger = createLogger({ logLevel: logs.level });

        if (logs.type === "list" && logger.levels.info) {
          const listReporterOptions = {
            mockFluctuatingValues: logs.mockFluctuatingValues,
            platformInfo: logs.platformInfo,
            memoryUsage: logs.memoryUsage,
            cpuUsage: logs.cpuUsage,
            animated: logger.levels.debug ? false : logs.animated,
            fileUrl:
              logs.fileUrl === undefined
                ? new URL("./.jsenv/jsenv_tests_output.txt", rootDirectoryUrl)
                : logs.fileUrl,
          };
          reporters.push(reporterList(listReporterOptions));
        }
      }
      // rootDirectoryUrl
      {
        rootDirectoryUrl = assertAndNormalizeDirectoryUrl(
          rootDirectoryUrl,
          "rootDirectoryUrl",
        );
        if (!existsSync(new URL(rootDirectoryUrl))) {
          throw new Error(`ENOENT on rootDirectoryUrl at ${rootDirectoryUrl}`);
        }
      }
      // parallel
      {
        if (parallel === true) {
          parallel = {};
        }
        if (parallel === false) {
          parallel = { max: 1 };
        }
        if (typeof parallel !== "object") {
          throw new TypeError(`parallel must be an object, got ${parallel}`);
        }
        const unexpectedParallelKeys = Object.keys(parallel).filter(
          (key) => !Object.hasOwn(parallelDefault, key),
        );
        if (unexpectedParallelKeys.length > 0) {
          throw new TypeError(
            `${unexpectedParallelKeys.join(",")}: no such key on parallel`,
          );
        }
        parallel = { ...parallelDefault, ...parallel };
        const assertPercentageAndConvertToRatio = (string) => {
          const lastChar = string[string.length - 1];
          if (lastChar !== "%") {
            throw new TypeError(`string is not a percentage, got ${string}`);
          }
          const percentageString = string.slice(0, -1);
          const percentageNumber = parseInt(percentageString);
          if (percentageNumber <= 0) {
            return 0;
          }
          if (percentageNumber >= 100) {
            return 1;
          }
          const ratio = percentageNumber / 100;
          return ratio;
        };
        const max = parallel.max;
        if (typeof max === "string") {
          const maxAsRatio = assertPercentageAndConvertToRatio(max);
          parallel.max =
            Math.round(maxAsRatio * testPlanResult.os.availableCpu) || 1;
        } else if (typeof max === "number") {
          if (max < 1) {
            parallel.max = 1;
          }
        } else {
          throw new TypeError(
            `parallel.max must be a number or a percentage, got ${max}`,
          );
        }

        const maxMemory = parallel.maxMemory;
        if (typeof maxMemory === "string") {
          const maxMemoryAsRatio = assertPercentageAndConvertToRatio(maxMemory);
          parallel.maxMemory = Math.round(
            maxMemoryAsRatio * testPlanResult.os.availableMemory,
          );
        } else if (typeof maxMemory !== "number") {
          throw new TypeError(
            `parallel.maxMemory must be a number or a percentage, got ${maxMemory}`,
          );
        }

        const maxCpu = parallel.maxCpu;
        if (typeof maxCpu === "string") {
          const maxCpuAsRatio = assertPercentageAndConvertToRatio(maxCpu);
          parallel.maxCpu = maxCpuAsRatio;
        } else if (typeof maxCpu !== "number") {
          throw new TypeError(
            `parallel.maxCpu must be a number or a percentage, got ${maxCpu}`,
          );
        }
      }
      // testPlan
      {
        if (typeof testPlan !== "object") {
          throw new Error(`testPlan must be an object, got ${testPlan}`);
        }
        for (const filePattern of Object.keys(testPlan)) {
          const filePlan = testPlan[filePattern];
          if (!filePlan) continue;
          for (const executionName of Object.keys(filePlan)) {
            const executionConfig = filePlan[executionName];
            if (executionConfig === null) {
              continue;
            }
            const { runtime } = executionConfig;
            if (!runtime || runtime.disabled) {
              continue;
            }
            if (runtime.type === "browser") {
              if (runtime.capabilities && runtime.capabilities.coverageV8) {
                runtimeInfo.someHasCoverageV8 = true;
              }
              runtimeInfo.someNeedsServer = true;
            }
            if (runtime.type === "node") {
              runtimeInfo.someNodeRuntime = true;
            }
          }
        }
        testPlan = {
          "file:///**/node_modules/": null,
          "**/*./": null,
          ...testPlan,
          "**/.jsenv/": null, // ensure it's impossible to look for ".jsenv/"
        };
      }
      // webServer
      if (runtimeInfo.someNeedsServer) {
        await assertAndNormalizeWebServer(webServer, {
          signal: operation.signal,
          teardownCallbackSet,
          logger,
        });
      }
      // githubCheck
      {
        if (githubCheck && !process.env.GITHUB_TOKEN) {
          githubCheck = false;
          const suggestions = [];
          if (process.env.GITHUB_WORKFLOW_REF) {
            const workflowFileRef = process.env.GITHUB_WORKFLOW_REF;
            const refsIndex = workflowFileRef.indexOf("@refs/");
            // see "GITHUB_WORKFLOW_REF" in https://docs.github.com/en/actions/learn-github-actions/variables#default-environment-variables
            const workflowFilePath =
              refsIndex === -1
                ? workflowFileRef
                : workflowFileRef.slice(0, refsIndex);
            suggestions.push(`Pass github token in ${workflowFilePath} during job "${process.env.GITHUB_JOB}"
\`\`\`yml
env:
  GITHUB_TOKEN: \${{ secrets.GITHUB_TOKEN }}
\`\`\``);
          }
          suggestions.push(`Disable github check with githubCheck: false`);
          logger.warn(
            `${UNICODE.WARNING} githubCheck requires process.env.GITHUB_TOKEN.
Integration with Github check API is disabled
To fix this warning:
- ${suggestions.join("\n- ")}
`,
          );
        }
        if (githubCheck) {
          if (githubCheck === true) {
            githubCheck = {};
          }
          if (typeof githubCheck !== "object") {
            throw new TypeError(
              `githubCheck must be an object, got ${githubCheck}`,
            );
          }
          const unexpectedKeys = Object.keys(githubCheck).filter(
            (key) => !Object.hasOwn(githubCheckDefault, key),
          );
          if (unexpectedKeys.length > 0) {
            throw new TypeError(
              `${unexpectedKeys.join(",")}: no such key on githubCheck`,
            );
          }

          const githubCheckInfoFromEnv = process.env.GITHUB_WORKFLOW
            ? readGitHubWorkflowEnv()
            : {};
          githubCheck = { ...githubCheckDefault, githubCheck };
          if (githubCheck.token === undefined) {
            githubCheck.token = githubCheckInfoFromEnv.githubToken;
          }
          if (githubCheck.repositoryOwner === undefined) {
            githubCheck.repositoryOwner =
              githubCheckInfoFromEnv.repositoryOwner;
          }
          if (githubCheck.repositoryName === undefined) {
            githubCheck.repositoryName = githubCheckInfoFromEnv.repositoryName;
          }
          if (githubCheck.commitSha === undefined) {
            githubCheck.commitSha = githubCheckInfoFromEnv.commitSha;
          }
        }
      }
      // coverage
      if (coverage) {
        if (coverage === true) {
          coverage = {};
        }
        if (typeof coverage !== "object") {
          throw new TypeError(`coverage must be an object, got ${coverage}`);
        }
        const unexpectedKeys = Object.keys(coverage).filter(
          (key) => !Object.hasOwn(coverageDefault, key),
        );
        if (unexpectedKeys.length > 0) {
          throw new TypeError(
            `${unexpectedKeys.join(",")}: no such key on coverage`,
          );
        }
        coverage = { ...coverageDefault, ...coverage };
        if (typeof coverage.include !== "object") {
          throw new TypeError(
            `coverage.include must be an object, got ${coverage.include}`,
          );
        }
        if (Object.keys(coverage.include).length === 0) {
          logger.warn(
            `coverage.include is an empty object. Nothing will be instrumented for coverage so your coverage will be empty`,
          );
        }
        if (coverage.methodForBrowsers === undefined) {
          coverage.methodForBrowsers = runtimeInfo.someHasCoverageV8
            ? "playwright"
            : "istanbul";
        }
        if (
          runtimeInfo.someNodeRuntime &&
          coverage.methodForNodeJs === "NODE_V8_COVERAGE"
        ) {
          if (process.env.NODE_V8_COVERAGE) {
            // when runned multiple times, we don't want to keep previous files in this directory
            await ensureEmptyDirectory(process.env.NODE_V8_COVERAGE);
          } else {
            coverage.methodForNodeJs = "Profiler";
            logger.warn(
              createDetailedMessage(
                `process.env.NODE_V8_COVERAGE is required to generate coverage for Node.js subprocesses`,
                {
                  "suggestion": `set process.env.NODE_V8_COVERAGE`,
                  "suggestion 2": `use coverage.methodForNodeJs: "Profiler". But it means coverage for child_process and worker_thread cannot be collected`,
                },
              ),
            );
          }
        }
        if (!coverage.coverageAndExecutionAllowed) {
          const associationsForExecute = URL_META.resolveAssociations(
            { execute: testPlan },
            "file:///",
          );
          const associationsForCover = URL_META.resolveAssociations(
            { cover: coverage.include },
            "file:///",
          );
          const patternsMatchingCoverAndExecute = Object.keys(
            associationsForExecute.execute,
          ).filter((testPlanPattern) => {
            const { cover } = URL_META.applyAssociations({
              url: testPlanPattern,
              associations: associationsForCover,
            });
            return cover;
          });
          if (patternsMatchingCoverAndExecute.length) {
            // It would be strange, for a given file to be both covered and executed
            throw new Error(
              createDetailedMessage(
                `some file will be both covered and executed`,
                {
                  patterns: patternsMatchingCoverAndExecute,
                },
              ),
            );
          }
        }
        if (coverage.tempDirectoryUrl === undefined) {
          coverage.tempDirectoryUrl = new URL(
            "./.coverage/tmp/",
            rootDirectoryUrl,
          );
        } else {
          coverage.tempDirectoryUrl = assertAndNormalizeDirectoryUrl(
            coverage.tempDirectoryUrl,
            "coverageTempDirectoryUrl",
          );
        }
      }
    }

    const executionPlanifiedSet = new Set();

    // collect files to execute + fill executionPlanifiedSet
    {
      const fileResultArray = await collectFiles({
        signal,
        directoryUrl: rootDirectoryUrl,
        associations: { testPlan },
        predicate: ({ testPlan }) => testPlan,
      });
      let index = 0;
      let lastExecution;
      const fileExecutionCountMap = new Map();
      for (const { relativeUrl, meta } of fileResultArray) {
        const filePlan = meta.testPlan;
        for (const groupName of Object.keys(filePlan)) {
          const stepConfig = filePlan[groupName];
          if (stepConfig === null || stepConfig === undefined) {
            continue;
          }
          if (typeof stepConfig !== "object") {
            throw new TypeError(
              createDetailedMessage(
                `found unexpected value in plan, they must be object`,
                {
                  ["file relative path"]: relativeUrl,
                  ["group"]: groupName,
                  ["value"]: stepConfig,
                },
              ),
            );
          }
          if (stepConfig.runtime?.disabled) {
            continue;
          }

          const {
            runtime,
            runtimeParams,
            allocatedMs = defaultMsAllocatedPerExecution,
          } = stepConfig;
          const params = {
            measureMemoryUsage: true,
            measurePerformance: false,
            collectPerformance: false,
            collectConsole: true,
            allocatedMs,
            runtime,
            runtimeParams: {
              rootDirectoryUrl,
              webServer,
              teardownCallbackSet,

              coverageEnabled: Boolean(coverage),
              coverageInclude: coverage?.include,
              coverageMethodForBrowsers: coverage?.methodForBrowsers,
              coverageMethodForNodeJs: coverage?.methodForNodeJs,
              isTestPlan: true,
              fileRelativeUrl: relativeUrl,
              ...runtimeParams,
            },
          };
          const runtimeType = runtime.type;
          const runtimeName = runtime.name;
          const runtimeVersion = runtime.version;

          let fileExecutionCount;
          if (fileExecutionCountMap.has(relativeUrl)) {
            fileExecutionCount = fileExecutionCountMap.get(relativeUrl) + 1;
            fileExecutionCountMap.set(relativeUrl, fileExecutionCount);
          } else {
            fileExecutionCount = 1;
            fileExecutionCountMap.set(relativeUrl, fileExecutionCount);
          }

          const execution = {
            counters,
            countersInOrder,
            index,
            isLast: false,
            group: groupName,
            rootDirectoryUrl: String(rootDirectoryUrl),
            fileRelativeUrl: relativeUrl,
            fileExecutionIndex: fileExecutionCount - 1,
            fileExecutionCount: null,
            runtimeType,
            runtimeName,
            runtimeVersion,
            params,

            // will be set by run()
            status: "planified",
            result: {},
          };
          if (typeof params.allocatedMs === "function") {
            params.allocatedMs = params.allocatedMs(execution);
          }

          lastExecution = execution;
          executionPlanifiedSet.add(execution);
          const existingResults = results[relativeUrl];
          if (existingResults) {
            existingResults[groupName] = execution.result;
          } else {
            results[relativeUrl] = {
              [groupName]: execution.result,
            };
          }
          const existingGroup = groups[groupName];
          if (existingGroup) {
            groups[groupName].count++;
          } else {
            groups[groupName] = {
              count: 1,
              runtimeType,
              runtimeName,
              runtimeVersion,
            };
          }
          index++;
        }
      }
      fileResultArray.length = 0;
      fileExecutionCountMap.clear();
      if (lastExecution) {
        lastExecution.isLast = true;
      }
    }

    counters.planified =
      counters.remaining =
      counters.waiting =
        executionPlanifiedSet.size;
    countersInOrder.planified =
      countersInOrder.remaining =
      countersInOrder.waiting =
        executionPlanifiedSet.size;
    if (githubCheck) {
      const githubCheckRun = await startGithubCheckRun({
        logLevel: githubCheck.logLevel,
        githubToken: githubCheck.token,
        repositoryOwner: githubCheck.repositoryOwner,
        repositoryName: githubCheck.repositoryName,
        commitSha: githubCheck.commitSha,
        checkName: githubCheck.name,
        checkTitle: githubCheck.title,
        checkSummary: `${executionPlanifiedSet.size} files will be executed`,
      });
      const annotations = [];
      reporters.push({
        beforeAll: (testPlanResult) => {
          return {
            afterEach: (execution) => {
              const { result } = execution;
              const { errors = [] } = result;
              for (const error of errors) {
                const annotation = githubAnnotationFromError(error, {
                  rootDirectoryUrl,
                  execution,
                });
                annotations.push(annotation);
              }
            },
            afterAll: async () => {
              const title = "Jsenv test results";
              const summaryText = stripAnsi(renderOutroContent(testPlanResult));
              if (testPlanResult.failed) {
                await githubCheckRun.fail({
                  title,
                  summary: summaryText,
                  annotations,
                });
                return;
              }
              await githubCheckRun.pass({
                title,
                summary: summaryText,
                annotations,
              });
            },
          };
        },
      });
    }
    timings.executionStart = takeTiming();
    // execute all
    {
      const failFastAbortController = new AbortController();
      if (failFast) {
        operation.addAbortSignal(failFastAbortController.signal);
      }

      if (coverage) {
        // when runned multiple times, we don't want to keep previous files in this directory
        await ensureEmptyDirectory(coverage.tempDirectoryUrl);
        finalizeCoverage = async () => {
          if (operation.signal.aborted) {
            // don't try to do the coverage stuff
            return;
          }
          try {
            if (coverage.methodForNodeJs === "NODE_V8_COVERAGE") {
              takeCoverage();
              // conceptually we don't need coverage anymore so it would be
              // good to call v8.stopCoverage()
              // but it logs a strange message about "result is not an object"
            }
            const testPlanCoverage = await generateCoverage(testPlanResult, {
              signal: operation.signal,
              logger,
              rootDirectoryUrl,
              coverage,
              warn,
            });
            testPlanResult.coverage = testPlanCoverage;
          } catch (e) {
            if (Abort.isAbortError(e)) {
              return;
            }
            throw e;
          }
        };
      }

      const callWhenPreviousExecutionAreDone = createCallOrderer();

      const executionRemainingSet = new Set(executionPlanifiedSet);
      const executionExecutingSet = new Set();
      const start = async (execution) => {
        execution.fileExecutionCount = Object.keys(
          testPlanResult.results[execution.fileRelativeUrl],
        ).length;
        mutateCountersBeforeExecutionStarts(counters, execution);
        mutateCountersBeforeExecutionStarts(countersInOrder, execution);

        execution.status = "executing";
        executionRemainingSet.delete(execution);
        executionExecutingSet.add(execution);
        for (const beforeEachCallback of beforeEachCallbackSet) {
          const returnValue = beforeEachCallback(execution, testPlanResult);
          if (typeof returnValue === "function") {
            const callback = (...args) => {
              afterEachCallbackSet.delete(callback);
              return returnValue(...args);
            };
            afterEachCallbackSet.add(callback);
          }
        }

        for (const beforeEachInOrderCallback of beforeEachInOrderCallbackSet) {
          const returnValue = beforeEachInOrderCallback(
            execution,
            testPlanResult,
          );
          if (typeof returnValue === "function") {
            const callback = (...args) => {
              afterEachInOrderCallbackSet.delete(callback);
              return returnValue(...args);
            };
            afterEachInOrderCallbackSet.add(callback);
          }
        }
        const executionResult = await run({
          ...execution.params,
          signal: operation.signal,
          logger,
          keepRunning,
          mirrorConsole: false, // might be executed in parallel: log would be a mess to read
          coverageEnabled: Boolean(coverage),
          coverageTempDirectoryUrl: coverage?.tempDirectoryUrl,
        });
        Object.assign(execution.result, executionResult);
        execution.status = "executed";
        executionExecutingSet.delete(execution);
        mutateCountersAfterExecutionEnds(counters, execution);
        if (execution.result.status !== "completed") {
          testPlanResult.failed = true;
          if (updateProcessExitCode) {
            process.exitCode = 1;
          }
        }

        for (const afterEachCallback of afterEachCallbackSet) {
          afterEachCallback(execution, testPlanResult);
        }
        callWhenPreviousExecutionAreDone(execution.index, () => {
          mutateCountersAfterExecutionEnds(countersInOrder, execution);
          for (const afterEachInOrderCallback of afterEachInOrderCallbackSet) {
            afterEachInOrderCallback(execution, testPlanResult);
          }
        });

        if (testPlanResult.failed && failFast && counters.remaining) {
          logger.info(`"failFast" enabled -> cancel remaining executions`);
          failFastAbortController.abort();
          return;
        }
      };
      const startAsMuchAsPossible = async () => {
        const promises = [];
        // eslint-disable-next-line no-constant-condition
        while (true) {
          operation.throwIfAborted();
          if (executionRemainingSet.size === 0) {
            break;
          }
          if (executionExecutingSet.size >= parallel.max) {
            break;
          }

          if (
            // starting execution in parallel is limited by
            // cpu and memory only when trying to parallelize
            // if nothing is executing these limitations don't apply
            executionExecutingSet.size > 0
          ) {
            if (processMemoryUsageMonitoring.measure() > parallel.maxMemory) {
              // retry after Xms in case memory usage decreases
              const promise = (async () => {
                await operation.wait(200);
                await startAsMuchAsPossible();
              })();
              promises.push(promise);
              break;
            }

            if (processCpuUsageMonitoring.measure() > parallel.maxCpu) {
              // retry after Xms in case cpu usage decreases
              const promise = (async () => {
                await operation.wait(200);
                await startAsMuchAsPossible();
              })();
              promises.push(promise);
              break;
            }
          }

          let execution;
          for (const executionCandidate of executionRemainingSet) {
            // TODO: this is where we'll check if it can be executed
            // according to upcoming "using" execution param
            execution = executionCandidate;
            break;
          }
          if (execution) {
            const promise = (async () => {
              await start(execution);
              await startAsMuchAsPossible();
            })();
            promises.push(promise);
          }
        }
        if (promises.length) {
          await Promise.all(promises);
          promises.length = 0;
        }
      };

      reporters = reporters.flat(Infinity);
      for (const reporter of reporters) {
        const {
          beforeAll,
          // TODO: if defined add them too
          // beforeEach,
          // afterEach,
          // beforeEachInOrder,
          // afterEachInOrder,
          // afterAll,
        } = reporter;
        if (beforeAll) {
          const returnValue = await beforeAll(testPlanResult);
          if (returnValue) {
            const {
              warn,
              beforeEach,
              beforeEachInOrder,
              afterEach,
              afterEachInOrder,
              afterAll,
            } = returnValue;
            if (warn) {
              warnCallbackSet.add(warn);
            }
            if (beforeEach) {
              beforeEachCallbackSet.add(beforeEach);
            }
            if (beforeEachInOrder) {
              beforeEachInOrderCallbackSet.add(beforeEachInOrder);
            }
            if (afterEach) {
              afterEachCallbackSet.add(afterEach);
            }
            if (afterEachInOrder) {
              afterEachInOrderCallbackSet.add(afterEachInOrder);
            }
            if (afterAll) {
              afterAllCallbackSet.add(afterAll);
            }
          }
        }
      }
      await startAsMuchAsPossible();
    }
    timings.executionEnd = takeTiming();
  } catch (e) {
    if (Abort.isAbortError(e)) {
    } else {
      throw e;
    }
  } finally {
    testPlanResult.aborted = operation.signal.aborted;
    if (testPlanResult.aborted) {
      // when execution is aborted, the remaining executions are "cancelled"
      counters.cancelled = counters.planified - counters.executed;
      counters.remaining = 0;
      countersInOrder.cancelled =
        countersInOrder.planified - countersInOrder.executed;
      countersInOrder.remaining = 0;
    }

    if (!keepRunning) {
      for (const teardownCallback of teardownCallbackSet) {
        await teardownCallback();
      }
      teardownCallbackSet.clear();
    }
    timings.teardownEnd = takeTiming();

    if (finalizeCoverage) {
      await finalizeCoverage();
    }
    timings.coverageTeardownEnd = takeTiming();
    timings.end = takeTiming();

    osMemoryUsageMonitoring.end();
    processMemoryUsageMonitoring.end();
    osCpuUsageMonitoring.end();
    processCpuUsageMonitoring.end();

    afterEachCallbackSet.clear();
    afterEachInOrderCallbackSet.clear();
    for (const afterAllCallback of afterAllCallbackSet) {
      await afterAllCallback(testPlanResult);
    }
    afterAllCallbackSet.clear();
    await operation.end();
  }

  return testPlanResult;
};

const startMonitoringMetric = (measure) => {
  const metrics = [];
  const takeMeasure = () => {
    const value = measure();
    metrics.push(value);
    return value;
  };

  const info = {
    start: takeMeasure(),
    min: null,
    max: null,
    median: null,
    end: null,
  };
  return {
    info,
    measure: takeMeasure,
    end: () => {
      info.end = takeMeasure();
      metrics.sort((a, b) => a - b);
      info.min = metrics[0];
      info.max = metrics[metrics.length - 1];
      info.median = medianFromSortedArray(metrics);
      metrics.length = 0;
    },
  };
};

const medianFromSortedArray = (array) => {
  const length = array.length;
  const isOdd = length % 2 === 1;
  if (isOdd) {
    const medianNumberIndex = (length - 1) / 2;
    const medianNumber = array[medianNumberIndex];
    return medianNumber;
  }
  const rightMiddleNumberIndex = length / 2;
  const leftMiddleNumberIndex = rightMiddleNumberIndex - 1;
  const leftMiddleNumber = array[leftMiddleNumberIndex];
  const rightMiddleNumber = array[rightMiddleNumberIndex];
  const medianNumber = (leftMiddleNumber + rightMiddleNumber) / 2;
  return medianNumber;
};

const countAvailableCpus = () => {
  if (typeof availableParallelism === "function") {
    return availableParallelism();
  }
  const cpuArray = cpus();
  return cpuArray.length || 1;
};

const mutateCountersBeforeExecutionStarts = (counters) => {
  counters.executing++;
  counters.waiting--;
};
const mutateCountersAfterExecutionEnds = (counters, execution) => {
  counters.executing--;
  counters.executed++;
  counters.remaining--;
  if (execution.result.status === "aborted") {
    counters.aborted++;
  } else if (execution.result.status === "timedout") {
    counters.timedout++;
  } else if (execution.result.status === "failed") {
    counters.failed++;
  } else if (execution.result.status === "completed") {
    counters.completed++;
  }
};
