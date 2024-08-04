import { assert } from "@jsenv/assert";

import { build } from "@jsenv/core";
import { executeInBrowser } from "@jsenv/core/tests/execute_in_browser.js";
import { startFileServer } from "@jsenv/core/tests/start_file_server.js";
import "./local_server/serve.js";

const test = async (params) => {
  await build({
    logLevel: "warn",
    sourceDirectoryUrl: new URL("./client/", import.meta.url),
    buildDirectoryUrl: new URL("./dist/", import.meta.url),
    entryPoints: {
      "./main.html": "main.html",
    },
    runtimeCompat: { chrome: "89" },
    ...params,
  });
  const server = await startFileServer({
    rootDirectoryUrl: new URL("./dist/", import.meta.url),
  });
  const { returnValue } = await executeInBrowser(`${server.origin}/main.html`);
  const actual = returnValue;
  const expect = {
    url: `http://127.0.0.1:9999/constants.js?foo=bar`,
  };
  assert({ actual, expect });
};

// http url preserved
await test({
  bundling: false,
  minification: false,
});

// TODO: ability to fetch http url and transform it
// will be tested when modle are not supported (systemjs)
