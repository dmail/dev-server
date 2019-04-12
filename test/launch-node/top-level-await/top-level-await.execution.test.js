import { hrefToPathname, pathnameToDirname } from "@jsenv/module-resolution"
import { assert } from "@dmail/assert"
import { startCompileServer, launchAndExecute, launchNode } from "../../../index.js"

const transformAsyncToPromises = import.meta.require("babel-plugin-transform-async-to-promises")

const testFolder = pathnameToDirname(hrefToPathname(import.meta.url))
const filenameRelative = `top-level-await.js`
const compileInto = ".dist"
const babelConfigMap = {
  "transform-async-to-promises": [transformAsyncToPromises],
}

const sourceOrigin = `file://${testFolder}`

const { origin: compileServerOrigin } = await startCompileServer({
  projectFolder: testFolder,
  compileInto,
  babelConfigMap,
  compileGroupCount: 2,
})

const actual = await launchAndExecute({
  launch: (options) => launchNode({ ...options, compileInto, sourceOrigin, compileServerOrigin }),
  collectNamespace: true,
  filenameRelative,
})
const expected = {
  status: "completed",
  namespace: {
    default: 10,
  },
}
assert({ actual, expected })
