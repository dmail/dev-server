import { assert } from "@dmail/assert"
import { launchNode, launchNodeProjectPathname } from "../../index.js"
import { selfHrefToFolderRelativePath } from "../self-href-to-folder-relative-path.js"
import {
  NODE_LAUNCHER_TEST_COMPILE_SERVER_PARAM,
  NODE_LAUNCHER_TEST_LAUNCH_PARAM,
  NODE_LAUNCHER_TEST_PARAM,
} from "../node-launcher-test-param.js"

const { startCompileServer } = import.meta.require("@jsenv/compile-server")
const { launchAndExecute } = import.meta.require("@jsenv/execution")

const folderRelativePath = selfHrefToFolderRelativePath(import.meta.url)
const compileIntoRelativePath = `${folderRelativePath}/.dist`
const fileRelativePath = `${folderRelativePath}/import-meta-url.js`

const { origin: compileServerOrigin } = await startCompileServer({
  ...NODE_LAUNCHER_TEST_COMPILE_SERVER_PARAM,
  compileIntoRelativePath,
})

const actual = await launchAndExecute({
  ...NODE_LAUNCHER_TEST_LAUNCH_PARAM,
  launch: (options) =>
    launchNode({
      ...NODE_LAUNCHER_TEST_PARAM,
      ...options,
      compileServerOrigin,
      compileIntoRelativePath,
    }),
  fileRelativePath,
})
const expected = {
  status: "completed",
  namespace: {
    default: `file://${launchNodeProjectPathname}${fileRelativePath}`,
  },
}
assert({ actual, expected })
