import { assert } from "@dmail/assert"
import { JSENV_PATH } from "../../../src/JSENV_PATH.js"
import { importMetaURLToFolderJsenvRelativePath } from "../../../src/import-meta-url-to-folder-jsenv-relative-path.js"
import { startCompileServer, launchAndExecute, launchNode } from "../../../index.js"
import { removeDebuggerLog } from "../removeDebuggerLog.js"

const projectPath = JSENV_PATH
const folderJsenvRelativePath = importMetaURLToFolderJsenvRelativePath(import.meta.url)
const compileIntoRelativePath = `${folderJsenvRelativePath}/.dist`
const fileRelativePath = `${folderJsenvRelativePath}/throw-after-executed.js`

const { origin: compileServerOrigin } = await startCompileServer({
  projectPath,
  compileIntoRelativePath,
  logLevel: "off",
})

let afterExecuteError
const actual = await launchAndExecute({
  launch: (options) =>
    launchNode({
      ...options,
      compileServerOrigin,
      projectPath,
      compileIntoRelativePath,
    }),
  captureConsole: true,
  fileRelativePath,
  errorAfterExecutedCallback: (error) => {
    afterExecuteError = error
  },
})
actual.platformLog = removeDebuggerLog(actual.platformLog)
const expected = {
  status: "completed",
  platformLog: "",
}
assert({ actual, expected })

process.on("exit", () => {
  assert({
    actual: afterExecuteError,
    expected: new Error(`child exited with 1`),
  })
})
