import { snapshotTests } from "@jsenv/snapshot";

export const snapshotDevSideEffects = async (
  testFileUrl,
  fnRegisteringTests,
  options = {},
) =>
  snapshotTests(testFileUrl, fnRegisteringTests, {
    ...options,
    filesystemActions: {
      "**": "compare",
      "**/.jsenv": "ignore", // ignore the directory presence, not its content (there is no trailing slash)
      "**/.jsenv/**/@fs/**": "ignore",
      "**/.jsenv/**/*.html@*": "ignore",
      ...options.filesystemActions,
    },
  });
