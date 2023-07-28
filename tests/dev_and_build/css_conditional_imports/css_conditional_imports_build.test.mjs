import { build } from "@jsenv/core";
import { takeDirectorySnapshot } from "@jsenv/core/tests/snapshots_directory.js";

const test = async (params) => {
  await build({
    logLevel: "warn",
    sourceDirectoryUrl: new URL("./client/", import.meta.url),
    buildDirectoryUrl: new URL("./dist/", import.meta.url),
    entryPoints: {
      "./main.css": "main.css",
    },
    outDirectoryUrl: new URL("./.jsenv/", import.meta.url),
    ...params,
  });
  takeDirectorySnapshot(
    new URL("./dist/", import.meta.url),
    new URL("./snapshots/", import.meta.url),
  );
};

await test({
  bundling: false,
  minification: false,
});
