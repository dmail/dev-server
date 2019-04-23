import { assert } from "@dmail/assert"
import { ROOT_FOLDER } from "../../../src/ROOT_FOLDER.js"
import { hrefToFolderJsenvRelative } from "../../../src/hrefToFolderJsenvRelative.js"
import { startCompileServer } from "../../../index.js"
import { fetch } from "../fetch.js"

const rimraf = import.meta.require("rimraf")

const projectFolder = ROOT_FOLDER
const testFolderRelative = hrefToFolderJsenvRelative(import.meta.url)
const serverCompileInto = `${testFolderRelative}/.dist`
const clientCompileInto = ".dist"

const compileServer = await startCompileServer({
  projectFolder,
  serverCompileInto,
  clientCompileInto,
  verbose: false,
})

await new Promise((resolve, reject) =>
  rimraf(`${projectFolder}/${serverCompileInto}`, (error) => {
    if (error) reject(error)
    else resolve()
  }),
)
const firstResponse = await fetch(
  `${compileServer.origin}/${clientCompileInto}/otherwise/${testFolderRelative}/file.js`,
)
const secondResponse = await fetch(
  `${compileServer.origin}/${clientCompileInto}/otherwise/${testFolderRelative}/file.js`,
  {
    headers: {
      "if-none-match": firstResponse.headers.etag[0],
    },
  },
)
const actual = {
  status: secondResponse.status,
  statusText: secondResponse.statusText,
  headers: secondResponse.headers,
}
const expected = {
  status: 304,
  statusText: "Not Modified",
  headers: actual.headers,
}

assert({
  actual,
  expected,
})
