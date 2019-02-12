import { assert } from "@dmail/assert"
import { localRoot } from "../../../localRoot.js"
import { launchAndExecute } from "../../../launchAndExecute/index.js"
import { startCompileServer } from "../../../server-compile/index.js"
import { launchNode } from "../../launchNode.js"

const file = `src/launchNode/test/shared-node-module/shared-node-module.js`
const compileInto = "build"
const pluginMap = {}

;(async () => {
  const { origin: remoteRoot } = await startCompileServer({
    localRoot,
    compileInto,
    pluginMap,
  })

  const actual = await launchAndExecute({
    launch: (options) => launchNode({ ...options, localRoot, compileInto, remoteRoot }),
    collectNamespace: true,
    file,
    verbose: true,
    platformTypeForLog: "node process",
  })
  const expected = {
    status: "completed",
    namespace: {
      foo: "foo",
    },
  }
  assert({ actual, expected })
})()
