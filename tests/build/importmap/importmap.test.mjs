import { build } from "@jsenv/core";

await build({
  logLevel: "warn",
  sourceDirectoryUrl: new URL("./", import.meta.url),
  buildDirectoryUrl: new URL("./dist/", import.meta.url),
  entryPoints: {
    "./main.html": "main.html",
  },
});
