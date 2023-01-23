import { assert } from "@jsenv/assert"
import { jsenvPluginBundling } from "@jsenv/plugin-bundling"
import { jsenvPluginMinification } from "@jsenv/plugin-minification"

import { build } from "@jsenv/core"
import { startFileServer } from "@jsenv/core/tests/start_file_server.js"
import { executeInChromium } from "@jsenv/core/tests/execute_in_chromium.js"

const test = async (options) => {
  const { buildManifest } = await build({
    logLevel: "warn",
    rootDirectoryUrl: new URL("./client/", import.meta.url),
    buildDirectoryUrl: new URL("./dist/", import.meta.url),
    entryPoints: {
      "./main.html": "main.html",
    },
    ...options,
  })
  const server = await startFileServer({
    rootDirectoryUrl: new URL("./dist/", import.meta.url),
  })
  const { returnValue } = await executeInChromium({
    url: `${server.origin}/main.html`,
    /* eslint-disable no-undef */
    pageFunction: async () => {
      return window.resultPromise
    },
    /* eslint-enable no-undef */
  })
  const actual = returnValue
  const expected = {
    bodyBackgroundColor: "rgb(255, 0, 0)",
    bodyBackgroundImage: `url("${server.origin}/${buildManifest["other/jsenv.png"]}")`,
  }
  assert({ actual, expected })
}

// can use <script type="module">
await test({
  runtimeCompat: { chrome: "89" },
  plugins: [jsenvPluginBundling()],
})
// no bundling
await test({ runtimeCompat: { chrome: "65" } })
// cannot use <script type="module">
await test({
  runtimeCompat: { chrome: "60" },
  plugins: [jsenvPluginBundling()],
})

// minification
{
  const { buildInlineContents } = await build({
    logLevel: "warn",
    rootDirectoryUrl: new URL("./client/", import.meta.url),
    buildDirectoryUrl: new URL("./dist/", import.meta.url),
    entryPoints: {
      "./main.html": "main.html",
    },
    plugins: [
      jsenvPluginBundling(),
      jsenvPluginMinification({
        js_module: false,
        css: true,
      }),
    ],
  })
  const cssKey = Object.keys(buildInlineContents).find((key) =>
    key.endsWith(".css"),
  )
  const actual = buildInlineContents[cssKey]
  const expected = `body{background-color:red;background-image:url("+__v__("/other/jsenv.png")+")}`
  assert({ actual, expected })
}
