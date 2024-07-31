import { build } from "@jsenv/core";
import { snapshotBuildTests } from "@jsenv/core/tests/snapshot_build_side_effects.js";

await snapshotBuildTests(import.meta.url, ({ test }) => {
  const testParams = {
    sourceDirectoryUrl: new URL("./client/", import.meta.url),
    buildDirectoryUrl: new URL("./build/", import.meta.url),
    entryPoints: { "./main.html": "main.html" },
    outDirectoryUrl: new URL("./.jsenv/", import.meta.url),
    bundling: false,
    minification: false,
    versioning: true,
  };
  // can use <script type="module">
  test("0_js_module", () =>
    build({
      ...testParams,
      runtimeCompat: { chrome: "89" },
    }));
  // cannot use <script type="module">
  test("1_js_module_fallback", () =>
    build({
      ...testParams,
      runtimeCompat: { chrome: "60" },
    }));
  // can use <script type="module"> + sourcemap
  test("2_js_module_sourcemaps_file", () =>
    build({
      ...testParams,
      runtimeCompat: { chrome: "89" },
      sourcemaps: "file",
    }));
});
