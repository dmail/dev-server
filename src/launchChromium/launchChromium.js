// https://github.com/GoogleChrome/puppeteer/blob/master/docs/api.md

import { URL } from "url"
import puppeteer from "puppeteer"
import { createCancellationToken, createStoppableOperation } from "@dmail/cancellation"
import { createHTMLForBrowser } from "../createHTMLForBrowser.js"
import { startIndexServer } from "../server-index/startIndexServer.js"
import { originAsString } from "../server/index.js"
import { createPromiseAndHooks } from "../promiseHelper.js"
import { getBrowserPlatformRemoteURL } from "../platform/browser/remoteURL.js"
import { createPlatformSetupSource } from "../platform/browser/platformSource.js"

export const launchChromium = async ({
  cancellationToken = createCancellationToken(),
  // localRoot,
  remoteRoot,
  compileInto,

  protocol = "http",
  ip = "127.0.0.1",
  port = 0,
  startIndexRequestHandler = startIndexServer,
  headless = true,
  mirrorConsole = false,
}) => {
  if (startIndexRequestHandler === startIndexRequestInterception && headless === false) {
    throw new Error(`startIndexRequestInterception work only in headless mode`)
  }

  const options = {
    headless,
    // because we use a self signed certificate
    ignoreHTTPSErrors: true,
    // handleSIGINT: true,
    // handleSIGTERM: true,
    // handleSIGHUP: true,
    // because the 3 above are true by default pupeeter will auto close browser
    // so we apparently don't have to use listenNodeBeforeExit in order to close browser
    // as we do for server
  }

  const browser = await createStoppableOperation({
    cancellationToken,
    start: () => puppeteer.launch(options),
    stop: (browser) => browser.close(),
  })

  const targetTracker = createTargetTracker(browser)

  const disconnected = createPromiseAndHooks()
  // https://github.com/GoogleChrome/puppeteer/blob/v1.4.0/docs/api.md#event-disconnected
  browser.on("disconnected", disconnected.resolve)

  const errored = createPromiseAndHooks()

  let stopIndexServer = () => {}
  const stop = async (reason) => {
    await Promise.all([targetTracker.stop(reason), stopIndexServer(reason)])
    await browser.close()
  }

  browser.on("targetcreated", async (target) => {
    // https://github.com/GoogleChrome/puppeteer/blob/master/docs/api.md#class-target
    if (target.type === "page") {
      const page = await target.page()
      // https://github.com/GoogleChrome/puppeteer/blob/v1.4.0/docs/api.md#event-error
      page.on("error", errored.resolve)
      // https://github.com/GoogleChrome/puppeteer/blob/v1.4.0/docs/api.md#event-pageerror
      page.on("pageerror", errored.resolve)

      if (mirrorConsole) {
        page.on("console", (message) => {
          // there is also message._args
          // which is an array of JSHandle{ _context, _client _remoteObject }
          console[message._type](message._text)
        })
      }
    }
  })

  const fileToExecuted = async (file, options) => {
    const [page, html] = await Promise.all([
      browser.newPage(),
      createHTMLForBrowser({
        scriptRemoteList: [{ url: getBrowserPlatformRemoteURL({ remoteRoot, compileInto }) }],
        scriptInlineList: [
          {
            source: createPlatformSetupSource({
              remoteRoot,
              compileInto,
            }),
          },
        ],
      }),
    ])

    const { origin: indexOrigin, stop: indexStop } = await startIndexRequestHandler({
      cancellationToken,
      protocol,
      ip,
      port,
      page,
      body: html,
    })
    stopIndexServer = indexStop

    await page.goto(indexOrigin)
    const result = await page.evaluate(
      (file, options) => window.__platform__.importFile(file, options),
      file,
      options,
    )
    return result
  }

  return { options, disconnected, errored, stop, fileToExecuted }
}

const createTargetTracker = (browser) => {
  let stopCallbackArray = []

  // https://github.com/GoogleChrome/puppeteer/blob/master/docs/api.md#class-target
  browser.on("targetcreated", (target) => {
    if (target.type === "browser") {
      const childBrowser = target.browser()
      const childTargetTracker = createTargetTracker(childBrowser)
      stopCallbackArray = [...stopCallbackArray, (reason) => childTargetTracker.stop(reason)]
    }
    if (target.type === "page" || target.type === "background_page") {
      // in case of bug do not forget https://github.com/GoogleChrome/puppeteer/issues/2269
      stopCallbackArray = [
        ...stopCallbackArray,
        async () => {
          const page = await target.page()
          return page.close()
        },
      ]
      return
    }
  })

  const stop = async (reason) => {
    const callbacks = stopCallbackArray.slice()
    stopCallbackArray.length = 0
    await Promise.all(callbacks.map((callback) => callback(reason)))
  }

  return { stop }
}

const startIndexRequestInterception = async ({
  cancellationToken,
  protocol,
  ip,
  port,
  page,
  body,
}) => {
  const origin = originAsString({ protocol, ip, port })

  const interceptionOperation = createStoppableOperation({
    cancellationToken,
    start: () => page.setRequestInterception(true),
    stop: () => page.setRequestInterception(false),
  })
  await interceptionOperation

  page.on("request", (interceptedRequest) => {
    const url = new URL(interceptedRequest.url())
    if (url.origin !== origin) return

    interceptedRequest.respond({
      status: 200,
      contentType: "text/html",
      headers: {
        "content-type": "text/html",
        "content-length": Buffer.byteLength(body),
        "cache-control": "no-store",
      },
      body,
    })
  })

  const stop = interceptionOperation.stop

  return {
    origin,
    stop,
  }
}
