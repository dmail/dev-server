import { requestCertificateForLocalhost } from "@jsenv/https-local"

import { rootDirectoryUrl } from "@jsenv/core/jsenv.config.mjs"
import { startDevServer } from "@jsenv/core"

const { serverCertificate, serverCertificatePrivateKey } =
  await requestCertificateForLocalhost({
    serverCertificateAltNames: ["local"],
  })

await startDevServer({
  rootDirectoryUrl,
  // babelPluginMap: {},
  protocol: "https",
  http2: false,
  certificate: serverCertificate,
  privateKey: serverCertificatePrivateKey,
  // importMapInWebWorkers: true,
  // livereloadLogLevel: "debug",
  // jsenvToolbar: false,
  port: 3456,
  htmlSupervisor: {
    logs: true,
  },
  explorerGroups: {
    main: {
      "./dev_exploring/main/**/*.html": true,
    },
    autoreload: {
      "./dev_exploring/autoreload/**/*.html": true,
    },
    errors: {
      "./dev_exploring/errors/**/*.html": true,
    },
    other: {
      "./dev_exploring/other/**/*.html": true,
    },
    test: {
      "./test/**/client/main.html": true,
    },
  },
  clientFiles: {
    "./**": true,
    "./**/.*/": false, // any folder starting with a dot is ignored (includes .git,.jsenv for instance)
    "./**/dist/": false,
    "./**/docs/": false,
    "./**/experimental/": false,
    "./**/node_modules/": false,
    "./**/packages/": false,
  },
})
