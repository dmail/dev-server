import { assert } from "@dmail/assert"
import { pluginOptionMapToPluginMap } from "@dmail/project-structure-compile-babel"
import { localRoot } from "../../../localRoot.js"
import { executeFile } from "../../../executeFile.js"
import { launchNode } from "../../launchNode.js"

const file = `src/launchNode/test/fixtures/file-root-dependency.js`
const compileInto = "build"
const pluginMap = pluginOptionMapToPluginMap({
  "transform-modules-systemjs": {},
})

;(async () => {
  const actual = await executeFile(file, {
    localRoot,
    compileInto,
    pluginMap,
    launchPlatform: launchNode,
    platformTypeForLog: "node process",
    verbose: true,
    collectNamespace: true,
    collectCoverage: true,
    stopOnceExecuted: true,
  })
  const expected = {
    status: "completed",
    value: {
      namespace: {},
      coverageMap: {
        "src/launchNode/test/fixtures/ask.js":
          actual.value.coverageMap["src/launchNode/test/fixtures/ask.js"],
        "src/launchNode/test/fixtures/file-root-dependency.js":
          actual.value.coverageMap["src/launchNode/test/fixtures/file-root-dependency.js"],
      },
    },
  }
  assert({
    actual,
    expected,
  })
})()
