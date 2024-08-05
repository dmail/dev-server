import { snapshotTests } from "@jsenv/snapshot";

export const snapshotAssertTests = async (
  testFileUrl,
  fnRegisteringTest,
  options,
) => {
  await snapshotTests(testFileUrl, fnRegisteringTest, {
    errorTransform: (e) => {
      e.stack = "";
    },
    ...options,
  });
};
