import { assert } from "@dmail/assert"
import { importMetaURLToFolderJsenvRelativePath } from "../../../src/import-meta-url-to-folder-jsenv-relative-path.js"
import { JSENV_PATH } from "../../../src/JSENV_PATH.js"
import { startCompileServer, launchAndExecute, launchNode } from "../../../index.js"

const projectPath = JSENV_PATH
const folderJsenvRelativePath = importMetaURLToFolderJsenvRelativePath(import.meta.url)
const compileIntoRelativePath = `${folderJsenvRelativePath}/.dist`
const fileRelativePath = `${folderJsenvRelativePath}/debug.js`

const { origin: compileServerOrigin } = await startCompileServer({
  projectPath,
  compileIntoRelativePath,
  logLevel: "off",
})

const actual = await launchAndExecute({
  launch: (options) =>
    launchNode({
      ...options,
      compileServerOrigin,
      projectPath,
      compileIntoRelativePath,
    }),
  mirrorConsole: true,
  fileRelativePath,
})
const expected = {
  status: "completed",
}
assert({ actual, expected })
