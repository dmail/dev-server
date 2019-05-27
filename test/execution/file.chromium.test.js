import { assert } from "@dmail/assert"
import { importMetaURLToFolderJsenvRelativePath } from "../../src/import-meta-url-to-folder-jsenv-relative-path.js"
import { execute, launchChromium } from "../../index.js"
import { EXECUTION_TEST_PARAM } from "./execution-test-param.js"

const folderJsenvRelativePath = importMetaURLToFolderJsenvRelativePath(import.meta.url)
const compileIntoRelativePath = `${folderJsenvRelativePath}/.dist`
const fileRelativePath = `${folderJsenvRelativePath}/file.js`

const actual = await execute({
  ...EXECUTION_TEST_PARAM,
  compileIntoRelativePath,
  launch: launchChromium,
  fileRelativePath,
  stopOnceExecuted: true,
})

assert({ actual, expected: { status: "completed" } })
