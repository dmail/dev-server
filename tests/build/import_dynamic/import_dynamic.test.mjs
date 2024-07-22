import { assert } from "@jsenv/assert";
import { takeDirectorySnapshot } from "@jsenv/snapshot";

import { build } from "@jsenv/core";
import { executeInBrowser } from "@jsenv/core/tests/execute_in_browser.js";
import { startFileServer } from "@jsenv/core/tests/start_file_server.js";

const test = async ({ name, expectedFilename, ...params }) => {
  const snapshotDirectoryUrl = new URL(`./snapshots/${name}/`, import.meta.url);
  const buildDirectorySnapshot = takeDirectorySnapshot(snapshotDirectoryUrl);
  await build({
    logLevel: "warn",
    sourceDirectoryUrl: new URL("./client/", import.meta.url),
    buildDirectoryUrl: snapshotDirectoryUrl,
    entryPoints: {
      "./main.html": "main.html",
    },
    outDirectoryUrl: new URL("./.jsenv/", import.meta.url),
    ...params,
  });
  buildDirectorySnapshot.compare();

  const server = await startFileServer({
    rootDirectoryUrl: snapshotDirectoryUrl,
  });
  const { returnValue } = await executeInBrowser({
    url: `${server.origin}/main.html`,
    /* eslint-disable no-undef */
    pageFunction: () => window.resultPromise,
    /* eslint-enable no-undef */
  });
  const actual = returnValue;
  const expect = {
    answer: 42,
    nestedFeatureUrl: `${server.origin}/js/${expectedFilename}`,
  };
  assert({ actual, expect });
};

// can use <script type="module">
await test({
  name: "0_js_module",
  expectedFilename: `nested_feature.js`,
  runtimeCompat: { chrome: "89" },
  bundling: false,
  minification: false,
  versioning: false,
});
// cannot use <script type="module">
await test({
  name: "1_js_module_fallback",
  expectedFilename: `nested_feature.nomodule.js`,
  runtimeCompat: { chrome: "62" },
  bundling: false,
  minification: false,
  versioning: false,
});
