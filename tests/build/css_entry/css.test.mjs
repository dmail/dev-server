import { build } from "@jsenv/core";
import { takeDirectorySnapshot } from "@jsenv/core/tests/snapshots_directory.js";

await build({
  logLevel: "warn",
  sourceDirectoryUrl: new URL("./client/", import.meta.url),
  buildDirectoryUrl: new URL("./dist/", import.meta.url),
  entryPoints: {
    "./main.css": "main.css",
  },
  minification: false,
});
takeDirectorySnapshot(
  new URL("./dist/", import.meta.url),
  new URL("./snapshots/", import.meta.url),
);
