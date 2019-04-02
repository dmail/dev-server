/* eslint-disable import/max-dependencies */
import { createCancellationToken } from "/node_modules/@dmail/cancellation/index.js"
import { fileRead, fileStat } from "/node_modules/@dmail/helper/index.js"
import { convertFileSystemErrorToResponseProperties } from "../requestToFileResponse/index.js"
import { dateToSecondsPrecision } from "../dateHelper.js"
import { acceptContentType, createSSERoom, serviceCompose } from "../server/index.js"
import { watchFile } from "../watchFile.js"
import { createETag } from "./helpers.js"
import { compileFile } from "./compileFile.js"
import { locate as locateDefault } from "./locate.js"

const pathnameIsAsset = (pathname) => pathname.match(/[^\/]+__asset__\/.+$/)

export const compileToService = (
  compile,
  {
    cancellationToken = createCancellationToken(),
    projectFolder,
    compileInto,
    locate = locateDefault,
    compileDescription,
    localCacheStrategy,
    localCacheTrackHit,
    cacheStrategy = "etag",

    compilePredicate = () => true,

    watch = false,
    watchPredicate = () => true,
  },
) => {
  const { registerFileChangedCallback, triggerFileChanged } = createFileChangedSignal()

  const cacheWithMtime = cacheStrategy === "mtime"
  const cacheWithETag = cacheStrategy === "etag"
  const cachedDisabled = cacheStrategy === "none"

  const watchedFiles = new Map()
  cancellationToken.register(() => {
    watchedFiles.forEach((closeWatcher) => closeWatcher())
    watchedFiles.clear()
  })

  const compileService = async ({ origin, ressource, headers = {} }) => {
    const requestPathname = ressource

    if (pathnameIsAsset(ressource)) return null

    const { compileId, filename } = await locate({
      projectFolder,
      compileInto,
      requestPathname,
    })

    // cannot locate a file -> we don't know what to compile
    if (!compileId) return null

    // we don't want to read anything outside of the project
    if (fileIsOutsideFolder(filename, projectFolder)) {
      return { status: 403, statusText: `cannot access file outside project` }
    }

    const filenameRelative = filename.slice(projectFolder.length + 1)
    const expectedFilenameRelative = ressource.slice(`/${compileInto}/${compileId}/`.length)
    // a request to 'node_modules/dependency/index.js'
    // with referer 'node_modules/package/index.js'
    // may be found at 'node_modules/package/node_modules/dependency/index.js'
    if (filenameRelative !== expectedFilenameRelative) {
      // in that case, send temporary redirect to client
      return {
        // https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/307
        status: 307,
        headers: {
          location: `${origin}/${filenameRelative}`,
        },
      }
    }

    // some file must not be compiled (.html, .css, dist/browserLoader.js)
    if (!compilePredicate(filenameRelative, filename)) return null

    // when I ask for a compiled file, watch the corresponding file on filesystem
    if (watch && watchedFiles.has(filename) === false && watchPredicate(filenameRelative)) {
      const fileWatcher = watchFile(filename, () => {
        triggerFileChanged({ filename, filenameRelative })
      })
      watchedFiles.set(filename, fileWatcher)
    }

    const compileService = async () => {
      const { output } = await compileFile({
        compile,
        projectFolder,
        compileInto,
        compileId,
        compileDescription,
        filenameRelative,
        filename,
        cacheStrategy: localCacheStrategy,
        cacheTrackHit: localCacheTrackHit,
      })

      return {
        status: 200,
        headers: {
          ...(cachedDisabled ? { "cache-control": "no-store" } : {}),
          "content-length": Buffer.byteLength(output),
          "content-type": "application/javascript",
        },
        body: output,
      }
    }

    try {
      if (cacheWithMtime) {
        const { mtime } = await fileStat(filename)

        if ("if-modified-since" in headers) {
          const ifModifiedSince = headers["if-modified-since"]
          let ifModifiedSinceDate
          try {
            ifModifiedSinceDate = new Date(ifModifiedSince)
          } catch (e) {
            return {
              status: 400,
              statusText: "if-modified-since header is not a valid date",
            }
          }

          if (ifModifiedSinceDate >= dateToSecondsPrecision(mtime)) {
            return {
              status: 304,
              headers: {},
            }
          }
        }

        const response = await compileService()
        response.headers["last-modified"] = mtime.toUTCString()
        return response
      }

      if (cacheWithETag) {
        const content = await fileRead(filename)
        const eTag = createETag(content)

        if ("if-none-match" in headers) {
          const ifNoneMatch = headers["if-none-match"]

          if (ifNoneMatch === eTag) {
            return {
              status: 304,
              headers: {},
            }
          }
        }

        const response = await compileService()
        response.headers.eTag = eTag
        return response
      }

      return compileService()
    } catch (error) {
      if (error && error.statusText === "Unexpected directory operation") {
        return {
          status: 403,
        }
      }
      if (error && error.code === "CACHE_CORRUPTION_ERROR") {
        return {
          status: 500,
        }
      }
      return convertFileSystemErrorToResponseProperties(error)
    }
  }

  const createWatchSSEService = () => {
    const fileChangedSSE = createSSERoom()

    fileChangedSSE.open()
    cancellationToken.register(fileChangedSSE.close)

    registerFileChangedCallback(({ filenameRelative }) => {
      fileChangedSSE.sendEvent({
        type: "file-changed",
        data: filenameRelative,
      })
    })

    return ({ headers }) => {
      if (acceptContentType(headers.accept, "text/event-stream")) {
        return fileChangedSSE.connect(headers["last-event-id"])
      }
      return null
    }
  }

  if (watch) {
    return serviceCompose(createWatchSSEService(), compileService)
  }

  return compileService
}

const createFileChangedSignal = () => {
  const fileChangedCallbackArray = []

  const registerFileChangedCallback = (callback) => {
    fileChangedCallbackArray.push(callback)
  }

  const changed = (data) => {
    const callbackArray = fileChangedCallbackArray.slice()
    callbackArray.forEach((callback) => {
      callback(data)
    })
  }

  return { registerFileChangedCallback, changed }
}

const fileIsInsideFolder = (filename, folder) => filename.startsWith(`${folder}/`)

const fileIsOutsideFolder = (filename, folder) => !fileIsInsideFolder(filename, folder)
