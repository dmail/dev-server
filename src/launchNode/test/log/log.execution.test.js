import { assert } from "@dmail/assert"
import { root } from "../../../root.js"
import { launchAndExecute } from "../../../launchAndExecute/index.js"
import { startCompileServer } from "../../../server-compile/index.js"
import { launchNode } from "../../launchNode.js"
import { removeDebuggerLog } from "../removeDebuggerLog.js"

const file = `src/launchNode/test/log/log.js`
const compileInto = "build"
const pluginMap = {}

;(async () => {
  const { origin: remoteRoot } = await startCompileServer({
    root,
    compileInto,
    pluginMap,
  })

  const actual = await launchAndExecute({
    launch: (options) => launchNode({ ...options, root, remoteRoot, compileInto }),
    captureConsole: true,
    file,
    verbose: true,
    platformTypeForLog: "node process",
  })
  actual.platformLog = removeDebuggerLog(actual.platformLog)
  const expected = {
    status: "completed",
    platformLog: `foo
bar
`,
  }
  assert({ actual, expected })
})()
