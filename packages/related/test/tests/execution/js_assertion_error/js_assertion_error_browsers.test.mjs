import stripAnsi from "strip-ansi";
import { assert } from "@jsenv/assert";
import { startDevServer } from "@jsenv/core";

import { execute, chromium, firefox, webkit } from "@jsenv/test";

if (process.env.CI) {
  // disabled on CI because generates the following warning
  // Window 'showModalDialog' function is deprecated and will be removed soon
  // for some reason
  process.exit(0);
}

const clientDirectoryUrl = new URL("./client", import.meta.url).href;
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
    consoleCalls,
    errorMessage: stripAnsi(error.message.trim()),
    site: error.site,
  };
  const expectedErrorMessage = `actual and expect are different

actual: "foo"
expect: "bar"`;
  const expectedLine = {
    chromium: 13,
    firefox: 9,
    webkit: 9,
  }[params.runtime.name];
  const expectedColumn = {
    chromium: 7,
    firefox: 5,
    webkit: 5,
  }[params.runtime.name];
  const ownerSite = {
    chromium: {
      url: `${clientDirectoryUrl}/main.html@L10C5-L17C14.js`,
      ownerColumn: 5,
      ownerLine: 10,
      inlineColumn: expectedColumn,
      inlineLine: 3,
    },
    firefox: {
      url: `${clientDirectoryUrl}/main.html@L10C5-L17C14.js`,
      ownerColumn: 5,
      ownerLine: 10,
      inlineColumn: undefined,
      inlineLine: undefined,
    },
    webkit: {
      url: `${clientDirectoryUrl}/main.html@L10C5-L17C14.js`,
      ownerColumn: 5,
      ownerLine: 10,
      inlineColumn: undefined,
      inlineLine: undefined,
    },
  }[params.runtime.name];

  const expect = {
    status: "failed",
    consoleCalls: [],
    errorMessage: expectedErrorMessage,
    site: {
      ownerSite,
      isInline: true,
      url: `${clientDirectoryUrl}/main.html`,
      line: expectedLine,
      column: expectedColumn,
      serverUrl: `${devServer.origin}/main.html`,
    },
  };
  assert({ actual, expect, details: params.runtime.name });
};

await test({ runtime: chromium() });
await test({
  runtime: firefox({
    disableOnWindowsBecauseFlaky: false,
  }),
});
await test({ runtime: webkit() });
