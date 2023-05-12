import { build } from "@jsenv/core";
import { jsenvPluginBundling } from "@jsenv/plugin-bundling";

await build({
  sourceDirectoryUrl: new URL("../src/", import.meta.url),
  buildDirectoryUrl: new URL("../dist/", import.meta.url),
  entryPoints: {
    "./jsenv_plugin_toolbar.js": "jsenv_plugin_toolbar.js",
  },
  base: "./",
  urlAnalysis: {
    include: {
      "/**/*": true,
      "/**/node_modules/@jsenv/ast/": false, // cannot inline "parse5", "@babel/core" and "postcss"
    },
  },
  plugins: [jsenvPluginBundling()],
  versioning: false,
});
