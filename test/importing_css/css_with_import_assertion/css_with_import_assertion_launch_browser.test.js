import { assert } from "@jsenv/assert"
import { resolveUrl, urlToRelativeUrl } from "@jsenv/filesystem"

import {
  execute,
  chromiumRuntime,
  firefoxRuntime,
  webkitRuntime,
} from "@jsenv/core"
import { jsenvCoreDirectoryUrl } from "@jsenv/core/src/internal/jsenvCoreDirectoryUrl.js"
import {
  EXECUTE_TEST_PARAMS,
  LAUNCH_TEST_PARAMS,
} from "@jsenv/core/test/TEST_PARAMS_LAUNCH_BROWSER.js"
import { launchBrowsers } from "@jsenv/core/test/launchBrowsers.js"

const testDirectoryUrl = resolveUrl("./", import.meta.url)
const testDirectoryRelativeUrl = urlToRelativeUrl(
  testDirectoryUrl,
  jsenvCoreDirectoryUrl,
)
const jsenvDirectoryRelativeUrl = `${testDirectoryRelativeUrl}.jsenv/`
const htmlFilename = `main.html`
const htmlFileRelativeUrl = `${testDirectoryRelativeUrl}${htmlFilename}`
const imgRelativeUrl = `${testDirectoryRelativeUrl}src/jsenv.png`

await launchBrowsers(
  [
    // comment force multiline
    chromiumRuntime,
    firefoxRuntime,
    webkitRuntime,
  ],
  async (browserRuntime) => {
    const { status, namespace, compileServerOrigin, outDirectoryRelativeUrl } =
      await execute({
        ...EXECUTE_TEST_PARAMS,
        jsenvDirectoryRelativeUrl,
        launchAndExecuteLogLevel: "off",
        runtime: browserRuntime,
        runtimeParams: {
          ...LAUNCH_TEST_PARAMS,
          // headless: false,
        },
        // stopAfterExecute: false,
        fileRelativeUrl: htmlFileRelativeUrl,
      })
    const imgCompiledRelativeUrl = `${outDirectoryRelativeUrl}best/${imgRelativeUrl}`
    const imgCompiledUrl = resolveUrl(
      imgCompiledRelativeUrl,
      compileServerOrigin,
    )

    const actual = {
      status,
      namespace,
    }
    const expected = {
      status: "completed",
      namespace: {
        "./main.html__inline__10.js": {
          status: "completed",
          namespace: {
            bodyBackgroundColor: "rgb(255, 0, 0)",
            bodyBackgroundImage: `url("${imgCompiledUrl}")`,
          },
        },
      },
    }
    assert({ actual, expected })
  },
)
