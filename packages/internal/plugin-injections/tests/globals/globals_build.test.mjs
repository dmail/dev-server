import { assert } from "@jsenv/assert";
import { build } from "@jsenv/core";
import { startFileServer } from "@jsenv/core/tests/start_file_server.js";
import { executeInBrowser } from "@jsenv/core/tests/execute_in_browser.js";

const test = async (params) => {
  await build({
    logLevel: "warn",
    sourceDirectoryUrl: new URL("./client/", import.meta.url),
    buildDirectoryUrl: new URL("./dist/", import.meta.url),
    entryPoints: {
      "./main.html": "main.html",
    },
    injections: {
      "./main.js": () => {
        return {
          "window.__answer__": 42,
        };
      },
    },
    ...params,
  });
  const server = await startFileServer({
    rootDirectoryUrl: new URL("./dist/", import.meta.url),
  });
  const { returnValue } = await executeInBrowser({
    url: `${server.origin}/main.html`,
    /* eslint-disable no-undef */
    pageFunction: () => window.resultPromise,
    /* eslint-enable no-undef */
  });
  const actual = returnValue;
  const expected = { answer: 42 };
  assert({ actual, expected });
};

// support for <script type="module">
await test({
  runtimeCompat: { chrome: "64" },
  bundling: false,
  minification: false,
});
// no support for <script type="module">
await test({
  runtimeCompat: { chrome: "62" },
  bundling: false,
  minification: false,
});