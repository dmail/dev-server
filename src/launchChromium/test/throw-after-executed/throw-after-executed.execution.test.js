import { assert } from "/node_modules/@dmail/assert/index.js"
import { projectFolder } from "../../../../projectFolder.js"
import { startCompileServer } from "../../../server-compile/index.js"
import { launchAndExecute } from "../../../launchAndExecute/index.js"
import { launchChromium } from "../../launchChromium.js"

const testFolder = `${projectFolder}/src/launchChromium/test/throw-after-executed`
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
    launch: (options) =>
      launchChromium({
        ...options,
        compileInto,
        sourceOrigin,
        compileServerOrigin,
        headless: false,
      }),
    stopOnceExecuted: true,
    mirrorConsole: true,
    verbose: true,
    filenameRelative,
  })
  const expected = {
    status: "completed",
  }
  assert({ actual, expected })
})()
