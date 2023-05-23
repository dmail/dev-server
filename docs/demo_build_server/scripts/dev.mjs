import { startDevServer } from "@jsenv/core";

await startDevServer({
  sourceDirectoryUrl: new URL("../src/", import.meta.url),
  ribbon: true,
});
