import { assert } from "@jsenv/assert";
import { startDevServer } from "@jsenv/core";

import { execute, chromium, firefox, webkit } from "@jsenv/test";

const test = async (params) => {
  const devServer = await startDevServer({
    logLevel: "warn",
    sourceDirectoryUrl: new URL("./client/", import.meta.url),
    keepProcessAlive: false,
    port: 0,
  });
  const { status, errors, consoleCalls } = await execute({
    // logLevel: "debug"
    rootDirectoryUrl: new URL("./client/", import.meta.url),
    webServer: {
      origin: devServer.origin,
      rootDirectoryUrl: new URL("./client/", import.meta.url),
    },
    fileRelativeUrl: `./main.html`,
    // keepRunning: true,
    mirrorConsole: false,
    collectConsole: true,
    ignoreError: true,
    ...params,
  });
  devServer.stop();

  const error = errors[0];
  const actual = {
    status,
    errorMessage: error.message,
    consoleCalls,
  };
  const expected = {
    status: "failed",
    errorMessage: "SPECIAL_STRING_UNLIKELY_TO_COLLIDE",
    consoleCalls: [],
  };
  assert({ actual, expected });

  // error stack
  if (params.runtime.name === "chromium") {
    const actual = error.originalStack;
    const expected = `    at triggerError (${devServer.origin}/trigger_error.js:2:9)
    at ${devServer.origin}/main.js:3:1`;
    assert({ actual, expected, context: "chromium" });
  }
  if (params.runtime.name === "firefox") {
    const actual = error.originalStack;
    const expected = `  triggerError@${devServer.origin}/trigger_error.js:2:9
@${devServer.origin}/main.js:3:1
`;
    assert({ actual, expected, context: "firefox" });
  }
  if (params.runtime.name === "webkit") {
    const expected = `  triggerError@${devServer.origin}/trigger_error.js:2:18
module code@${devServer.origin}/main.js:3:13`;
    const actual = error.originalStack.slice(0, expected.length);
    assert({ actual, expected, context: "webkit" });
  }
};

await test({ runtime: chromium() });
await test({
  runtime: firefox({
    disableOnWindowsBecauseFlaky: false,
  }),
});
await test({ runtime: webkit() });