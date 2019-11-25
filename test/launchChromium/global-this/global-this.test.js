import { assert } from "@dmail/assert"
import { launchChromium } from "../../index.js"
import { selfHrefToFolderRelativePath } from "../self-href-to-folder-relative-path.js"
import {
  CHROMIUM_LAUNCHER_TEST_COMPILE_SERVER_PARAM,
  CHROMIUM_LAUNCHER_TEST_PUPPETEER_PARAM,
  CHROMIUM_LAUNCHER_TEST_EXECUTION_PARAM,
  CHROMIUM_LAUNCHER_TEST_LAUNCH_PARAM,
} from "../chromium-launcher-test-param.js"

const { startCompileServer } = import.meta.require("@jsenv/compile-server")
const { launchAndExecute } = import.meta.require("@jsenv/execution")

const folderRelativePath = selfHrefToFolderRelativePath(import.meta.url)
const compileIntoRelativePath = `${folderRelativePath}/.dist`
const fileRelativePath = `${folderRelativePath}/global-this.js`

const { origin: compileServerOrigin } = await startCompileServer({
  ...CHROMIUM_LAUNCHER_TEST_COMPILE_SERVER_PARAM,
  compileIntoRelativePath,
})

const actual = await launchAndExecute({
  ...CHROMIUM_LAUNCHER_TEST_LAUNCH_PARAM,
  ...CHROMIUM_LAUNCHER_TEST_PUPPETEER_PARAM,
  ...CHROMIUM_LAUNCHER_TEST_EXECUTION_PARAM,
  // stopOnceExecuted: false,
  launch: (options) =>
    launchChromium({
      ...CHROMIUM_LAUNCHER_TEST_LAUNCH_PARAM,
      ...options,
      compileServerOrigin,
      compileIntoRelativePath,
      // headless: false,
    }),
  fileRelativePath,
})
const expected = {
  status: "completed",
  namespace: {
    default: 42,
  },
}
assert({ actual, expected })
