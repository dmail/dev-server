import { assert } from "@jsenv/assert";
import { jsenvPluginMinification } from "@jsenv/plugin-minification";

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
    outDirectoryUrl: new URL("./.jsenv/", import.meta.url),
    plugins: [jsenvPluginMinification()],
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
  const expected = {
    textFileUrl: `${server.origin}/other/file.txt?v=64ec88ca`,
    absoluteUrl: `http://example.com/file.txt`,
    windowLocationRelativeUrl: `${server.origin}/other/file.txt?v=64ec88ca`,
    windowOriginRelativeUrl: `${server.origin}/other/file.txt?v=64ec88ca`,
    absoluteBaseUrl: `http://jsenv.dev/file.txt`,
  };
  assert({ actual, expected });
};

// support for <script type="module">
await test({ runtimeCompat: { chrome: "64" } });
// no support for <script type="module">
await test({ runtimeCompat: { chrome: "60" } });
