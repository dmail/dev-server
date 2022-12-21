import { assert } from "@jsenv/assert"
import { jsenvPluginBundling } from "@jsenv/plugin-bundling"

import { build } from "@jsenv/core"

const test = async (params) => {
  const { buildFileContents } = await build({
    logLevel: "warn",
    rootDirectoryUrl: new URL("./client/", import.meta.url),
    buildDirectoryUrl: new URL("./dist/", import.meta.url),
    entryPoints: {
      "./main.js": "main.js",
    },
    plugins: [jsenvPluginBundling()],
    ...params,
  })
  const actual = buildFileContents
  const expected = actual
  assert({ actual, expected })
}

await test()
