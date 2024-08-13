import { importOneExportFromFile } from "@jsenv/dynamic-import-worker";
import { assertAndNormalizeDirectoryUrl } from "@jsenv/filesystem";
import { commentGitHubPullRequestImpact } from "@jsenv/github-pull-request-impact";
import { formatComment } from "./internal/format_comment.js";
import { jsenvCommentParameters } from "./internal/jsenv_comment_parameters.js";

export const reportFileSizeImpactInGitHubPullRequest = async ({
  logLevel,
  commandLogs,
  cancellationToken,
  cancelOnSIGINT,
  rootDirectoryUrl,

  githubToken,
  repositoryOwner,
  repositoryName,
  pullRequestNumber,
  installCommand = "npm install",
  buildCommand = "npm run-script build",
  fileSizeReportUrl,

  // We could just to ...jsenvCommentParameters but explicitely passing params
  // helps autocompletion in vscode for dev using the function.
  filesOrdering = jsenvCommentParameters.filesOrdering,
  maxFilesPerGroup = jsenvCommentParameters.maxFilesPerGroup,
  fileRelativeUrlMaxLength = jsenvCommentParameters.fileRelativeUrlMaxLength,
  formatGroupSummary = jsenvCommentParameters.formatGroupSummary,
  formatFileRelativeUrl = jsenvCommentParameters.formatFileRelativeUrl,
  formatFileCell = jsenvCommentParameters.formatFileCell,
  formatFileSizeImpactCell = jsenvCommentParameters.formatFileSizeImpactCell,
  formatEmojiCell = jsenvCommentParameters.formatEmojiCell,
  shouldOpenGroupByDefault = jsenvCommentParameters.shouldOpenGroupByDefault,

  catchError,
  runLink,
  commitInGeneratedByInfo,
}) => {
  rootDirectoryUrl = assertAndNormalizeDirectoryUrl(rootDirectoryUrl);
  if (fileSizeReportUrl === "string") {
    fileSizeReportUrl = new URL(fileSizeReportUrl, rootDirectoryUrl).href;
  } else if (fileSizeReportUrl instanceof URL) {
  } else {
    throw new TypeError(
      `fileSizeReportUrl must be a string or an url but received ${fileSizeReportUrl}`,
    );
  }

  if (installCommand === null) {
    // a null installCommand means there is no need to install anything
  } else if (typeof installCommand !== "string") {
    throw new TypeError(
      `installCommand must be a string but received ${installCommand}`,
    );
  }

  if (buildCommand === null) {
    // a null buildCommand means there is no need to build anything
  } else if (typeof buildCommand !== "string") {
    throw new TypeError(
      `buildCommand must be a string but received ${buildCommand}`,
    );
  }

  return commentGitHubPullRequestImpact({
    logLevel,
    commandLogs,
    cancellationToken,
    cancelOnSIGINT,
    rootDirectoryUrl,

    githubToken,
    repositoryOwner,
    repositoryName,
    pullRequestNumber,

    collectInfo: async ({ execCommandInRootDirectory }) => {
      if (installCommand) await execCommandInRootDirectory(installCommand);
      if (buildCommand) await execCommandInRootDirectory(buildCommand);
      const fileSizeReport = await importOneExportFromFile(fileSizeReportUrl);
      return { version: 1, data: fileSizeReport };
    },
    commentIdentifier: `<!-- Generated by @jsenv/file-size-impact -->`,
    createCommentForComparison: ({
      pullRequestBase,
      pullRequestHead,
      beforeMergeData,
      afterMergeData,
    }) => {
      return formatComment({
        pullRequestBase,
        pullRequestHead,

        beforeMergeFileSizeReport: beforeMergeData,
        afterMergeFileSizeReport: afterMergeData,

        filesOrdering,
        maxFilesPerGroup,
        fileRelativeUrlMaxLength,
        formatGroupSummary,
        formatFileRelativeUrl,
        formatFileCell,
        formatFileSizeImpactCell,
        formatEmojiCell,
        shouldOpenGroupByDefault,
      });
    },
    generatedByLink: {
      url: "https://github.com/jsenv/workflow/tree/main/packages/file-size-impact",
      text: "@jsenv/file-size-impact",
    },
    runLink,
    commitInGeneratedByInfo,
    catchError,
  });
};
