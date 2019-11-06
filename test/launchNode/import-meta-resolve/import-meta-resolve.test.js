import { basename } from "path"
import { assert } from "@dmail/assert"
import { launchNode, startCompileServer, launchAndExecute } from "../../../index.js"
import { resolveDirectoryUrl, fileUrlToRelativePath } from "src/private/urlUtils.js"
import { jsenvCoreDirectoryUrl } from "src/private/jsenvCoreDirectoryUrl.js"
import {
  START_COMPILE_SERVER_TEST_PARAMS,
  EXECUTE_TEST_PARAMS,
  LAUNCH_TEST_PARAMS,
} from "../TEST_PARAMS.js"

const testDirectoryUrl = resolveDirectoryUrl("./", import.meta.url)
const testDirectoryRelativePath = fileUrlToRelativePath(testDirectoryUrl, jsenvCoreDirectoryUrl)
const testDirectoryBasename = basename(testDirectoryRelativePath)
const fileBasename = `${testDirectoryBasename}.js`
const compileDirectoryUrl = resolveDirectoryUrl("./.dist/", import.meta.url)
const fileRelativePath = `${testDirectoryRelativePath}${fileBasename}`

const { origin: compileServerOrigin } = await startCompileServer({
  ...START_COMPILE_SERVER_TEST_PARAMS,
  compileDirectoryUrl,
  importMapFileRelativePath: `${testDirectoryRelativePath}importMap.json`,
})

const actual = await launchAndExecute({
  ...EXECUTE_TEST_PARAMS,
  launch: (options) =>
    launchNode({
      ...LAUNCH_TEST_PARAMS,
      ...options,
      compileServerOrigin,
      compileDirectoryUrl,
    }),
  fileRelativePath,
})
const expected = {
  status: "completed",
  namespace: {
    basic: `${jsenvCoreDirectoryUrl}${testDirectoryRelativePath}file.js`,
    remapped: `${jsenvCoreDirectoryUrl}bar.js`,
  },
}
assert({ actual, expected })
