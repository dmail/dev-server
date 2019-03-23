import { assert } from "@dmail/assert"
import { projectFolder } from "../../../../projectFolder.js"
import { launchAndExecute } from "../../../launchAndExecute/index.js"
import { startCompileServer } from "../../../server-compile/index.js"
import { launchNode } from "../../launchNode.js"

const filenameRelative = `src/launchNode/test/syntax-error/syntax-error.js`
const compileInto = ".dist"
const babelPluginDescription = {}

;(async () => {
  const sourceOrigin = `file://${projectFolder}`

  const { origin: compileServerOrigin } = await startCompileServer({
    projectFolder,
    compileInto,
    babelPluginDescription,
  })

  const actual = await launchAndExecute({
    launch: (options) => launchNode({ ...options, compileInto, sourceOrigin, compileServerOrigin }),
    mirrorConsole: true,
    filenameRelative,
    verbose: true,
  })
  const expected = {
    status: "errored",
    error: {
      code: "MODULE_PARSE_ERROR",
      message: actual.error.message,
      messageHTML: actual.error.messageHTML,
      stack: actual.error.stack,
      columnNumber: 14,
      fileName: filenameRelative,
      lineNumber: 1,
    },
  }
  assert({ actual, expected })
})()
