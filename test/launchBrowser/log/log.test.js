import { basename } from "path"
import { assert } from "@jsenv/assert"
import { resolveDirectoryUrl, urlToRelativeUrl } from "@jsenv/util"
import { jsenvCoreDirectoryUrl } from "../../../src/internal/jsenvCoreDirectoryUrl.js"
import { startCompileServer } from "../../../src/internal/compiling/startCompileServer.js"
import { launchAndExecute } from "../../../src/internal/executing/launchAndExecute.js"
import { launchChromium, launchFirefox, launchWebkit } from "../../../index.js"
import {
  START_COMPILE_SERVER_TEST_PARAMS,
  EXECUTION_TEST_PARAMS,
  LAUNCH_TEST_PARAMS,
} from "../TEST_PARAMS.js"

const testDirectoryUrl = resolveDirectoryUrl("./", import.meta.url)
const testDirectoryRelativeUrl = urlToRelativeUrl(testDirectoryUrl, jsenvCoreDirectoryUrl)
const testDirectoryname = basename(testDirectoryRelativeUrl)
const jsenvDirectoryRelativeUrl = `${testDirectoryRelativeUrl}.jsenv`
const filename = `${testDirectoryname}.js`
const fileRelativeUrl = `${testDirectoryRelativeUrl}${filename}`
const { origin: compileServerOrigin, outDirectoryRelativeUrl } = await startCompileServer({
  ...START_COMPILE_SERVER_TEST_PARAMS,
  jsenvDirectoryRelativeUrl,
})

// chromium
{
  const actual = await launchAndExecute({
    ...EXECUTION_TEST_PARAMS,
    launch: (options) =>
      launchChromium({
        ...LAUNCH_TEST_PARAMS,
        ...options,
        outDirectoryRelativeUrl,
        compileServerOrigin,
        // headless: false,
      }),
    fileRelativeUrl,
    captureConsole: true,
    collectNamespace: false,
    // stopPlatformAfterExecute: false,
  })
  const expected = {
    status: "completed",
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
}
// firefox
{
  const actual = await launchAndExecute({
    ...EXECUTION_TEST_PARAMS,
    launch: (options) =>
      launchFirefox({
        ...LAUNCH_TEST_PARAMS,
        ...options,
        outDirectoryRelativeUrl,
        compileServerOrigin,
        // headless: false,
      }),
    fileRelativeUrl,
    captureConsole: true,
    collectNamespace: false,
    // stopPlatformAfterExecute: false,
  })
  const expected = {
    status: "completed",
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
}
// webkit
{
  const actual = await launchAndExecute({
    ...EXECUTION_TEST_PARAMS,
    launch: (options) =>
      launchWebkit({
        ...LAUNCH_TEST_PARAMS,
        ...options,
        outDirectoryRelativeUrl,
        compileServerOrigin,
        // headless: false,
      }),
    fileRelativeUrl,
    captureConsole: true,
    collectNamespace: false,
    // stopPlatformAfterExecute: false,
  })
  const expected = {
    status: "completed",
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
}
