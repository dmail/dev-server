import { assert } from "@dmail/assert"
import { JSENV_PATH } from "../../../src/JSENV_PATH.js"
import { importMetaURLToFolderJsenvRelativePath } from "../../../src/import-meta-url-to-folder-jsenv-relative-path.js"
import { startCompileServer, launchAndExecute, launchNode } from "../../../index.js"

const projectPath = JSENV_PATH
const folderJsenvRelativePath = importMetaURLToFolderJsenvRelativePath(import.meta.url)
const compileIntoRelativePath = `${folderJsenvRelativePath}/.dist`
const fileRelativePath = `${folderJsenvRelativePath}/json.js`

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
  collectNamespace: true,
  fileRelativePath,
})
const expected = {
  status: "completed",
  namespace: {
    default: {
      foo: true,
    },
  },
}
assert({ actual, expected })
