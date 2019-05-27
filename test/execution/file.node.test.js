import { assert } from "@dmail/assert"
import { JSENV_PATH } from "../../src/JSENV_PATH.js"
import { importMetaURLToFolderJsenvRelativePath } from "../../src/import-meta-url-to-folder-jsenv-relative-path.js"
import { execute, launchNode } from "../../index.js"

const projectPath = JSENV_PATH
const folderJsenvRelativePath = importMetaURLToFolderJsenvRelativePath(import.meta.url)
const compileIntoRelativePath = `${folderJsenvRelativePath}/.dist`
const fileRelativePath = `${folderJsenvRelativePath}/file.js`

const actual = await execute({
  projectPath,
  compileIntoRelativePath,
  launch: launchNode,
  fileRelativePath,
})

assert({ actual, expected: { status: "completed" } })
