import { assert } from "@dmail/assert"
import { fileHrefToFolderRelativePath } from "../../fileHrefToFolderRelativePath.js"
import { startCompileServer } from "../../../index.js"
import { COMPILE_SERVER_TEST_PARAM } from "../../compile-server-test-param.js"
import { fetch } from "../../fetch.js"

const folderRelativePath = fileHrefToFolderRelativePath(import.meta.url)
const compileIntoRelativePath = `${folderRelativePath}/.dist`
const compileId = "otherwise"
const fileRelativePath = `${folderRelativePath}/file.js`

const compileServer = await startCompileServer({
  ...COMPILE_SERVER_TEST_PARAM,
  compileIntoRelativePath,
})

const response = await fetch(
  `${compileServer.origin}${compileIntoRelativePath}/${compileId}${fileRelativePath}`,
)
const body = await response.text()
const actual = {
  status: response.status,
  statusText: response.statusText,
  headers: response.headers,
  body,
}
const expected = {
  status: 404,
  statusText: "file not found",
  headers: actual.headers,
  body: "",
}
assert({ actual, expected })
