import { existsSync } from "node:fs";
import stripAnsi from "strip-ansi";
import { Abort, raceProcessTeardownEvents } from "@jsenv/abort";
import { URL_META } from "@jsenv/url-meta";
import { urlToFileSystemPath, urlToRelativeUrl } from "@jsenv/urls";
import {
  ensureEmptyDirectory,
  assertAndNormalizeDirectoryUrl,
  assertAndNormalizeFileUrl,
} from "@jsenv/filesystem";
import { createLogger, createDetailedMessage, UNICODE } from "@jsenv/log";
import {
  startGithubCheckRun,
  readGitHubWorkflowEnv,
} from "@jsenv/github-check-run";

import { createTeardown } from "../helpers/teardown.js";
import { generateCoverageJsonFile } from "../coverage/coverage_reporter_json_file.js";
import { generateCoverageHtmlDirectory } from "../coverage/coverage_reporter_html_directory.js";
import { generateCoverageTextLog } from "../coverage/coverage_reporter_text_log.js";
import { assertAndNormalizeWebServer } from "./web_server_param.js";
import { executionStepsFromTestPlan } from "./execution_steps.js";
import { executeSteps } from "./execute_steps.js";
import { formatExecutionLabel, formatSummary } from "./logs_file_execution.js";
import { githubAnnotationFromError } from "./github_annotation_from_error.js";

/**
 * Execute a list of files and log how it goes.
 * @param {Object} testPlanParameters
 * @param {string|url} testPlanParameters.rootDirectoryUrl Directory containing test files;
 * @param {Object} [testPlanParameters.webServer] Web server info; required when executing test on browsers
 * @param {Object} testPlanParameters.testPlan Object associating files with runtimes where they will be executed
 * @param {boolean} [testPlanParameters.logShortForCompletedExecutions=false] Abbreviate completed execution information to shorten terminal output
 * @param {boolean} [testPlanParameters.logMergeForCompletedExecutions=false] Merge completed execution logs to shorten terminal output
 * @param {number} [testPlanParameters.maxExecutionsInParallel=1] Maximum amount of execution in parallel
 * @param {number} [testPlanParameters.defaultMsAllocatedPerExecution=30000] Milliseconds after which execution is aborted and considered as failed by timeout
 * @param {boolean} [testPlanParameters.failFast=false] Fails immediatly when a test execution fails
 * @param {number} [testPlanParameters.cooldownBetweenExecutions=0] Millisecond to wait between each execution
 * @param {boolean} [testPlanParameters.logMemoryHeapUsage=false] Add memory heap usage during logs
 * @param {boolean} [testPlanParameters.coverageEnabled=false] Controls if coverage is collected during files executions
 * @param {boolean} [testPlanParameters.coverageV8ConflictWarning=true] Warn when coverage from 2 executions cannot be merged
 * @return {Object} An object containing the result of all file executions
 */
