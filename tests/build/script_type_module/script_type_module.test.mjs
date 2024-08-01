import { assert } from "@jsenv/assert";
import { build } from "@jsenv/core";
import { executeBuildHtmlInBrowser } from "@jsenv/core/tests/execute_build_html_in_browser.js";
import { snapshotBuildTests } from "@jsenv/core/tests/snapshot_build_side_effects.js";

const { getScenarioBuildUrl } = await snapshotBuildTests(
  import.meta.url,
  ({ test }) => {
    const testParams = {
      sourceDirectoryUrl: new URL("./client/", import.meta.url),
      buildDirectoryUrl: new URL("./build/", import.meta.url),
      entryPoints: { "./main.html": "main.html" },
      outDirectoryUrl: new URL("./.jsenv/", import.meta.url),
      minification: false,
    };
    test("0_js_module", () =>
      build({
        ...testParams,
        runtimeCompat: { chrome: "89" },
      }));
    test("1_js_module_fallback", () =>
      build({
        ...testParams,
        runtimeCompat: { chrome: "60" },
      }));
    test("2_js_module_fallback_no_bundling", () =>
      build({
        ...testParams,
        runtimeCompat: { chrome: "60" },
        bundling: false,
      }));
  },
);

const actual = {
  jsModule: await executeBuildHtmlInBrowser(getScenarioBuildUrl("0_js_module")),
  jsModuleFallback: await executeBuildHtmlInBrowser(
    getScenarioBuildUrl("1_js_module_fallback"),
  ),
  jsModuleFallbackNoBundling: await executeBuildHtmlInBrowser(
    getScenarioBuildUrl("2_js_module_fallback_no_bundling"),
  ),
};
const expect = {
  jsModule: {
    answer: 42,
    url: "window.origin/js/main.js?v=bff3ad6a",
  },
  jsModuleFallback: {
    answer: 42,
    url: "window.origin/js/main.nomodule.js?v=77220151",
  },
  jsModuleFallbackNoBundling: {
    answer: 42,
    url: "window.origin/js/main.nomodule.js?v=3287262d",
  },
};
assert({ actual, expect });
