import { assert } from "@jsenv/assert"
import { resolveDirectoryUrl, urlToRelativeUrl } from "@jsenv/filesystem"

import { nodeRuntime } from "@jsenv/core"
import { jsenvCoreDirectoryUrl } from "@jsenv/core/src/internal/jsenvCoreDirectoryUrl.js"
import { startCompileServer } from "@jsenv/core/src/internal/compiling/startCompileServer.js"
import { launchAndExecute } from "@jsenv/core/src/internal/executing/launchAndExecute.js"
import {
  START_COMPILE_SERVER_TEST_PARAMS,
  LAUNCH_AND_EXECUTE_TEST_PARAMS,
  LAUNCH_TEST_PARAMS,
} from "@jsenv/core/test/TEST_PARAMS_LAUNCH_NODE.js"
import { removeAnnoyingLogs } from "@jsenv/core/test/removeAnnoyingLogs.js"

const testDirectoryUrl = resolveDirectoryUrl("./", import.meta.url)
const testDirectoryRelativePath = urlToRelativeUrl(
  testDirectoryUrl,
  jsenvCoreDirectoryUrl,
)
const jsenvDirectoryRelativeUrl = `${testDirectoryRelativePath}.jsenv/`
const filename = `execution_node_log.js`
const fileRelativeUrl = `${testDirectoryRelativePath}${filename}`
const { origin: compileServerOrigin, outDirectoryRelativeUrl } =
  await startCompileServer({
    ...START_COMPILE_SERVER_TEST_PARAMS,
    jsenvDirectoryRelativeUrl,
  })
const { status, consoleCalls } = await launchAndExecute({
  ...LAUNCH_AND_EXECUTE_TEST_PARAMS,
  runtime: nodeRuntime,
  runtimeParams: {
      ...LAUNCH_TEST_PARAMS,
      outDirectoryRelativeUrl,
      compileServerOrigin,
    }
  executeParams: {
    fileRelativeUrl,
  },
  captureConsole: true,
})

const actual = status
const expected = "completed"
assert({ actual, expected })

if (process.platform !== "win32") {
  const actual = removeAnnoyingLogs(consoleCalls).reduce(
    (previous, { text }) => {
      return `${previous}${text}`
    },
    "",
  )
  const expected = `foo
bar
`
  assert({ actual, expected })
}
