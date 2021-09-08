import { createRequire } from "module"

import { resolveUrl } from "@jsenv/filesystem"
import { startServer, serveFile } from "@jsenv/server"

const require = createRequire(import.meta.url)
const { chromium } = require("playwright")

const directoryUrl = resolveUrl("./", import.meta.url)

const server = await startServer({
  requestToResponse: (request) => {
    return serveFile(request, {
      rootDirectoryUrl: directoryUrl,
      canReadDirectory: true,
    })
  },
})

const browser = await chromium.launch()
const page = await browser.newPage()
await page.coverage.startJSCoverage()
await page.goto(`${server.origin}/playwright-coverage.html`)
await new Promise((resolve) => {
  setTimeout(resolve, 2000)
})
const coverages = await page.coverage.stopJSCoverage()
console.log(coverages)
// eslint-disable-next-line no-debugger
debugger
await browser.close()
