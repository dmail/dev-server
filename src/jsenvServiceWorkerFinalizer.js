import { resolveUrl, urlToRelativeUrl } from "@jsenv/filesystem"

import { generateContentHash } from "./internal/building/url_versioning.js"

export const jsenvServiceWorkerFinalizer = (
  code,
  {
    serviceWorkerBuildRelativeUrl,
    buildManifest,
    buildFileContents,
    lineBreakNormalization,
  },
) => {
  const generatedUrlsConfig = {}
  Object.keys(buildManifest).forEach((projectRelativeUrl) => {
    if (projectRelativeUrl.endsWith(".map")) {
      return
    }

    const buildRelativeUrl = buildManifest[projectRelativeUrl]
    const buildUrl = resolveUrl(buildRelativeUrl, "file://")
    const serviceWorkerBuildUrl = resolveUrl(
      serviceWorkerBuildRelativeUrl,
      "file://",
    )
    const urlRelativeToServiceWorker = urlToRelativeUrl(
      buildUrl,
      serviceWorkerBuildUrl,
    )
    if (urlRelativeToServiceWorker === "") {
      // don't put the service worker itself
      return
    }
    const versioned = fileNameContainsHash(buildRelativeUrl)
    const buildFileContent = buildFileContents[buildRelativeUrl]

    generatedUrlsConfig[urlRelativeToServiceWorker] = {
      versioned,
      ...(versioned
        ? {}
        : {
            // when url is not versioned we compute a "version" for that url anyway
            // so that service worker source still changes and navigator
            // detect there is a change
            version: generateContentHash(buildFileContent, {
              lineBreakNormalization,
            }),
          }),
    }
  })

  return `
self.generatedUrlsConfig = ${JSON.stringify(generatedUrlsConfig, null, "  ")}
${code}
`
}

const fileNameContainsHash = (fileName) =>
  /_[a-z0-9]{8,}(\..*?)?$/.test(fileName)
