import { assert } from "@dmail/assert"
import { localRoot } from "../../../localRoot.js"
import { launchNode } from "../../launchNode.js"
import { launchAndExecute } from "../../../launchAndExecute/index.js"
import { startCompileServer } from "../../../server-compile/index.js"

const file = `src/launchNode/test/alive/alive.js`
const compileInto = "build"
const pluginMap = {}

;(async () => {
  const { origin: remoteRoot } = await startCompileServer({
    localRoot,
    compileInto,
    pluginMap,
  })

  const actual = await launchAndExecute({
    launch: (options) => launchNode({ ...options, localRoot, remoteRoot, compileInto }),
    mirrorConsole: true,
    file,
    verbose: true,
    platformTypeForLog: "node process",
  })
  const expected = {
    status: "completed",
  }
  assert({ actual, expected })
})()
