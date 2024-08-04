import { assert } from "@jsenv/assert";

import { startDevServer } from "@jsenv/core";
import { executeInBrowser } from "@jsenv/core/tests/execute_in_browser.js";

const test = async (params) => {
  const sourceDirectoryUrl = new URL("./client/", import.meta.url);
  const devServer = await startDevServer({
    logLevel: "warn",
    sourceDirectoryUrl,
    keepProcessAlive: false,
    clientAutoreload: {
      clientServerEventsConfig: {
        logs: false,
      },
    },
    port: 0,
    ...params,
  });
  const { returnValue, pageErrors, consoleOutput } = await executeInBrowser(
    `${devServer.origin}/main.html`,
    {
      /* eslint-disable no-undef */
      pageFunction: () => window.__supervisor__.getDocumentExecutionResult(),
      /* eslint-enable no-undef */
      collectConsole: true,
      collectErrors: true,
    },
  );
  const errorStack = returnValue.executionResults["/main.js"].exception.stack;
  const actual = {
    errorStack,
    pageErrors,
    consoleOutputRaw: consoleOutput.raw,
  };
  const expect = {
    errorStack: `Error: SPECIAL_STRING_UNLIKELY_TO_COLLIDE
  at triggerError (${sourceDirectoryUrl}trigger_error.js:2:9)
  at ${sourceDirectoryUrl}main.js:3:1`,
    pageErrors: [assert.any(Error)],
    consoleOutputRaw: "",
  };
  assert({ actual, expect });
};

await test();
