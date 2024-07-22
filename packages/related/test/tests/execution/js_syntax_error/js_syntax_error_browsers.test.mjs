import { assert } from "@jsenv/assert";
import { startDevServer } from "@jsenv/core";

import { chromium, execute, firefox, webkit } from "@jsenv/test";

const test = async (params) => {
  const devServer = await startDevServer({
    logLevel: "off",
    sourceDirectoryUrl: new URL("./client/", import.meta.url),
    keepProcessAlive: false,
    port: 0,
  });
  const { errors } = await execute({
    // logLevel: "debug"
    rootDirectoryUrl: new URL("./client/", import.meta.url),
    webServer: {
      origin: devServer.origin,
      rootDirectoryUrl: new URL("./client/", import.meta.url),
    },
    fileRelativeUrl: `./main.html`,
    mirrorConsole: false,
    collectConsole: true,
    ignoreError: true,
    ...params,
  });
  devServer.stop();
  const [error] = errors;
  const expectedStack = {
    chromium: "SyntaxError: Unexpected end of input",
    firefox: "SyntaxError: expected expression, got end of script",
    webkit: "SyntaxError: Unexpected end of script",
  }[params.runtime.name];
  const actual = error.stack;
  const expect = expectedStack;
  assert({ actual, expect });
};

await test({ runtime: chromium() });
if (process.platform !== "win32") {
  await test({ runtime: firefox() });
}
await test({ runtime: webkit() });
