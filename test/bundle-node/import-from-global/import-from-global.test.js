import { assert } from "/node_modules/@dmail/assert/index.js"
import { bundleNode } from "../../../index.js"
import { importNodeBundle } from "../import-node-bundle.js"

const blockScoping = import.meta.require("@babel/plugin-transform-block-scoping")
const { projectFolder } = import.meta.require("../../../jsenv.config.js")

const testFolder = `${projectFolder}/test/bundle-node/import-from-global`

;(async () => {
  await bundleNode({
    projectFolder: testFolder,
    into: "dist/node",
    entryPointMap: {
      main: "import-from-global.js",
    },
    babelConfigMap: {
      "transform-block-scoping": [blockScoping],
    },
    compileGroupCount: 1,
    minify: false,
    verbose: true,
  })

  const { namespace: actual } = await importNodeBundle({
    bundleFolder: `${testFolder}/dist/node`,
    file: "main.js",
  })
  const expected = 42
  assert({ actual, expected })
})()
