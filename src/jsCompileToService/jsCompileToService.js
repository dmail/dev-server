import { compileToService } from "../compileToService/index.js"
import { ansiToHTML } from "../ansiToHTML.js"

export const jsCompileToService = (
  compileFile,
  {
    cancellationToken,
    projectFolder,
    compileInto,
    locate,
    compileDescription = {},
    localCacheStrategy = "etag",
    localCacheTrackHit = true,
    cacheStrategy = "etag",
    compilePredicate = () => true,
    watch,
    watchPredicate,
  },
) => {
  const service = compileToService(compileFile, {
    cancellationToken,
    projectFolder,
    compileInto,
    locate,
    compileDescription,
    localCacheStrategy,
    localCacheTrackHit,
    cacheStrategy,
    compilePredicate: (filenameRelative, filename) => {
      if (filenameRelative === `browserPlatform.js`) return false
      if (filenameRelative === `browserSystemImporter.js`) return false
      return compilePredicate(filenameRelative, filename)
    },
    watch,
    watchPredicate,
  })

  const jsService = async (request) => {
    try {
      const response = await service(request)
      return response
    } catch (e) {
      if (e && e.name === "PARSE_ERROR") {
        e.messageHTML = ansiToHTML(e.message)
        const json = JSON.stringify(e)

        return {
          status: 500,
          statusText: "parse error",
          headers: {
            "cache-control": "no-store",
            "content-length": Buffer.byteLength(json),
            "content-type": "application/json",
          },
          body: json,
        }
      }
      throw e
    }
  }

  return jsService
}
