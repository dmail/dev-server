import { basename } from "path"
import { assert } from "@jsenv/assert"
import { resolveDirectoryUrl, urlToRelativeUrl } from "internal/urlUtils.js"
import { jsenvCoreDirectoryUrl } from "internal/jsenvCoreDirectoryUrl.js"
import { startExploring } from "../../../index.js"
import { openBrowserPage } from "../openBrowserPage.js"
import { START_EXPLORING_TEST_PARAMS } from "../TEST_PARAMS.js"

const testDirectoryUrl = resolveDirectoryUrl("./", import.meta.url)
const testDirectoryRelativePath = urlToRelativeUrl(testDirectoryUrl, jsenvCoreDirectoryUrl)
const testDirectoryBasename = basename(testDirectoryRelativePath)
const jsenvDirectoryRelativeUrl = `${testDirectoryRelativePath}.jsenv/`
const htmlFileUrl = import.meta.resolve("../template.html")
const htmlFileRelativeUrl = urlToRelativeUrl(htmlFileUrl, jsenvCoreDirectoryUrl)
const filename = `${testDirectoryBasename}.main.js`
const fileRelativeUrl = `${testDirectoryRelativePath}${filename}`

const { origin: browserExplorerServerOrigin } = await startExploring({
  ...START_EXPLORING_TEST_PARAMS,
  jsenvDirectoryRelativeUrl,
  htmlFileUrl,
})
const { browser, pageLogs, pageErrors, executionResult } = await openBrowserPage(
  `${browserExplorerServerOrigin}/${htmlFileRelativeUrl}?file=${fileRelativeUrl}`,
)
const actual = { pageLogs, pageErrors, executionResult }
const expected = {
  pageLogs: [
    { type: "log", text: "42" },
    { type: "log", text: "bar" },
  ],
  pageErrors: [],
  executionResult: {
    status: "completed",
    namespace: { default: 42 },
  },
}
assert({ actual, expected })
browser.close()
