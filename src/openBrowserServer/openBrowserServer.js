import { openCompileServer } from "../openCompileServer/openCompileServer.js"
import { createPredicateFromStructure } from "../openCompileServer/createPredicateFromStructure.js"
import { openServer, createRoute, createResponseGenerator } from "../openServer/index.js"
import { createHTMLForBrowser } from "../createHTMLForBrowser.js"
import { urlToPathname } from "../urlHelper.js"

const getIndexPageHTML = ({ root }) => {
  return `<!doctype html>

  <head>
    <title>${root}</title>
    <meta charset="utf-8" />
  </head>

  <body>
    <main>
      This is the root your project: ${root} <br />
      You can execute file by navigating like <a href="./src/__test__/file.js">src/__test__/file.js</a>
    </main>
  </body>

  </html>`
}

const getClientScript = ({ remoteRoot, remoteCompileDestination, file, hotreload }) => {
  const execute = (remoteRoot, remoteCompileDestination, file, hotreload) => {
    const remoteFile = `${remoteRoot}/${remoteCompileDestination}/${file}`
    let failedImportFile

    if (hotreload) {
      var eventSource = new window.EventSource(remoteRoot, { withCredentials: true })
      eventSource.onerror = () => {
        // we could try to reconnect several times before giving up
        // but dont keep it open as it would try to reconnect forever
        eventSource.close()
      }
      eventSource.addEventListener("file-changed", (e) => {
        if (e.origin !== remoteRoot) {
          return
        }
        const fileChanged = e.data
        const changedFileLocation = `${remoteRoot}/${remoteCompileDestination}/${fileChanged}`
        // we cmay be notified from file we don't care about, reload only if needed
        // we cannot just System.delete the file because the change may have any impact, we have to reload
        if (failedImportFile === fileChanged || window.System.get(changedFileLocation)) {
          window.location.reload()
        }
      })
    }

    // `Error: yo
    // at Object.execute (http://127.0.0.1:57300/build/src/__test__/file-throw.js:9:13)
    // at doExec (http://127.0.0.1:3000/src/__test__/file-throw.js:452:38)
    // at postOrderExec (http://127.0.0.1:3000/src/__test__/file-throw.js:448:16)
    // at http://127.0.0.1:3000/src/__test__/file-throw.js:399:18`.replace(/(?:https?|ftp|file):\/\/(.*+)$/gm, (...args) => {
    //   debugger
    // })

    const link = (url, text = url) => `<a href="${url}">${text}</a>`

    const autoLink = (source) => {
      return source.replace(/(?:https?|ftp|file):\/\/.*?$/gm, (match) => {
        // remove lineNumber. columnNumber and possible last ) from url
        const url = match.replace(/(?::[0-9]+)?:[0-9]*\)?$/, "")
        // const sourceURL = url.replace(`${remoteRoot}/${remoteCompileDestination}`, remoteRoot)

        return link(url, match)
      })
    }

    const getErrorMeta = (error) => {
      if (error && error.status === 500 && error.reason === "parse error") {
        const parseError = JSON.parse(error.body)
        const file = parseError.fileName
        const message = parseError.message
        const data = message.replace(
          file,
          link(`${remoteRoot}/${failedImportFile}`, failedImportFile),
        )

        return {
          file,
          data,
        }
      }

      if (error && error.code === "MODULE_INSTANTIATE_ERROR") {
        const file = error.url.slice(`${remoteRoot}/${remoteCompileDestination}`.length) // to be tested
        const originalError = error.error
        return {
          file,
          data:
            originalError && originalError instanceof Error
              ? autoLink(originalError.stack)
              : JSON.stringify(originalError),
        }
      }

      return {
        data: error && error instanceof Error ? autoLink(error.stack) : JSON.stringify(error),
      }
    }

    window.System.import(remoteFile).catch((error) => {
      const meta = getErrorMeta(error)
      failedImportFile = meta.file

      document.body.innerHTML = `<h1><a href="${remoteRoot}/${file}">${file}</a> import rejected</h1>
      <pre style="border: 1px solid black">${meta.data}</pre>`

      return Promise.reject(error)
    })
  }

  const source = `(${execute.toString()})("${remoteRoot}", "${remoteCompileDestination}", "${file}", ${hotreload})`
  // ${"//#"} sourceURL= ${remoteRoot}/${remoteCompileDestination}/${file}
  return source
}

const getPageHTML = (options) => {
  return createHTMLForBrowser({
    script: getClientScript(options),
  })
}

export const openBrowserServer = ({
  protocol = "http",
  ip = "127.0.0.1",
  port = 3000,
  forcePort = true,
  watch = false,

  root,
  into,
  compileProtocol = "http",
  compileIp = "127.0.0.1",
  compilePort = 0,
}) => {
  return createPredicateFromStructure({ root }).then(({ instrumentPredicate, watchPredicate }) => {
    return openCompileServer({
      root,
      into,
      protocol: compileProtocol,
      ip: compileIp,
      port: compilePort,
      instrumentPredicate,
      watch,
      watchPredicate,
    }).then((server) => {
      console.log(`compiling ${root} at ${server.origin}`)

      const indexRoute = createRoute({
        method: "GET",
        path: "/",
        handler: () => {
          return Promise.resolve()
            .then(() => getIndexPageHTML({ root }))
            .then((html) => {
              return {
                status: 200,
                headers: {
                  "cache-control": "no-store",
                  "content-type": "text/html",
                  "content-length": Buffer.byteLength(html),
                },
                body: html,
              }
            })
        },
      })

      const otherRoute = createRoute({
        method: "GET",
        path: "*",
        handler: ({ url }) => {
          return Promise.resolve()
            .then(() =>
              getPageHTML({
                localRoot: root,
                remoteRoot: server.origin,
                remoteCompileDestination: into,
                file: urlToPathname(url).slice(1),
                hotreload: watch,
              }),
            )
            .then((html) => {
              return {
                status: 200,
                headers: {
                  "cache-control": "no-store",
                  "content-type": "text/html",
                  "content-length": Buffer.byteLength(html),
                },
                body: html,
              }
            })
        },
      })

      return openServer({
        protocol,
        ip,
        port,
        forcePort,
        getResponseForRequest: createResponseGenerator(indexRoute, otherRoute),
      }).then((runServer) => {
        console.log(`executing ${root} at ${runServer.origin}`)
        return runServer
      })
    })
  })
}
