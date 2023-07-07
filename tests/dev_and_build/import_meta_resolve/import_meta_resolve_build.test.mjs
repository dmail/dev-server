import { assert } from "@jsenv/assert";

import { build } from "@jsenv/core";
import { takeDirectorySnapshot } from "@jsenv/core/tests/snapshots_directory.js";
import { startFileServer } from "@jsenv/core/tests/start_file_server.js";
import { executeInBrowser } from "@jsenv/core/tests/execute_in_browser.js";

const test = async (name, params) => {
  await build({
    logLevel: "warn",
    sourceDirectoryUrl: new URL("./client/", import.meta.url),
    buildDirectoryUrl: new URL("./dist/", import.meta.url),
    entryPoints: {
      "./main.html": "main.html",
    },
    outDirectoryUrl: new URL("./.jsenv/", import.meta.url),
    ...params,
  });
  takeDirectorySnapshot(
    new URL(`./dist/`, import.meta.url),
    new URL(`./snapshots/${name}/`, import.meta.url),
  );
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
  const expected = {
    importMetaResolveReturnValue: `${server.origin}/js/foo.js`,
    __TEST__: `${server.origin}/js/foo.js`,
  };
  assert({ actual, expected });
};

// import.meta.resolve supported
await test("0_supported", {
  runtimeCompat: { chrome: "107" },
  versioning: false,
});
// module supported but import.meta.resolve is not
await test("1_not_supported", {
  runtimeCompat: { chrome: "80" },
  versioning: false,
});
// script module not supported
await test("2_js_module_not_supported", {
  runtimeCompat: { chrome: "60" },
  versioning: false,
});
