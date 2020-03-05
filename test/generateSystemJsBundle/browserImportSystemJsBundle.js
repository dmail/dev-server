import { startServer, firstService, serveFile } from "@jsenv/server"
import { resolveDirectoryUrl, resolveUrl, readFile } from "@jsenv/util"
import { require } from "../../src/internal/require.js"

const { chromium } = require("playwright-chromium")

const SYSTEM_PATH = require.resolve("systemjs/dist/system.js")

export const browserImportSystemJsBundle = async ({
  projectDirectoryUrl,
  testDirectoryRelativeUrl,
  htmlFileRelativeUrl = "./index.html",
  mainRelativeUrl,
  headless = true,
}) => {
  const testDirectoryUrl = resolveDirectoryUrl(testDirectoryRelativeUrl, projectDirectoryUrl)
  const [server, browser] = await Promise.all([
    startTestServer({ testDirectoryUrl }),
    chromium.launch({
      headless,
    }),
  ])

  const page = await browser.newPage({ ignoreHTTPSErrors: true })
  await page.goto(resolveUrl(htmlFileRelativeUrl, server.origin))

  try {
    const namespace = await page.evaluate(
      /* istanbul ignore next */
      ({ specifier }) => {
        return window.System.import(specifier)
      },
      {
        specifier: mainRelativeUrl,
      },
    )
    return {
      namespace,
      serverOrigin: server.origin,
    }
  } finally {
    browser.close()
    server.stop()
  }
}

const startTestServer = ({ testDirectoryUrl }) => {
  return startServer({
    logLevel: "off",
    protocol: "https",
    requestToResponse: (request) =>
      firstService(
        () => serveSystemJS({ request }),
        () => serveTestDirectory({ testDirectoryUrl, request }),
      ),
  })
}

const serveSystemJS = async ({ request: { ressource } }) => {
  if (ressource !== "/system.js") return null

  const content = await readFile(SYSTEM_PATH)

  return {
    status: 200,
    headers: {
      "cache-control": "no-store",
      "content-type": "application/javascript",
      "content-length": Buffer.byteLength(content),
    },
    body: content,
  }
}

const serveTestDirectory = ({ testDirectoryUrl, request: { ressource, method, headers } }) =>
  serveFile(resolveUrl(ressource.slice(1), testDirectoryUrl), {
    method,
    headers,
  })
