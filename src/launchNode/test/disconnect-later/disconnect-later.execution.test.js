import { assert } from "@dmail/assert"
import { localRoot } from "../../../localRoot.js"
import { launchAndExecute } from "../../../launchAndExecute/index.js"
import { startCompileServer } from "../../../server-compile/index.js"
import { launchNode } from "../../launchNode.js"

const file = `src/launchNode/test/disconnect-later/disconnect-later.js`
const compileInto = "build"
const pluginMap = {}

;(async () => {
  const { origin: remoteRoot } = await startCompileServer({
    localRoot,
    compileInto,
    pluginMap,
  })

  const actual = await launchAndExecute(
    () => launchNode({ localRoot, remoteRoot, compileInto }),
    file,
    {
      platformTypeForLog: "node process",
      verbose: true,
    },
  )
  const expected = {
    status: "completed",
  }
  assert({ actual, expected })
})()
