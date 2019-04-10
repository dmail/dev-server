import { assert } from "/node_modules/@dmail/assert/index.js"
import { bundleBrowser } from "../../../index.js"
import { importBrowserBundle } from "../import-browser-bundle.js"

const { projectFolder } = import.meta.require("../../../jsenv.config.js")

const testFolder = `${projectFolder}/test/bundle-browser/dynamic-import-origin-relative`

;(async () => {
  await bundleBrowser({
    projectFolder: testFolder,
    into: "dist/browser",
    entryPointMap: {
      main: "dynamic-import-origin-relative.js",
    },
    babelConfigMap: {},
    compileGroupCount: 1,
    verbose: false,
  })

  const { namespace: actual } = await importBrowserBundle({
    bundleFolder: `${testFolder}/dist/browser`,
    file: "main.js",
  })
  const expected = { default: 42 }
  assert({ actual, expected })
})()
