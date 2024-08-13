import { importOneExportFromFile } from "@jsenv/dynamic-import-worker";
import { assertAndNormalizeDirectoryUrl } from "@jsenv/filesystem";
import { commentGitHubPullRequestImpact } from "@jsenv/github-pull-request-impact";
import { assertPerformanceReport } from "./internal/assertions.js";
import { createPerfImpactComment } from "./internal/comment/create_perf_impact_comment.js";
import { jsenvCommentParameters } from "./internal/comment/jsenv_comment_parameters.js";

export const reportPerformanceImpact = async ({
  logLevel,
  commandLogs,
  cancelOnSIGINT,
  rootDirectoryUrl,

  githubToken,
  repositoryOwner,
  repositoryName,
  pullRequestNumber,

  installCommand = "npm install",
  performanceReportUrl,
  isPerformanceImpactBig = jsenvCommentParameters.isPerformanceImpactBig,
  formatGroupSummary = jsenvCommentParameters.formatGroupSummary,
  formatPerformanceImpactCell = jsenvCommentParameters.formatPerformanceImpactCell,

  runLink,
  commitInGeneratedByInfo,
}) => {
  rootDirectoryUrl = assertAndNormalizeDirectoryUrl(rootDirectoryUrl);
  if (performanceReportUrl === "string") {
    performanceReportUrl = new URL(performanceReportUrl, rootDirectoryUrl).href;
  } else if (performanceReportUrl instanceof URL) {
  } else {
    throw new TypeError(
      `performanceReportUrl must be a string or an url but received ${performanceReportUrl}`,
    );
  }

  return commentGitHubPullRequestImpact({
    logLevel,
    commandLogs,
    cancelOnSIGINT,
    rootDirectoryUrl,

    githubToken,
    repositoryOwner,
    repositoryName,
    pullRequestNumber,

    collectInfo: async ({ execCommandInRootDirectory }) => {
      await execCommandInRootDirectory(installCommand);
      const performanceReport =
        await importOneExportFromFile(performanceReportUrl);
      assertPerformanceReport(performanceReport);
      return { version: 1, data: performanceReport };
    },
    commentIdentifier: `<!-- Generated by @jsenv/performance-impact -->`,
    createCommentForComparison: ({
      pullRequestBase,
      pullRequestHead,
      beforeMergeData,
      afterMergeData,
    }) => {
      return createPerfImpactComment({
        pullRequestBase,
        pullRequestHead,
        beforeMergeData,
        afterMergeData,
        isPerformanceImpactBig,
        formatGroupSummary,
        formatPerformanceImpactCell,
      });
    },
    generatedByLink: {
      url: "https://github.com/jsenv/workflow/tree/main/packages/performance-impact",
      text: "@jsenv/performance-impact",
    },
    runLink,
    commitInGeneratedByInfo,
  });
};
