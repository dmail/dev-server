import { assert } from "@jsenv/assert";

import { build } from "@jsenv/core";
import { startFileServer } from "@jsenv/core/tests/start_file_server.js";
import { executeInBrowser } from "@jsenv/core/tests/execute_in_browser.js";
import { takeDirectorySnapshot } from "@jsenv/core/tests/snapshots_directory.js";

const test = async (name, params) => {
  await build({
    logLevel: "warn",
    sourceDirectoryUrl: new URL("./client/", import.meta.url),
    buildDirectoryUrl: new URL("./dist/", import.meta.url),
    entryPoints: {
      "./main.html": "main.html",
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
  takeDirectorySnapshot(
    new URL("./dist/", import.meta.url),
    new URL(`./snapshots/${name}/`, import.meta.url),
  );
  const actual = returnValue;
  const expected = { answer: 42 };
  assert({ actual, expected });
};

// support
await test("0_supported", {
  runtimeCompat: { chrome: "89" },
});
// no support for top level await
await test("1_not_supported", {
  runtimeCompat: { chrome: "55" },
});
