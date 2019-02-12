import { assert } from "@dmail/assert"
import { localRoot } from "../../../localRoot.js"
import { launchAndExecute } from "../../../launchAndExecute/index.js"
import { startCompileServer } from "../../../server-compile/index.js"
import { launchNode } from "../../launchNode.js"
import { removeDebuggerLog } from "../removeDebuggerLog.js"

const file = `src/launchNode/test/throw-after-executed/throw-after-executed.js`
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
    captureConsole: true,
    file,
    verbose: true,
    platformTypeForLog: "node process",
  })
  actual.platformLog = removeDebuggerLog(actual.platformLog)
  const expected = {
    status: "completed",
    platformLog: "",
  }
  assert({ actual, expected })
})()
