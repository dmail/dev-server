import { assert } from "@dmail/assert"
import { hrefToFolderJsenvRelative } from "../../../src/hrefToFolderJsenvRelative.js"
import { ROOT_FOLDER } from "../../../src/ROOT_FOLDER.js"
import { startCompileServer, launchAndExecute, launchNode } from "../../../index.js"

const testFolderRelative = hrefToFolderJsenvRelative(import.meta.url)
const projectFolder = ROOT_FOLDER
const compileInto = `${testFolderRelative}/.dist`
const filenameRelative = `${testFolderRelative}/disconnect-later.js`

const { origin: compileServerOrigin } = await startCompileServer({
  projectFolder,
  compileInto,
  verbose: false,
})

let called = false
const actual = await launchAndExecute({
  launch: (options) =>
    launchNode({
      ...options,
      projectFolder,
      compileServerOrigin,
      compileInto,
    }),
  filenameRelative,
  disconnectAfterExecutedCallback: () => {
    called = true
  },
})
const expected = {
  status: "completed",
}
assert({ actual, expected })

process.on("exit", () => {
  assert({
    actual: called,
    expected: true,
  })
})