export const executeTestPlan = async ({
  signal = new AbortController().signal,
  handleSIGINT = true,
  logLevel = "info",
  logRefresh = true,
  logRuntime = true,
  logEachDuration = true,
  logSummary = true,
  logTimeUsage = false,
  logMemoryHeapUsage = false,
  logFileRelativeUrl = ".jsenv/test_plan_debug.txt",
  logShortForCompletedExecutions = false,
  logMergeForCompletedExecutions = false,

  rootDirectoryUrl,
  webServer,
  testPlan,
  updateProcessExitCode = true,
  maxExecutionsInParallel = 1,
  defaultMsAllocatedPerExecution = 30_000,
  failFast = false,
  // keepRunning: false to ensure runtime is stopped once executed
  // because we have what we wants: execution is completed and
  // we have associated coverage and console output
  // passsing true means all node process and browsers launched stays opened
  // (can eventually be used for debug)
  keepRunning = false,
  cooldownBetweenExecutions = 0,
  gcBetweenExecutions = logMemoryHeapUsage,

  githubCheckEnabled = Boolean(process.env.GITHUB_WORKFLOW),
  githubCheckLogLevel,
  githubCheckName = "Jsenv tests",
  githubCheckTitle,
  githubCheckToken,
  githubCheckRepositoryOwner,
  githubCheckRepositoryName,
  githubCheckCommitSha,

  coverageEnabled = process.argv.includes("--coverage"),
  coverageConfig = {
    "file:///**/node_modules/": false,
    "./**/.*": false,
    "./**/.*/": false,
    "./**/src/**/*.js": true,
    "./**/src/**/*.ts": true,
    "./**/src/**/*.jsx": true,
    "./**/src/**/*.tsx": true,
    "./**/tests/": false,
    "./**/*.test.html": false,
    "./**/*.test.html@*.js": false,
    "./**/*.test.js": false,
    "./**/*.test.mjs": false,
  },
  coverageIncludeMissing = true,
  coverageAndExecutionAllowed = false,
  coverageMethodForNodeJs = process.env.NODE_V8_COVERAGE
    ? "NODE_V8_COVERAGE"
    : "Profiler",
  // - When chromium only -> coverage generated by v8
  // - When chromium + node -> coverage generated by v8 are merged
  // - When firefox only -> coverage generated by babel+istanbul
  // - When chromium + firefox
  //   -> by default only coverage from chromium is used
  //   and a warning is logged according to coverageV8ConflictWarning
  //   -> to collect coverage from both browsers, pass coverageMethodForBrowsers: "istanbul"
  coverageMethodForBrowsers, // undefined | "playwright" | "istanbul"
  coverageV8ConflictWarning = true,
  coverageTempDirectoryUrl,
  // skip empty means empty files won't appear in the coverage reports (json and html)
  coverageReportSkipEmpty = false,
  // skip full means file with 100% coverage won't appear in coverage reports (json and html)
  coverageReportSkipFull = false,
  coverageReportTextLog = true,
  coverageReportJson = process.env.CI,
  coverageReportJsonFileUrl,
  coverageReportHtml = !process.env.CI,
  coverageReportHtmlDirectoryUrl,
  ...rest
}) => {
  const teardown = createTeardown();

  const operation = Abort.startOperation();
  operation.addAbortSignal(signal);
  if (handleSIGINT) {
    operation.addAbortSource((abort) => {
      return raceProcessTeardownEvents(
        {
          SIGINT: true,
        },
        () => {
          logger.debug(`SIGINT abort`);
          abort();
        },
      );
    });
  }

  let logger;
  let someNeedsServer = false;
  let someHasCoverageV8 = false;
  let someNodeRuntime = false;
  const runtimes = {};
  // param validation
  {
    const unexpectedParamNames = Object.keys(rest);
    if (unexpectedParamNames.length > 0) {
      throw new TypeError(
        `${unexpectedParamNames.join(",")}: there is no such param`,
      );
    }
    rootDirectoryUrl = assertAndNormalizeDirectoryUrl(
      rootDirectoryUrl,
      "rootDirectoryUrl",
    );
    if (!existsSync(new URL(rootDirectoryUrl))) {
      throw new Error(`ENOENT on rootDirectoryUrl at ${rootDirectoryUrl}`);
    }
    if (typeof testPlan !== "object") {
      throw new Error(`testPlan must be an object, got ${testPlan}`);
    }

    logger = createLogger({ logLevel });

    Object.keys(testPlan).forEach((filePattern) => {
      const filePlan = testPlan[filePattern];
      if (!filePlan) return;
      Object.keys(filePlan).forEach((executionName) => {
        const executionConfig = filePlan[executionName];
        const { runtime } = executionConfig;
        if (runtime) {
          runtimes[runtime.name] = runtime.version;
          if (runtime.type === "browser") {
            if (runtime.capabilities && runtime.capabilities.coverageV8) {
              someHasCoverageV8 = true;
            }
            someNeedsServer = true;
          }
          if (runtime.type === "node") {
            someNodeRuntime = true;
          }
        }
      });
    });

    if (someNeedsServer) {
      await assertAndNormalizeWebServer(webServer, {
        signal: operation.signal,
        teardown,
        logger,
      });
    }

    if (githubCheckEnabled && !process.env.GITHUB_TOKEN) {
      githubCheckEnabled = false;
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
      suggestions.push(`Disable github check with githubCheckEnabled: false`);
      logger.warn(
        `${
          UNICODE.WARNING
        } githubCheckEnabled but process.env.GITHUB_TOKEN is missing.
Integration with Github check API is disabled
To fix this warning:
- ${suggestions.join("\n- ")}
`,
      );
    }
    if (githubCheckEnabled) {
      const githubCheckInfoFromEnv = process.env.GITHUB_WORKFLOW
        ? readGitHubWorkflowEnv()
        : {};
      githubCheckToken = githubCheckToken || githubCheckInfoFromEnv.githubToken;
      githubCheckRepositoryOwner =
        githubCheckRepositoryOwner || githubCheckInfoFromEnv.repositoryOwner;
      githubCheckRepositoryName =
        githubCheckRepositoryName || githubCheckInfoFromEnv.repositoryName;
      githubCheckCommitSha =
        githubCheckCommitSha || githubCheckInfoFromEnv.commitSha;
    }

    if (coverageEnabled) {
      if (coverageMethodForBrowsers === undefined) {
        coverageMethodForBrowsers = someHasCoverageV8
          ? "playwright"
          : "istanbul";
      }
      if (typeof coverageConfig !== "object") {
        throw new TypeError(
          `coverageConfig must be an object, got ${coverageConfig}`,
        );
      }
      if (!coverageAndExecutionAllowed) {
        const associationsForExecute = URL_META.resolveAssociations(
          { execute: testPlan },
          "file:///",
        );
        const associationsForCover = URL_META.resolveAssociations(
          { cover: coverageConfig },
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

      if (coverageTempDirectoryUrl === undefined) {
        coverageTempDirectoryUrl = new URL(
          "./.coverage/tmp/",
          rootDirectoryUrl,
        );
      } else {
        coverageTempDirectoryUrl = assertAndNormalizeDirectoryUrl(
          coverageTempDirectoryUrl,
          "coverageTempDirectoryUrl",
        );
      }
      if (coverageReportJson) {
        if (coverageReportJsonFileUrl === undefined) {
          coverageReportJsonFileUrl = new URL(
            "./.coverage/coverage.json",
            rootDirectoryUrl,
          );
        } else {
          coverageReportJsonFileUrl = assertAndNormalizeFileUrl(
            coverageReportJsonFileUrl,
            "coverageReportJsonFileUrl",
          );
        }
      }
      if (coverageReportHtml) {
        if (coverageReportHtmlDirectoryUrl === undefined) {
          coverageReportHtmlDirectoryUrl = new URL(
            "./.coverage/",
            rootDirectoryUrl,
          );
        } else {
          coverageReportHtmlDirectoryUrl = assertAndNormalizeDirectoryUrl(
            coverageReportHtmlDirectoryUrl,
            "coverageReportHtmlDirectoryUrl",
          );
        }
      }
    }
  }

  logger.debug(
    createDetailedMessage(`Prepare executing plan`, {
      runtimes: JSON.stringify(runtimes, null, "  "),
    }),
  );

  // param normalization
  {
    if (coverageEnabled) {
      if (Object.keys(coverageConfig).length === 0) {
        logger.warn(
          `coverageConfig is an empty object. Nothing will be instrumented for coverage so your coverage will be empty`,
        );
      }
      if (
        someNodeRuntime &&
        coverageEnabled &&
        coverageMethodForNodeJs === "NODE_V8_COVERAGE"
      ) {
        if (process.env.NODE_V8_COVERAGE) {
          // when runned multiple times, we don't want to keep previous files in this directory
          await ensureEmptyDirectory(process.env.NODE_V8_COVERAGE);
        } else {
          coverageMethodForNodeJs = "Profiler";
          logger.warn(
            createDetailedMessage(
              `process.env.NODE_V8_COVERAGE is required to generate coverage for Node.js subprocesses`,
              {
                "suggestion": `set process.env.NODE_V8_COVERAGE`,
                "suggestion 2": `use coverageMethodForNodeJs: "Profiler". But it means coverage for child_process and worker_thread cannot be collected`,
              },
            ),
          );
        }
      }
    }
  }

  testPlan = {
    "file:///**/node_modules/": null,
    "**/*./": null,
    ...testPlan,
    "**/.jsenv/": null,
  };
  logger.debug(`Generate executions`);
  const executionSteps = await executionStepsFromTestPlan({
    signal,
    testPlan,
    rootDirectoryUrl,
  });
  logger.debug(`${executionSteps.length} executions planned`);
  let beforeExecutionCallback;
  let afterExecutionCallback;
  let afterAllExecutionCallback = () => {};
  if (githubCheckEnabled) {
    const githubCheckRun = await startGithubCheckRun({
      logLevel: githubCheckLogLevel,
      githubToken: githubCheckToken,
      repositoryOwner: githubCheckRepositoryOwner,
      repositoryName: githubCheckRepositoryName,
      commitSha: githubCheckCommitSha,
      checkName: githubCheckName,
      checkTitle: `Tests executions`,
      checkSummary: `${executionSteps.length} files will be executed`,
    });
    afterExecutionCallback = (afterExecutionInfo) => {
      const summary = stripAnsi(
        formatExecutionLabel(afterExecutionInfo, {
          logTimeUsage,
          logMemoryHeapUsage,
        }),
      );
      const annotations = [];
      const { executionResult } = afterExecutionInfo;
      const { errors = [] } = executionResult;
      for (const error of errors) {
        const annotation = githubAnnotationFromError(error, {
          rootDirectoryUrl,
          executionInfo: afterExecutionInfo,
        });
        annotations.push(annotation);
      }
      githubCheckRun.progress({
        title: "Jsenv test executions",
        summary,
        annotations,
      });
    };
    afterAllExecutionCallback = async ({ testPlanSummary }) => {
      const title = "Jsenv test results";
      const summary = stripAnsi(formatSummary(testPlanSummary));
      if (
        testPlanSummary.counters.total !== testPlanSummary.counters.completed
      ) {
        await githubCheckRun.fail({
          title,
          summary,
        });
        return;
      }
      await githubCheckRun.pass({
        title,
        summary,
      });
    };
  }

  const result = await executeSteps(executionSteps, {
    signal,
    teardown,
    logger,
    logRefresh,
    logSummary,
    logRuntime,
    logEachDuration,
    logTimeUsage,
    logMemoryHeapUsage,
    logFileRelativeUrl,
    logShortForCompletedExecutions,
    logMergeForCompletedExecutions,
    rootDirectoryUrl,
    webServer,

    maxExecutionsInParallel,
    defaultMsAllocatedPerExecution,
    failFast,
    keepRunning,
    cooldownBetweenExecutions,
    gcBetweenExecutions,

    githubCheckEnabled,
    githubCheckName,
    githubCheckTitle,
    githubCheckToken,
    githubCheckRepositoryOwner,
    githubCheckRepositoryName,
    githubCheckCommitSha,

    coverageEnabled,
    coverageConfig,
    coverageIncludeMissing,
    coverageMethodForBrowsers,
    coverageMethodForNodeJs,
    coverageV8ConflictWarning,
    coverageTempDirectoryUrl,

    beforeExecutionCallback,
    afterExecutionCallback,
  });

  const hasFailed =
    result.planSummary.counters.total !== result.planSummary.counters.completed;
  if (updateProcessExitCode && hasFailed) {
    process.exitCode = 1;
  }
  const planCoverage = result.planCoverage;
  // planCoverage can be null when execution is aborted
  if (planCoverage) {
    const promises = [];
    // keep this one first because it does ensureEmptyDirectory
    // and in case coverage json file gets written in the same directory
    // it must be done before
    if (coverageEnabled && coverageReportHtml) {
      await ensureEmptyDirectory(coverageReportHtmlDirectoryUrl);
      const htmlCoverageDirectoryIndexFileUrl = `${coverageReportHtmlDirectoryUrl}index.html`;
      logger.info(
        `-> ${urlToFileSystemPath(htmlCoverageDirectoryIndexFileUrl)}`,
      );
      promises.push(
        generateCoverageHtmlDirectory(planCoverage, {
          rootDirectoryUrl,
          coverageHtmlDirectoryRelativeUrl: urlToRelativeUrl(
            coverageReportHtmlDirectoryUrl,
            rootDirectoryUrl,
          ),
          coverageReportSkipEmpty,
          coverageReportSkipFull,
        }),
      );
    }
    if (coverageEnabled && coverageReportJson) {
      promises.push(
        generateCoverageJsonFile({
          coverage: result.planCoverage,
          coverageJsonFileUrl: coverageReportJsonFileUrl,
          logger,
        }),
      );
    }
    if (coverageEnabled && coverageReportTextLog) {
      promises.push(
        generateCoverageTextLog(result.planCoverage, {
          coverageReportSkipEmpty,
          coverageReportSkipFull,
        }),
      );
    }
    await Promise.all(promises);
  }

  const returnValue = {
    testPlanAborted: result.aborted,
    testPlanSummary: result.planSummary,
    testPlanReport: result.planReport,
    testPlanCoverage: planCoverage,
  };
  await afterAllExecutionCallback(returnValue);
  return returnValue;
};
