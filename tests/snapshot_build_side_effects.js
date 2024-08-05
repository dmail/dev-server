import { snapshotTests } from "@jsenv/snapshot";

export const snapshotBuildTests = async (
  testFileUrl,
  fnRegisteringTests,
  options = {},
) =>
  snapshotTests(testFileUrl, fnRegisteringTests, {
    ...options,
    filesystemActions: {
      "**": "compare",
      "**/.jsenv/": "undo",
      ...options.filesystemActions,
    },
    logEffects:
      options.logEffects === false
        ? false
        : {
            level: "warn",
            ...(options.logEffects === true ? {} : options.logEffects),
          },
  });
