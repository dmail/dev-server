export const connectEventSource = (
  eventSourceUrl,
  events = {},
  {
    connecting = () => {},
    connected = () => {},
    cancelled = () => {},
    failed = () => {},
    retryMaxAttempt = Infinity,
    retryAllocatedMs = Infinity,
    lastEventId,
  } = {},
) => {
  const { EventSource } = window
  if (typeof EventSource !== "function") {
    return () => {}
  }

  const eventSourceOrigin = new URL(eventSourceUrl).origin

  // will be either abort, disconnect or a third function calling cancelled
  // depending on connectionStatus
  let cancelCurrentConnection = () => {}

  const reconnect = () => {
    attemptConnection(
      lastEventId ? addLastEventIdIntoUrlSearchParams(eventSourceUrl, lastEventId) : eventSourceUrl,
    )
  }

  const attemptConnection = (url) => {
    const eventSource = new EventSource(url, {
      withCredentials: true,
    })

    let connectionStatus = "connecting"
    const abort = () => {
      if (connectionStatus !== "connecting") {
        console.warn(`abort ignored because connection is ${connectionStatus}`)
        return
      }
      connectionStatus = "aborted"
      eventSource.onerror = undefined
      eventSource.close()
      cancelled({ connect: reconnect })
    }
    cancelCurrentConnection = abort
    connecting({ cancel: abort })

    eventSource.onopen = () => {
      connectionStatus = "connected"
      const disconnect = () => {
        if (connectionStatus !== "connected") {
          console.warn(`disconnect ignored because connection is ${connectionStatus}`)
          return
        }
        connectionStatus = "disconnected"
        eventSource.onerror = undefined
        eventSource.close()
        cancelled({ connect: reconnect })
      }
      cancelCurrentConnection = disconnect
      connected({ cancel: disconnect })
    }

    let retryCount = 0
    let firstRetryMs = Date.now()

    eventSource.onerror = (errorEvent) => {
      const considerFailed = () => {
        connectionStatus = "disconnected"
        failed({
          cancel: () => {
            if (connectionStatus !== "failed") {
              console.warn(`disable ignored because connection is ${connectionStatus}`)
              return
            }
            connectionStatus = "disabled"
            cancelled({ connect: reconnect })
          },
          connect: reconnect,
        })
      }

      if (errorEvent.target.readyState === EventSource.CONNECTING) {
        if (retryCount > retryMaxAttempt) {
          console.info(`could not connect after ${retryMaxAttempt} attempt`)
          eventSource.onerror = undefined
          eventSource.close()
          considerFailed()
          return
        }

        if (retryCount === 0) {
          firstRetryMs = Date.now()
        } else {
          const allRetryDuration = Date.now() - firstRetryMs
          if (retryAllocatedMs && allRetryDuration > retryAllocatedMs) {
            console.info(`could not connect in less than ${retryAllocatedMs} ms`)
            eventSource.onerror = undefined
            eventSource.close()
            considerFailed()
            return
          }
        }

        connectionStatus = "connecting"
        retryCount++
        connecting({ cancel: abort })
        return
      }

      if (errorEvent.target.readyState === EventSource.CLOSED) {
        considerFailed()
        return
      }
    }
    Object.keys(events).forEach((eventName) => {
      eventSource.addEventListener(eventName, (e) => {
        if (e.origin === eventSourceOrigin) {
          if (e.lastEventId) {
            lastEventId = e.lastEventId
          }
          events[eventName](e)
        }
      })
    })
    if (!events.hasOwnProperty("welcome")) {
      eventSource.addEventListener("welcome", (e) => {
        if (e.origin === eventSourceOrigin && e.lastEventId) {
          lastEventId = e.lastEventId
        }
      })
    }
  }

  attemptConnection(eventSourceUrl)
  const disconnect = () => {
    cancelCurrentConnection()
  }

  const removePageUnloadListener = listenPageUnload(() => {
    disconnect()
  })

  return () => {
    removePageUnloadListener()
    disconnect()
  }
}

const addLastEventIdIntoUrlSearchParams = (url, lastEventId) => {
  if (url.indexOf("?") === -1) {
    url += "?"
  } else {
    url += "&"
  }
  return `${url}last-event-id=${encodeURIComponent(lastEventId)}`
}

// const listenPageMightFreeze = (callback) => {
//   const removePageHideListener = listenEvent(window, "pagehide", (pageHideEvent) => {
//     if (pageHideEvent.persisted === true) {
//       callback(pageHideEvent)
//     }
//   })
//   return removePageHideListener
// }

// const listenPageFreeze = (callback) => {
//   const removeFreezeListener = listenEvent(document, "freeze", (freezeEvent) => {
//     callback(freezeEvent)
//   })
//   return removeFreezeListener
// }

// const listenPageIsRestored = (callback) => {
//   const removeResumeListener = listenEvent(document, "resume", (resumeEvent) => {
//     removePageshowListener()
//     callback(resumeEvent)
//   })
//   const removePageshowListener = listenEvent(window, "pageshow", (pageshowEvent) => {
//     if (pageshowEvent.persisted === true) {
//       removePageshowListener()
//       removeResumeListener()
//       callback(pageshowEvent)
//     }
//   })
//   return () => {
//     removeResumeListener()
//     removePageshowListener()
//   }
// }

const listenPageUnload = (callback) => {
  const removePageHideListener = listenEvent(window, "pagehide", (pageHideEvent) => {
    if (pageHideEvent.persisted !== true) {
      callback(pageHideEvent)
    }
  })
  return removePageHideListener
}

const listenEvent = (emitter, event, callback) => {
  emitter.addEventListener(event, callback)
  return () => {
    emitter.removeEventListener(event, callback)
  }
}
