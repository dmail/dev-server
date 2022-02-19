import { createSSERoom } from "@jsenv/server"
import {
  resolveUrl,
  registerDirectoryLifecycle,
  urlIsInsideOf,
  urlToRelativeUrl,
} from "@jsenv/filesystem"
import { createCallbackList } from "@jsenv/abort"

export const createSSEService = ({
  projectDirectoryUrl,
  jsenvDirectoryRelativeUrl,
  watchConfig,
  autoreload,
  ressourceGraph,
  serverStopCallbackList,
}) => {
  let handleSSEClientRequest
  if (autoreload) {
    handleSSEClientRequest = createSSEServiceWithAutoreload({
      projectDirectoryUrl,
      jsenvDirectoryRelativeUrl,
      watchConfig,
      ressourceGraph,
      serverStopCallbackList,
    })
  } else {
    const roomWhenAutoreloadIsDisabled = createSSERoom()
    roomWhenAutoreloadIsDisabled.open()
    handleSSEClientRequest = (request) => {
      return roomWhenAutoreloadIsDisabled.join(request)
    }
  }
  return (request) => {
    const { accept } = request.headers
    if (!accept || !accept.includes("text/event-stream")) {
      return null
    }
    return handleSSEClientRequest(request)
  }
}

const createSSEServiceWithAutoreload = ({
  projectDirectoryUrl,
  jsenvDirectoryRelativeUrl,
  watchConfig,
  ressourceGraph,
  serverStopCallbackList,
}) => {
  const projectFileModified = createCallbackList()
  const projectFileRemoved = createCallbackList()
  const projectFileAdded = createCallbackList()
  const watchProjectFiles = (callback) => {
    const removeModifiedCallback = projectFileModified.add((relativeUrl) => {
      callback({
        event: "modified",
        relativeUrl,
      })
    })
    const removeRemovedCallback = projectFileRemoved.add((relativeUrl) => {
      callback({
        event: "removed",
        relativeUrl,
      })
    })
    const removeAddedCallback = projectFileRemoved.add((relativeUrl) => {
      callback({
        event: "added",
        relativeUrl,
      })
    })
    return () => {
      removeModifiedCallback()
      removeRemovedCallback()
      removeAddedCallback()
    }
  }
  // wait 100ms to actually start watching
  // otherwise server starting is delayed by the filesystem scan done in
  // registerDirectoryLifecycle
  const timeout = setTimeout(() => {
    const unregisterDirectoryLifecyle = registerDirectoryLifecycle(
      projectDirectoryUrl,
      {
        watchDescription: {
          ...watchConfig,
          [jsenvDirectoryRelativeUrl]: false,
        },
        updated: ({ relativeUrl }) => {
          projectFileModified.notify(relativeUrl)
        },
        removed: ({ relativeUrl }) => {
          projectFileRemoved.notify(relativeUrl)
        },
        added: ({ relativeUrl }) => {
          projectFileAdded.notify(relativeUrl)
        },
        keepProcessAlive: false,
        recursive: true,
      },
    )
    serverStopCallbackList.add(unregisterDirectoryLifecyle)
  }, 100)
  serverStopCallbackList.add(() => {
    clearTimeout(timeout)
  })

  const cache = []
  const sseRoomLimit = 100
  const getOrCreateSSERoom = (mainFileRelativeUrl) => {
    const cacheEntry = cache.find(
      (cacheEntryCandidate) =>
        cacheEntryCandidate.mainFileRelativeUrl === mainFileRelativeUrl,
    )
    if (cacheEntry) {
      return cacheEntry.sseRoom
    }
    const sseRoom = createSSERoom({
      retryDuration: 2000,
      historyLength: 100,
      welcomeEventEnabled: true,
      effect: () => {
        const removeHotUpdateCallback =
          ressourceGraph.hotUpdateCallbackList.add((hotUpdate) => {
            if (hotUpdate.declined) {
              sseRoom.sendEvent({
                type: "reload",
                data: JSON.stringify({
                  cause: hotUpdate.cause,
                  type: "full",
                  typeReason: hotUpdate.reason,
                  declinedBy: hotUpdate.declinedBy,
                }),
              })
            } else {
              sseRoom.sendEvent({
                type: "reload",
                data: JSON.stringify({
                  cause: hotUpdate.cause,
                  type: "hot",
                  typeReason: hotUpdate.reason,
                  hotInstructions: hotUpdate.instructions,
                }),
              })
            }
          })
        const stopWatching = watchProjectFiles(({ relativeUrl, event }) => {
          ressourceGraph.onFileChange({ relativeUrl, event })
        })
        return () => {
          removeHotUpdateCallback()
          stopWatching()
        }
      },
    })

    const removeSSECleanupCallback = serverStopCallbackList.add(() => {
      removeSSECleanupCallback()
      sseRoom.close()
    })
    cache.push({
      mainFileRelativeUrl,
      sseRoom,
      cleanup: () => {
        removeSSECleanupCallback()
        sseRoom.close()
      },
    })
    if (cache.length >= sseRoomLimit) {
      const firstCacheEntry = cache.shift()
      firstCacheEntry.cleanup()
    }
    return sseRoom
  }

  return (request) => {
    const requestUrl = resolveUrl(request.ressource, request.origin)
    const outDirectoryServerUrl = resolveUrl(
      jsenvDirectoryRelativeUrl,
      request.origin,
    )
    const originalRelativeUrl = urlToOriginalRelativeUrl(
      requestUrl,
      outDirectoryServerUrl,
    )
    const room = getOrCreateSSERoom(originalRelativeUrl)
    return room.join(request)
  }
}

const urlToOriginalRelativeUrl = (url, outDirectoryRemoteUrl) => {
  if (urlIsInsideOf(url, outDirectoryRemoteUrl)) {
    const afterCompileDirectory = urlToRelativeUrl(url, outDirectoryRemoteUrl)
    const fileRelativeUrl = afterCompileDirectory.slice(
      afterCompileDirectory.indexOf("/") + 1,
    )
    return fileRelativeUrl
  }
  return new URL(url).pathname.slice(1)
}
