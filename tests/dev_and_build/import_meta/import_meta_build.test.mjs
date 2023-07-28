import { assert } from "@jsenv/assert";

import { build } from "@jsenv/core";
import { takeDirectorySnapshot } from "@jsenv/core/tests/snapshots_directory.js";
import { startFileServer } from "@jsenv/core/tests/start_file_server.js";
import { executeInBrowser } from "@jsenv/core/tests/execute_in_browser.js";

const test = async (name, { expectedBuildPath, ...rest }) => {
  await build({
    logLevel: "warn",
    sourceDirectoryUrl: new URL("./client/", import.meta.url),
    buildDirectoryUrl: new URL("./dist/", import.meta.url),
    entryPoints: {
      "./main.html": "main.html",
    },
    ...rest,
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
    meta: {
      url: `${server.origin}${expectedBuildPath}`,
      resolve: undefined,
    },
    url: `${server.origin}${expectedBuildPath}`,
    urlDestructured: `${server.origin}${expectedBuildPath}`,
    importMetaDev: undefined,
    importMetaTest: undefined,
    importMetaBuild: true,
  };

  assert({ actual, expected });
};

// can use <script type="module">
await test("0_js_module", {
  expectedBuildPath: "/js/main.js",
  runtimeCompat: { chrome: "89" },
  minification: false,
  versioning: false,
});
// cannot use <script type="module">
await test("1_js_module_fallback", {
  expectedBuildPath: "/js/main.nomodule.js",
  runtimeCompat: { chrome: "60" },
  minification: false,
  versioning: false,
});
