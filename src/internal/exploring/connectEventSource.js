const FAILURE_CONSEQUENCE_RENOUNCING = "renouncing"
const FAILURE_CONSEQUENCE_DISCONNECTION = "disconnection"
const FAILURE_REASON_ERROR = "error"
const FAILURE_REASON_SCRIPT = "script"
const BACKGROUND_RECONNECTION_FLAG = "background-reconnection"
const ON_ERROR_RECONNECTION_FLAG = "on-error-reconnection"

/* eslint-disable new-cap */
export const connectEventSource = async (
  eventSourceUrl,
  events = {},
  {
    CONNECTING = () => {},
    CONNECTION_FAILURE = () => {},
    CONNECTED = () => {},
    reconnectionOnError = false,
    reconnectionMaxAttempt = Infinity,
    reconnectionAllocatedMs = Infinity,
    reconnectionInterval = 500,
    // failure to reconnect starts a background attempt to reconnect
    // it will not notify the attempt nor failure only if it succeeds
    // any successful connection requested during the background reconnection cancels it
    // if failed nothing else will be tried
    backgroundReconnection = false,
    backgroundReconnectionMaxAttempt = Infinity,
    backgroundReconnectionAllocatedMs = Infinity,
    backgroundReconnectionInterval = 1000,
  } = {},
) => {
  const { EventSource } = window
  if (typeof EventSource !== "function") {
    return
  }

  const eventSourceOrigin = new URL(eventSourceUrl).origin
  let pendingBackgroundReconnection

  const notifyConnecting = ({ reconnectionFlag, ...rest }) => {
    if (pendingBackgroundReconnection && reconnectionFlag !== BACKGROUND_RECONNECTION_FLAG) {
      pendingBackgroundReconnection.abort()
      pendingBackgroundReconnection = undefined
    }
    CONNECTING({ reconnectionFlag, ...rest })
  }
  const notifyConnected = ({ reconnectionFlag, ...rest }) => {
    if (pendingBackgroundReconnection && reconnectionFlag !== BACKGROUND_RECONNECTION_FLAG) {
      pendingBackgroundReconnection.abort()
      pendingBackgroundReconnection = undefined
    }
    CONNECTED({ reconnectionFlag, ...rest })
  }
  const notifyFailure = ({
    failureConsequence,
    failureReason,
    reconnect,
    reconnectionFlag,
    ...rest
  }) => {
    if (reconnectionFlag === BACKGROUND_RECONNECTION_FLAG) {
      pendingBackgroundReconnection = undefined
      return
    }

    if (pendingBackgroundReconnection && reconnectionFlag !== BACKGROUND_RECONNECTION_FLAG) {
      pendingBackgroundReconnection.abort()
      pendingBackgroundReconnection = undefined
    }

    // starts the background reconnection when reconnection fails
    if (
      backgroundReconnection &&
      reconnectionFlag &&
      reconnectionFlag !== BACKGROUND_RECONNECTION_FLAG
    ) {
      pendingBackgroundReconnection = reconnect({
        reconnectionFlag: BACKGROUND_RECONNECTION_FLAG,
        reconnectionAutoStart: false,
        maxAttempt: backgroundReconnectionMaxAttempt,
        allocatedMs: backgroundReconnectionAllocatedMs,
        interval: backgroundReconnectionInterval,
      })
      pendingBackgroundReconnection.start({ notify: false })
    }

    if (reconnectionOnError && !reconnectionFlag && failureReason === FAILURE_REASON_ERROR) {
      reconnect({
        reconnectionFlag: ON_ERROR_RECONNECTION_FLAG,
      })
    }

    CONNECTION_FAILURE({
      failureConsequence,
      failureReason,
      reconnect,
      reconnectionFlag,
      ...rest,
    })
  }

  const connect = async ({ onsuccess, onfailure }) => {
    const eventSource = new EventSource(eventSourceUrl, {
      withCredentials: true,
    })

    let connected = false
    eventSource.onopen = () => {
      connected = true

      eventSource.onerror = () => {
        connected = false
        eventSource.close()
        onfailure({
          failureConsequence: FAILURE_CONSEQUENCE_DISCONNECTION,
          failureReason: FAILURE_REASON_ERROR,
        })
      }

      onsuccess({
        disconnect: () => {
          if (!connected) {
            throw new Error(`already disconnected`)
          }
          connected = false
          eventSource.close()
          onfailure({
            failureConsequence: FAILURE_CONSEQUENCE_DISCONNECTION,
            failureReason: FAILURE_REASON_SCRIPT,
          })
        },
      })
    }
    eventSource.onerror = () => {
      eventSource.close()
      onfailure({
        failureConsequence: FAILURE_CONSEQUENCE_RENOUNCING,
        failureReason: FAILURE_REASON_ERROR,
      })
    }
    Object.keys(events).forEach((eventName) => {
      eventSource.addEventListener(eventName, (e) => {
        if (e.origin === eventSourceOrigin) {
          events[eventName](e)
        }
      })
    })

    return () => {
      if (connected) {
        throw new Error(`cannot abort opened connection`)
      }
      eventSource.close()
      onfailure({
        failureConsequence: FAILURE_CONSEQUENCE_RENOUNCING,
        failureReason: FAILURE_REASON_SCRIPT,
      })
    }
  }

  const abortConnection = connect({
    onsuccess: ({ disconnect }) => {
      notifyConnected({ disconnect })
    },
    onfailure: ({ failureConsequence, failureReason }) => {
      const reconnect = ({
        reconnectionFlag = true,
        reconnectionAutoStart = true,
        maxAttempt = reconnectionMaxAttempt,
        allocatedMs = reconnectionAllocatedMs,
        interval = reconnectionInterval,
      } = {}) => {
        const startTime = Date.now()
        let attemptCount = 1
        let attemptTimeout
        let abortAttempt

        const attempt = () => {
          abortAttempt = connect({
            onsuccess: ({ disconnect }) => {
              notifyConnected({ reconnectionFlag, disconnect })
            },
            onfailure: ({ failureConsequence, failureReason }) => {
              if (failureConsequence === FAILURE_CONSEQUENCE_DISCONNECTION) {
                notifyFailure({
                  failureConsequence,
                  failureReason,
                  reconnect,
                })
                return
              }

              const consumedMs = Date.now() - startTime
              const meta = {
                reconnectionFlag,
                // tell outside how many time we tried
                reconnectionAttemptCount: attemptCount,
                // tell outside for how long we tried
                reconnectionAttemptDuration: consumedMs,
                // give a way to retry
                reconnect,
              }

              if (failureReason === FAILURE_REASON_SCRIPT) {
                // someone aborted the reconnection
                notifyFailure({
                  failureConsequence,
                  failureReason,
                  ...meta,
                })
                return
              }

              if (attemptCount >= maxAttempt) {
                notifyFailure({
                  failureConsequence: FAILURE_CONSEQUENCE_RENOUNCING,
                  failureReason: `could not connect after ${maxAttempt} attempt`,
                  ...meta,
                })
                return
              }

              const retryIn = (ms) => {
                attemptTimeout = setTimeout(() => {
                  attemptCount++
                  attempt()
                }, ms)
              }

              if (allocatedMs && allocatedMs !== Infinity) {
                const remainingMs = allocatedMs - consumedMs
                if (remainingMs <= 0) {
                  notifyFailure({
                    failureConsequence: FAILURE_CONSEQUENCE_RENOUNCING,
                    failureReason: `could not connect in less than ${allocatedMs} ms`,
                    ...meta,
                  })
                  return
                }
                retryIn(Math.min(remainingMs, interval))
              } else {
                retryIn(interval)
              }
            },
          })
        }

        const abort = () => {
          abortAttempt()
          clearTimeout(attemptTimeout)
        }

        const start = ({ notify = true } = {}) => {
          attempt()
          if (notify) {
            notifyConnecting({
              reconnectionFlag,
              abort,
            })
          }
        }

        if (reconnectionAutoStart) {
          start()
        }

        return { start, abort }
      }

      notifyFailure({
        failureConsequence,
        failureReason,
        reconnect,
      })
    },
  })

  notifyConnecting({
    abort: abortConnection,
  })
}
