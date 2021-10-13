import { assert } from "@jsenv/assert"
import {
  resolveDirectoryUrl,
  urlToRelativeUrl,
  urlToBasename,
} from "@jsenv/filesystem"

import { chromiumRuntime, firefoxRuntime, webkitRuntime } from "@jsenv/core"
import { jsenvCoreDirectoryUrl } from "@jsenv/core/src/internal/jsenvCoreDirectoryUrl.js"
import { startCompileServer } from "@jsenv/core/src/internal/compiling/startCompileServer.js"
import { launchAndExecute } from "@jsenv/core/src/internal/executing/launchAndExecute.js"
import {
  START_COMPILE_SERVER_TEST_PARAMS,
  EXECUTION_TEST_PARAMS,
  LAUNCH_TEST_PARAMS,
} from "@jsenv/core/test/TEST_PARAMS_LAUNCH_BROWSER.js"
import { launchBrowsers } from "@jsenv/core/test/launchBrowsers.js"

const testDirectoryUrl = resolveDirectoryUrl("./", import.meta.url)
const testDirectoryRelativeUrl = urlToRelativeUrl(
  testDirectoryUrl,
  jsenvCoreDirectoryUrl,
)
const testDirectoryname = urlToBasename(testDirectoryRelativeUrl)
const jsenvDirectoryRelativeUrl = `${testDirectoryRelativeUrl}.jsenv`
const filename = `${testDirectoryname}.html`
const fileRelativeUrl = `${testDirectoryRelativeUrl}${filename}`
const { origin: compileServerOrigin, outDirectoryRelativeUrl } =
  await startCompileServer({
    ...START_COMPILE_SERVER_TEST_PARAMS,
    // compileServerLogLevel: "info",
    jsenvDirectoryRelativeUrl,
  })

await launchBrowsers(
  [
    // ensure multiline
    chromiumRuntime,
    firefoxRuntime,
    webkitRuntime,
  ],
  async (browserRuntime) => {
    const actual = await launchAndExecute({
      ...EXECUTION_TEST_PARAMS,
      runtime: browserRuntime,
      runtimeParams: {
        ...LAUNCH_TEST_PARAMS,
        outDirectoryRelativeUrl,
        compileServerOrigin,
        // headless: false,
      },
      executeParams: {
        fileRelativeUrl,
      },
      captureConsole: true,
      stopAfterExecute: true,
    })
    const expected = {
      status: "completed",
      namespace: {
        [`./${testDirectoryname}.js`]: {
          status: "completed",
          namespace: {},
        },
      },
      consoleCalls: [
        {
          type: "log",
          text: `foo
`,
        },
        {
          type: "log",
          text: `bar
`,
        },
      ],
    }
    assert({ actual, expected })
  },
)
