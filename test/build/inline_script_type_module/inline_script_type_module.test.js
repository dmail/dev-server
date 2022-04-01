import { urlToRelativeUrl } from "@jsenv/filesystem"

import { rootDirectoryUrl } from "@jsenv/core/jsenv.config.mjs"
import { build } from "@jsenv/core"

await build({
  logLevel: "debug",
  rootDirectoryUrl: new URL("./client/", import.meta.url),
  buildDirectoryUrl: new URL("./dist/", import.meta.url),
  baseUrl: `/${urlToRelativeUrl(
    new URL("./dist/", import.meta.url),
    rootDirectoryUrl,
  )}`,
  entryPoints: {
    "./main.html": "main.html",
  },
  sourcemaps: "file",
  bundling: false,
  versioning: "filename",
})
