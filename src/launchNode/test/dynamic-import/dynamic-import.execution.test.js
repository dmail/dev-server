import { assert } from "@dmail/assert"
import transformAsyncToPromises from "babel-plugin-transform-async-to-promises"
import { projectFolder } from "../../../../projectFolder.js"
import { launchNode } from "../../launchNode.js"
import { launchAndExecute } from "../../../launchAndExecute/index.js"
import { startCompileServer } from "../../../server-compile/index.js"

const testFolder = `${projectFolder}/src/launchNode/test/dynamic-import`
const filenameRelative = `dynamic-import.js`
const compileInto = ".dist"
const babelPluginDescription = {
  "transform-async-to-promises": [transformAsyncToPromises],
}

;(async () => {
  const sourceOrigin = `file://${testFolder}`

  const { origin: compileServerOrigin } = await startCompileServer({
    projectFolder: testFolder,
    compileInto,
    babelPluginDescription,
  })

  const actual = await launchAndExecute({
    launch: (options) => launchNode({ ...options, compileInto, sourceOrigin, compileServerOrigin }),
    collectNamespace: true,
    filenameRelative,
    verbose: true,
  })
  const expected = {
    status: "completed",
    namespace: {
      default: 42,
    },
  }
  assert({ actual, expected })
})()
