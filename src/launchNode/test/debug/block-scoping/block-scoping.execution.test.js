import { assert } from "/node_modules/@dmail/assert/index.js"
import { projectFolder } from "../../../../../projectFolder.js"
import { launchAndExecute } from "../../../../launchAndExecute/index.js"
import { startCompileServer } from "../../../../server-compile/index.js"
import { launchNode } from "../../../launchNode.js"

const testFolder = projectFolder
// for debugging I need filenameRelative
// to be relative to projectFolder so that vscode
// knows where sourcefiles are
const filenameRelative = `src/launchNode/test/debug/block-scoping/debug.js`
const compileInto = ".dist"
const babelConfigMap = { "transform-block-scoping": [] }

;(async () => {
  const sourceOrigin = `file://${testFolder}`

  const { origin: compileServerOrigin } = await startCompileServer({
    projectFolder: testFolder,
    compileInto,
    babelConfigMap,
  })

  const actual = await launchAndExecute({
    launch: (options) => launchNode({ ...options, compileInto, sourceOrigin, compileServerOrigin }),
    filenameRelative,
    verbose: true,
  })
  const expected = {
    status: "completed",
  }
  assert({ actual, expected })
})()
