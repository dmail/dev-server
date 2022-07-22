import { writeFileSync } from "node:fs"
import { chromium } from "playwright"

process.env.GENERATING_SNAPSHOTS = "true"
const { devServer } = await import("./start_dev_server.mjs")
const browser = await chromium.launch({ headless: true })

const generateHtmlForStory = async ({ story, preferServerErrorReporting }) => {
  const page = await browser.newPage()
  await page.goto(`${devServer.origin}/${story}/main.html`)
  await page.waitForSelector("jsenv-error-overlay")
  if (preferServerErrorReporting) {
    // wait a bit more to let server error replace browser error
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  const htmlGenerated = await page.evaluate(
    /* eslint-disable no-undef */
    async () => {
      const outerHtml = document
        .querySelector("jsenv-error-overlay")
        .shadowRoot.querySelector(".overlay").outerHTML
      return outerHtml
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, `"`)
        .replace(/&#039;/g, `'`)
    },
    /* eslint-enable no-undef */
  )
  await page.setViewportSize({ width: 900, height: 550 }) // generate smaller screenshots
  const sceenshotBuffer = await page.locator("jsenv-error-overlay").screenshot()
  writeFileSync(
    new URL(`./snapshots/${story}.png`, import.meta.url),
    sceenshotBuffer,
  )
  writeFileSync(
    new URL(`./snapshots/${story}.html`, import.meta.url),
    htmlGenerated,
  )
  await page.close()
}

try {
  await generateHtmlForStory({
    story: "js_export_not_found",
  })
  await generateHtmlForStory({
    story: "js_import_not_found",
    preferServerErrorReporting: true,
  })
  await generateHtmlForStory({
    story: "js_import_syntax_error",
    preferServerErrorReporting: true,
  })
  await generateHtmlForStory({
    story: "js_throw",
  })
  await generateHtmlForStory({
    story: "plugin_error_transform",
    preferServerErrorReporting: true,
  })
  await generateHtmlForStory({
    story: "script_module_inline_export_not_found",
  })
  await generateHtmlForStory({
    story: "script_module_inline_import_not_found",
    preferServerErrorReporting: true,
  })
  await generateHtmlForStory({
    story: "script_module_inline_syntax_error",
    preferServerErrorReporting: true,
  })
  await generateHtmlForStory({
    story: "script_module_inline_throw",
  })
  await generateHtmlForStory({
    story: "script_src_not_found",
  })
} finally {
  browser.close()
  devServer.stop()
}
