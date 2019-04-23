import { fileRead } from "@dmail/helper"
import { serveFile } from "../../src/file-service/index.js"
import { startServer, serviceCompose } from "../../src/server/index.js"
import { SYSTEM_FILENAME } from "../../src/system-service/index.js"

const puppeteer = import.meta.require("puppeteer")

export const importBrowserBundle = async ({ bundleFolder, file }) => {
  const [server, browser] = await Promise.all([
    startTestServer({ bundleFolder }),
    puppeteer.launch(),
  ])

  const page = await browser.newPage()
  await page.goto(`${server.origin}/`)

  try {
    const namespace = await page.evaluate(
      ({ specifier }) => {
        // eslint-disable-next-line no-undef
        return System.import(specifier)
      },
      {
        specifier: `./${file}`,
      },
    )
    return { namespace, serverOrigin: server.origin }
  } finally {
    browser.close()
    server.stop()
  }
}

const startTestServer = ({ bundleFolder }) => {
  const indexPageService = ({ method, ressource }) => {
    if (method !== "GET") return null
    if (ressource !== "/") return null

    const html = genereateIndexPage()

    return {
      status: 200,
      headers: {
        "cache-control": "no-store",
        "content-type": "text/html",
        "content-length": Buffer.byteLength(html),
      },
      body: html,
    }
  }

  const systemJSService = async ({ ressource }) => {
    if (ressource !== "/system.js") return null

    const content = await fileRead(SYSTEM_FILENAME)

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

  return startServer({
    verbose: false,
    requestToResponse: serviceCompose(
      indexPageService,
      systemJSService,
      ({ ressource, method, headers }) =>
        serveFile(`${bundleFolder}${ressource}`, { method, headers }),
    ),
  })
}

const genereateIndexPage = () => `<!doctype html>

<head>
  <title>Untitled</title>
  <meta charset="utf-8" />
</head>

<body>
  <main></main>
  <script src="system.js"></script>
</body>

</html>`
