import { assert } from "@dmail/assert"
import transformAsyncToPromises from "babel-plugin-transform-async-to-promises"
import { root } from "../../../root.js"
import { launchNode } from "../../launchNode.js"
import { launchAndExecute } from "../../../launchAndExecute/index.js"
import { startCompileServer } from "../../../server-compile/index.js"

const file = `src/launchNode/test/top-level-await/top-level-await.js`
const compileInto = "build"
const pluginMap = {
  "transform-async-to-promises": [transformAsyncToPromises],
}

;(async () => {
  const { origin: remoteRoot } = await startCompileServer({
    root,
    compileInto,
    pluginMap,
  })

  const actual = await launchAndExecute({
    launch: () => launchNode({ root, compileInto, remoteRoot }),
    collectNamespace: true,
    file,
    verbose: true,
    platformTypeForLog: "node process",
  })
  const expected = {
    status: "completed",
    value: {
      namespace: {
        default: 10,
      },
    },
  }
  assert({ actual, expected })
})()
