import { hrefToPathname, pathnameToDirname } from "@jsenv/module-resolution"
import { assert } from "@dmail/assert"
import { cover, launchNode, launchChromium } from "../../../index.js"

const testFolder = pathnameToDirname(hrefToPathname(import.meta.url))
const compileInto = ".dist"

const { coverageMap } = await cover({
  projectFolder: testFolder,
  compileInto,
  babelConfigMap: {},
  coverDescription: {
    "/file.js": true,
  },
  executeDescription: {
    "/use-file.js": {
      node: {
        launch: launchNode,
      },
      chromium: {
        launch: launchChromium,
      },
    },
  },
})
assert({
  actual: coverageMap,
  expected: {
    "file.js": {
      ...coverageMap["file.js"],
      s: { 0: 2, 1: 1, 2: 1, 3: 1, 4: 0 },
    },
  },
})
