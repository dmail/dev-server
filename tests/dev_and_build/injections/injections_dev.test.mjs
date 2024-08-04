import { assert } from "@jsenv/assert";
import { startDevServer } from "@jsenv/core";
import { executeInBrowser } from "@jsenv/core/tests/execute_in_browser.js";

const test = async (params) => {
  const devServer = await startDevServer({
    logLevel: "warn",
    sourceDirectoryUrl: new URL("./client/", import.meta.url),
    keepProcessAlive: false,
    injections: {
      "./main.js": (urlInfo) => {
        return {
          __DEMO__: urlInfo.context.dev ? "dev" : "build",
        };
      },
    },
    port: 0,
    ...params,
  });
  const { returnValue } = await executeInBrowser(
    `${devServer.origin}/main.html`,
  );

  const actual = returnValue;
  const expect = "dev";
  assert({ actual, expect });
};

await test();
