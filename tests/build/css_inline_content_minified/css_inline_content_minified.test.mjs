import { assert } from "@jsenv/assert"
import { jsenvPluginBundling } from "@jsenv/plugin-bundling"
import { jsenvPluginMinification } from "@jsenv/plugin-minification"

import { build } from "@jsenv/core"
import {
  readSnapshotsFromDirectory,
  writeSnapshotsIntoDirectory,
} from "@jsenv/core/tests/snapshots_directory.js"

const jsenvSrcDirectoryUrl = new URL("../../../src/", import.meta.url)
const { buildFileContents } = await build({
  logLevel: "warn",
  sourceDirectoryUrl: new URL("./client/", import.meta.url),
  entryPoints: {
    "./main.html": "main.html",
  },
  buildDirectoryUrl: new URL("./dist/", import.meta.url),
  runtimeCompat: {
    chrome: "64",
    edge: "79",
    firefox: "67",
    safari: "11.3",
  },
  plugins: [
    jsenvPluginBundling({
      js_module: {
        chunks: {
          vendors: {
            "**/node_modules/": true,
            [jsenvSrcDirectoryUrl]: true,
          },
        },
      },
    }),
    jsenvPluginMinification(),
  ],
})
const snapshotsDirectoryUrl = new URL("./snapshots/", import.meta.url)
const expected = readSnapshotsFromDirectory(snapshotsDirectoryUrl)
writeSnapshotsIntoDirectory(snapshotsDirectoryUrl, buildFileContents)
const actual = buildFileContents
assert({ actual, expected })