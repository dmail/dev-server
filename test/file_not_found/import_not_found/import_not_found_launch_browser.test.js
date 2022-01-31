import {
  resolveUrl,
  resolveDirectoryUrl,
  urlToRelativeUrl,
} from "@jsenv/filesystem"
import { assert } from "@jsenv/assert"

import {
  execute,
  chromiumRuntime,
  firefoxRuntime,
  webkitRuntime,
} from "@jsenv/core"
import { jsenvCoreDirectoryUrl } from "@jsenv/core/src/jsenv_file_urls.js"
import { launchBrowsers } from "@jsenv/core/test/launchBrowsers.js"
import {
  EXECUTE_TEST_PARAMS,
  LAUNCH_TEST_PARAMS,
} from "@jsenv/core/test/TEST_PARAMS_LAUNCH_BROWSER.js"

const testDirectoryUrl = resolveDirectoryUrl("./", import.meta.url)
const testDirectoryRelativeUrl = urlToRelativeUrl(
  testDirectoryUrl,
  jsenvCoreDirectoryUrl,
)
const jsenvDirectoryRelativeUrl = `${testDirectoryRelativeUrl}.jsenv/`
const htmlFileRelativeUrl = `${testDirectoryRelativeUrl}import_not_found.html`
const mainFileRelativeUrl = `${testDirectoryRelativeUrl}import_not_found.js`
const importerFileRelativeUrl = `${testDirectoryRelativeUrl}intermediate.js`
const importedFileRelativeUrl = `${testDirectoryRelativeUrl}foo.js`

await launchBrowsers(
  [
    // comment force multiline
    chromiumRuntime,
    firefoxRuntime,
    webkitRuntime,
  ],
  async (browserRuntime) => {
    const { status, error } = await execute({
      ...EXECUTE_TEST_PARAMS,
      jsenvDirectoryRelativeUrl,
      launchAndExecuteLogLevel: "off",
      runtime: browserRuntime,
      runtimeParams: {
        ...LAUNCH_TEST_PARAMS,
      },
      fileRelativeUrl: htmlFileRelativeUrl,
      collectCompileServerInfo: true,
      ignoreError: true,
      // runtimeParams: {
      //   headless: false,
      // },
      // stopAfterExecute: false,
    })

    if (browserRuntime === chromiumRuntime) {
      const mainFileUrl = resolveUrl(mainFileRelativeUrl, jsenvCoreDirectoryUrl)
      const actual = {
        status,
        errorMessage: error.message,
      }
      const expected = {
        status: "errored",
        errorMessage: `Failed to fetch dynamically imported module: ${mainFileUrl}`,
      }
      assert({ actual, expected })
      return
    }

    const importedFileUrl = `${jsenvCoreDirectoryUrl}${jsenvDirectoryRelativeUrl}out/${importedFileRelativeUrl}`
    const actual = {
      status,
      errorName: error.name,
      errorMessage: error.message,
    }
    const expected = {
      status: "errored",
      errorName: "Error",
      errorMessage: `JavaScript module file cannot be found
--- import declared in ---
${importerFileRelativeUrl}
--- file ---
${importedFileRelativeUrl}
--- file url ---
${importedFileUrl}`,
    }
    assert({ actual, expected })
  },
)
