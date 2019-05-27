import { assert } from "@dmail/assert"
import { importMetaURLToFolderJsenvRelativePath } from "../../../src/import-meta-url-to-folder-jsenv-relative-path.js"
import { startCompileServer } from "../../../index.js"
import { COMPILE_SERVER_TEST_PARAM } from "../compile-server-test-param.js"
import { fetch } from "../fetch.js"

const folderJsenvRelativePath = importMetaURLToFolderJsenvRelativePath(import.meta.url)
const compileIntoRelativePath = `${folderJsenvRelativePath}/.dist`
const compileId = "otherwise"
const fileRelativePath = `${folderJsenvRelativePath}/asset.js`

const compileServer = await startCompileServer({
  ...COMPILE_SERVER_TEST_PARAM,
  compileIntoRelativePath,
})

const fileCompileHref = `${
  compileServer.origin
}${compileIntoRelativePath}/${compileId}${fileRelativePath}`

await fetch(fileCompileHref)
const response = await fetch(`${fileCompileHref}__asset__/cache.json`)
const body = await response.json()
const actual = {
  status: response.status,
  statusText: response.statusText,
  headers: response.headers,
  body,
}
const expected = {
  status: 200,
  statusText: "OK",
  headers: {
    ...actual.headers,
    "content-type": ["application/json"],
  },
  body: {
    sourceRelativePath: fileRelativePath,
    contentType: "application/javascript",
    sources: [fileRelativePath],
    sourcesEtag: ['"7c-b5QcrFoIrKrXSr5F415m5RCd6uY"'],
    assets: ["asset.js__asset__/asset.js.map"],
    assetsEtag: ['"ef-75BqORiC83xOSvN0IYRfLmcxtEw"'],
    createdMs: actual.body.createdMs,
    lastModifiedMs: actual.body.lastModifiedMs,
  },
}

assert({
  actual,
  expected,
})
