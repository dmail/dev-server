import { assert } from "/node_modules/@dmail/assert/index.js"
import { projectFolder } from "../../../../../projectFolder.js"
import { launchAndExecute } from "../../../../launchAndExecute/index.js"
import { startCompileServer } from "../../../../server-compile/index.js"
import { launchNode } from "../../../launchNode.js"

const testFolder = `${projectFolder}/src/launchNode/test/symlink/project`
const filenameRelative = `symlink.js`
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
    mirrorConsole: true,
    filenameRelative,
    verbose: true,
    collectNamespace: true,
  })
  const expected = {
    status: "completed",
    namespace: {
      default: "foo",
    },
  }
  assert({ actual, expected })
})()
