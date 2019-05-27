import { assert } from "@dmail/assert"
import { importMetaURLToFolderJsenvRelativePath } from "../../../src/import-meta-url-to-folder-jsenv-relative-path.js"
import { JSENV_PATH } from "../../../src/JSENV_PATH.js"
import { startCompileServer, launchAndExecute, launchChromium } from "../../../index.js"

const projectPath = JSENV_PATH
const folderJsenvRelativePath = importMetaURLToFolderJsenvRelativePath(import.meta.url)
const compileIntoRelativePath = `${folderJsenvRelativePath}/.dist`
const fileRelativePath = `${folderJsenvRelativePath}/origin-relative.js`

const { origin: compileServerOrigin } = await startCompileServer({
  projectPath,
  compileIntoRelativePath,
  logLevel: "off",
  cleanCompileInto: true,
})

const actual = await launchAndExecute({
  launch: (options) =>
    launchChromium({
      ...options,
      compileServerOrigin,
      projectPath,
      compileIntoRelativePath,
    }),
  stopOnceExecuted: true,
  fileRelativePath,
  collectNamespace: true,
})
const expected = {
  status: "completed",
  namespace: {
    default: 42,
  },
}
assert({ actual, expected })
