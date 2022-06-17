import { requestCertificateForLocalhost } from "@jsenv/https-local"

import {
  startServer,
  fetchFileSystem,
  pluginServerTiming,
  pluginCORS,
  jsenvAccessControlAllowedHeaders,
} from "@jsenv/server"

const { serverCertificate, serverCertificatePrivateKey } =
  await requestCertificateForLocalhost()
await startServer({
  logLevel: "info",
  protocol: "https",
  port: 3679,
  http2: true,
  privateKey: serverCertificatePrivateKey,
  certificate: serverCertificate,
  sendErrorDetails: true,
  plugins: {
    ...pluginServerTiming,
    ...pluginCORS({
      accessControlAllowRequestOrigin: true,
      accessControlAllowRequestMethod: true,
      accessControlAllowRequestHeaders: true,
      accessControlAllowedRequestHeaders: [
        ...jsenvAccessControlAllowedHeaders,
        "x-jsenv-execution-id",
      ],
      accessControlAllowCredentials: true,
    }),
  },
  requestToResponse: (request, { pushResponse }) => {
    if (request.ressource === "/main.html") {
      pushResponse({ path: "/script.js" })
      pushResponse({ path: "/style.css" })
    }

    return fetchFileSystem(
      new URL(request.ressource.slice(1), new URL("./", import.meta.url)),
      {
        headers: request.headers,
        rootDirectoryUrl: new URL("./", import.meta.url),
        canReadDirectory: true,
        mtimeEnabled: true,
      },
    )
  },
})
