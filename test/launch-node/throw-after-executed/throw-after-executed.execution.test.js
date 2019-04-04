import { assert } from "/node_modules/@dmail/assert/index.js"
import { startCompileServer, launchAndExecute, launchNode } from "../../../index.js"
import { removeDebuggerLog } from "../removeDebuggerLog.js"

const { projectFolder } = import.meta.require("../../../jsenv.config.js")
const testFolder = `${projectFolder}/test/launch-node/throw-after-executed`
const filenameRelative = `throw-after-executed.js`
const compileInto = ".dist"
const babelConfigMap = {}

;(async () => {
  const sourceOrigin = `file://${testFolder}`

  const { origin: compileServerOrigin } = await startCompileServer({
    projectFolder: testFolder,
    compileInto,
    babelConfigMap,
  })

  const actual = await launchAndExecute({
    launch: (options) => launchNode({ ...options, compileInto, sourceOrigin, compileServerOrigin }),
    captureConsole: true,
    filenameRelative,
    verbose: true,
  })
  actual.platformLog = removeDebuggerLog(actual.platformLog)
  const expected = {
    status: "completed",
    platformLog: "",
  }
  assert({ actual, expected })
  console.log("execution ok")
})()
