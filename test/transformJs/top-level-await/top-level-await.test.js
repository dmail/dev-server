import { readFileSync } from "fs"
import { basename } from "path"
import { assert } from "@jsenv/assert"
import { fileUrlToPath, resolveDirectoryUrl } from "src/internal/urlUtils.js"
import { transformJs } from "src/internal/compile-server/js-compilation-service/transformJs.js"
import { TRANSFORM_JS_TEST_PARAMS } from "../TEST_PARAMS.js"

const testDirectoryUrl = resolveDirectoryUrl("./", import.meta.url)
const testDirectoryBasename = basename(testDirectoryUrl)
const fileBasename = `${testDirectoryBasename}.js`
const fileUrl = import.meta.resolve(`./${fileBasename}`)
const filePath = fileUrlToPath(fileUrl)
const fileContent = readFileSync(filePath).toString()

const { code } = await transformJs({
  ...TRANSFORM_JS_TEST_PARAMS,
  code: fileContent,
  url: fileUrl,
})
const actual = code.indexOf("async function")
const expected = -1
assert({ actual, expected })
