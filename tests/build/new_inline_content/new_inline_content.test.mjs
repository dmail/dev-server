import { assert } from "@jsenv/assert";
import { takeDirectorySnapshot } from "@jsenv/snapshot";

import { build } from "@jsenv/core";
import { executeInBrowser } from "@jsenv/core/tests/execute_in_browser.js";
import { startFileServer } from "@jsenv/core/tests/start_file_server.js";

const test = async (params) => {
  const snapshotDirectoryUrl = new URL(`./snapshots/`, import.meta.url);
  const buildDirectorySnapshot = takeDirectorySnapshot(snapshotDirectoryUrl);
  const { buildManifest } = await build({
    logLevel: "warn",
    sourceDirectoryUrl: new URL("./client/", import.meta.url),
    buildDirectoryUrl: snapshotDirectoryUrl,
    entryPoints: {
      "./main.html": "main.html",
    },
    transpilation: { css: false },
    bundling: false,
    minification: false,
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
    pageFunction: async (jsRelativeUrl) => {
      const namespace = await import(jsRelativeUrl);
      // let 500ms for the background image to load
      await new Promise((resolve) => setTimeout(resolve, 500));
      const bodyBackgroundImage = getComputedStyle(
        document.body,
      ).backgroundImage;
      return {
        ...namespace,
        bodyBackgroundImage,
      };
    },
    /* eslint-enable no-undef */
    pageArguments: [`./${buildManifest["js/main.js"]}`],
  });
  const actual = returnValue;
  const expect = {
    complexInsideDoubleQuotes: `\n'😀'\n`,
    complexInsideSingleQuotes: `\n"😀"\n`,
    cssAndTemplate: `
body {
  background-image: url(/other/jsenv.png?v=467b6542);
  background-image: url(/other/jsenv.png?v=467b6542);
  background-image: url(/other/jsenv.png?v=467b6542);
}
`,
    cssTextWithUrl: `\nbody { background-image: url(/other/jsenv.png?v=467b6542); }\n`,
    cssTextWithUrl2: `\nbody { background-image: url(/other/jsenv.png?v=467b6542); }\n`,
    doubleQuote: `"`,
    doubleQuoteEscaped: `"`,
    fromTemplate: `"`,
    fromTemplate2: `'`,
    fromTemplate3: `\n'"`,
    fromTemplate4: `
'"
`,
    lineEnding: `\n`,
    lineEnding2: `\n`,
    singleQuote: `'`,
    singleQuoteEscaped: `'`,
    bodyBackgroundImage: `url("${server.origin}/other/jsenv.png?v=467b6542")`,
  };
  assert({ actual, expect });
};

// script type module can be used
await test({ runtimeCompat: { chrome: "89" } });
