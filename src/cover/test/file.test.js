import { assert } from "@dmail/assert"
import { projectFolder } from "../../../projectFolder.js"
import { launchNode } from "../../launchNode/index.js"
import { launchChromium } from "../../launchChromium/index.js"
import { cover } from "../cover.js"

const testFolder = `${projectFolder}/src/cover/test`
const compileInto = ".dist"

;(async () => {
  const { coverageMap } = await cover({
    projectFolder: testFolder,
    compileInto,
    babelPluginDescription: {},
    coverDescription: {
      "file.js": true,
    },
    executeDescription: {
      "use-file.js": {
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
})()
