import { readFileSync } from "node:fs"
import { serveDirectory, urlToContentType } from "@jsenv/server"

export const jsenvPluginFileUrls = () => {
  return {
    name: "jsenv:file_urls",
    appliesDuring: "*",
    load: ({ projectDirectoryUrl, specifierType, url }) => {
      if (!url.startsWith("file:")) {
        return null
      }
      const urlObject = new URL(url)
      let fileBuffer
      try {
        fileBuffer = readFileSync(urlObject)
      } catch (e) {
        if (e.code === "EISDIR" && specifierType === "http_request") {
          return {
            response: serveDirectory(url, {
              headers: {
                accept: "text/html",
              },
              canReadDirectory: true,
              rootDirectoryUrl: projectDirectoryUrl,
            }),
          }
        }
        throw e
      }
      const contentType = urlToContentType(url)
      if (contentTypeIsTextual(contentType)) {
        return {
          contentType,
          content: String(fileBuffer),
        }
      }
      return {
        contentType,
        content: fileBuffer,
      }
    },
  }
}

const contentTypeIsTextual = (contentType) => {
  if (contentType.startsWith("text/")) {
    return true
  }
  // catch things like application/manifest+json, application/importmap+json
  if (/^application\/\w+\+json$/.test(contentType)) {
    return true
  }
  if (CONTENT_TYPE_AS_TEXT.includes(contentType)) {
    return true
  }
  return false
}
const CONTENT_TYPE_AS_TEXT = [
  "application/javascript",
  "application/json",
  "image/svg+xml",
]
