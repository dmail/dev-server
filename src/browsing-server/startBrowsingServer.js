import { patternGroupToMetaMap, forEachRessourceMatching } from "@dmail/project-structure"
import { uneval } from "@dmail/uneval"
import { createCancellationToken } from "@dmail/cancellation"
import { startServer, createRequestPredicate, serviceCompose } from "../server/index.js"
import { startCompileServer } from "../server-compile/index.js"
import { guard } from "../functionHelper.js"
import { getBrowserPlatformRemoteURL } from "../platform/browser/remoteURL.js"

export const startBrowsingServer = async ({
  cancellationToken = createCancellationToken(),
  root,
  compileInto,
  compileGroupCount,
  pluginMap,
  browsableDescription,
  localCacheStrategy,
  localCacheTrackHit,
  cacheStrategy,
  instrumentPredicate,
  watch,
  watchPredicate,
  sourceCacheStrategy = "etag",
  sourceCacheIgnore = false,
  preventCors = false,
  protocol = "http",
  ip = "127.0.0.1",
  port = 3000,
  forcePort = true,
  signature,

  generateHTML = ({ file, remoteRoot, compileInto, browserPlatformRemoteURL }) => {
    return `<!doctype html>

<head>
  <title>Untitled</title>
  <meta charset="utf-8" />
</head>

<body>
  <main></main>
  <script src="${browserPlatformRemoteURL}"></script>
  <script type="text/javascript">
    window.__platform__.importCompiledFile({
      "compileInto": ${uneval(compileInto)},
      "remoteRoot": ${uneval(remoteRoot)},
      "file": ${uneval(file)}
    })
  </script>
</body>

</html>`
  },
}) => {
  const metaMap = patternGroupToMetaMap({
    browsable: browsableDescription,
  })

  const browsablePathnameArray = await forEachRessourceMatching({
    localRoot: root,
    metaMap,
    predicate: ({ browsable }) => browsable,
  })

  const { origin: remoteRoot } = await startCompileServer({
    cancellationToken,
    root,
    compileInto,
    compileGroupCount,
    pluginMap,
    localCacheStrategy,
    localCacheTrackHit,
    cacheStrategy,
    instrumentPredicate,
    watch,
    watchPredicate,
    sourceCacheStrategy,
    sourceCacheIgnore,
    preventCors,
    protocol,
    ip,
    port: 0, // random available port
    forcePort: false, // no need because random port
    signature,
  })

  const indexRoute = guard(
    createRequestPredicate({
      ressource: "",
      method: "GET",
    }),
    async () => {
      const html = await getIndexPageHTML({
        browsablePathnameArray,
      })

      return {
        status: 200,
        headers: {
          "cache-control": "no-store",
          "content-type": "text/html",
          "content-length": Buffer.byteLength(html),
        },
        body: html,
      }
    },
  )

  const otherRoute = guard(
    createRequestPredicate({
      ressource: "*",
      method: "GET",
    }),
    async ({ ressource }) => {
      const html = await generateHTML({
        file: ressource,
        remoteRoot,
        compileInto,
        browserPlatformRemoteURL: getBrowserPlatformRemoteURL({ remoteRoot, compileInto }),
      })

      return {
        status: 200,
        headers: {
          "cache-control": "no-store",
          "content-type": "text/html",
          "content-length": Buffer.byteLength(html),
        },
        body: html,
      }
    },
  )

  const browserServer = await startServer({
    cancellationToken,
    protocol,
    ip,
    port,
    forcePort,
    requestToResponse: serviceCompose(indexRoute, otherRoute),
    startedMessage: ({ origin }) => `browser server started for ${root} at ${origin}`,
    stoppedMessage: (reason) => `browser server stopped because ${reason}`,
  })
  return browserServer
}

const getIndexPageHTML = async ({ root, browsablePathnameArray }) => {
  return `<!doctype html>

  <head>
    <title>Project root</title>
    <meta charset="utf-8" />
  </head>

  <body>
    <main>
      <h1>${root}</h1>
      <p>List of path to browse: </p>
      <ul>
        ${browsablePathnameArray
          .sort()
          .map((pathname) => `<li><a href="/${pathname}">${pathname}</a></li>`)
          .join("")}
      </ul>
    </main>
  </body>
  </html>`
}
