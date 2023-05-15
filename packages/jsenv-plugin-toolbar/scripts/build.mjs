import { build } from "@jsenv/core";
import { jsenvPluginBundling } from "@jsenv/plugin-bundling";

await build({
  sourceDirectoryUrl: new URL("../src/", import.meta.url),
  buildDirectoryUrl: new URL("../dist/", import.meta.url),
  entryPoints: {
    "./jsenv_plugin_toolbar.js": "jsenv_plugin_toolbar.js",
  },
  runtimeCompat: {
    node: "16.2.0",
    chrome: "64",
    edge: "79",
    firefox: "67",
    safari: "11.3",
  },
  referenceAnalysis: {
    include: {
      "/**/*": true,
      "/**/node_modules/@jsenv/ast/": false, // cannot inline "parse5", "@babel/core" and "postcss"
    },
  },
  plugins: [jsenvPluginBundling()],
  versioning: false,
});
