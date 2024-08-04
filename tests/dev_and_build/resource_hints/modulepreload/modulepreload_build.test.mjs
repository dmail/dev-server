import { assert } from "@jsenv/assert";
import { takeDirectorySnapshot } from "@jsenv/snapshot";

import { build, startBuildServer } from "@jsenv/core";
import { executeInBrowser } from "@jsenv/core/tests/execute_in_browser.js";

const test = async ({ name, ...params }) => {
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

  const server = await startBuildServer({
    logLevel: "warn",
    keepProcessAlive: false,
    buildDirectoryUrl: snapshotDirectoryUrl,
    port: 0,
  });
  const { returnValue, consoleOutput } = await executeInBrowser(
    `${server.origin}/main.html`,
    {
      collectConsole: true,
    },
  );
  const actual = {
    returnValue,
    consoleLogs: consoleOutput.logs,
    consoleWarnings: consoleOutput.warnings,
  };
  const expect = {
    returnValue: 42,
    consoleLogs: [],
    consoleWarnings: [],
  };
  assert({ actual, expect });
};

// support for <script type="module">
await test({
  name: "0_js_module",
  runtimeCompat: { chrome: "89" },
  bundling: false,
  minification: false,
  // versioningMethod: "filename",
});

// no support for <script type="module">
await test({
  name: "1_js_module_fallback",
  runtimeCompat: { chrome: "60" },
  bundling: false,
  minification: false,
  versioningMethod: "filename",
});
