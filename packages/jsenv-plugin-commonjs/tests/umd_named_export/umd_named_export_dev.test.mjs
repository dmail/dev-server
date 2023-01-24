import { chromium } from "playwright"
import { assert } from "@jsenv/assert"
import { startDevServer } from "@jsenv/core"
import { launchBrowserPage } from "@jsenv/core/tests/launch_browser_page.js"

import { jsenvPluginCommonJs } from "@jsenv/plugin-commonjs"

const debug = false // true to have browser UI + keep it open after test
const devServer = await startDevServer({
  logLevel: "warn",
  rootDirectoryUrl: new URL("./client/", import.meta.url),
  keepProcessAlive: false,
  plugins: [
    jsenvPluginCommonJs({
      include: {
        "./lib.js": true,
      },
    }),
  ],
  clientAutoreload: false,
  supervisor: false,
})
const browser = await chromium.launch({
  headless: !debug,
})
try {
  const page = await launchBrowserPage(browser)
  await page.goto(`${devServer.origin}/main.html`)
  const actual = await page.evaluate(
    /* eslint-disable no-undef */
    () => window.resultPromise,
    /* eslint-enable no-undef */
  )
  const expected = 42
  assert({ actual, expected })
} finally {
  if (!debug) {
    browser.close()
  }
}
