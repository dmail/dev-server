/*
 * https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerRegistration
 */

import { sigi } from "@jsenv/sigi"

import { pwaLogger } from "./pwa_logger.js"
import { serviceWorkerAPI } from "./internal/service_worker_api.js"
import {
  inspectServiceWorker,
  requestSkipWaitingOnServiceWorker,
  requestClaimOnServiceWorker,
  postMessageToServiceWorker,
} from "./internal/service_worker_communication.js"
import { createServiceWorkerHotReplacer } from "./internal/service_worker_hot_replacement.js"

export const createServiceWorkerFacade = ({
  scope = "/",
  autoclaimOnFirstActivation = false,
} = {}) => {
  let fromInspectPromise = null

  const { state, subscribe, mutate } = sigi({
    error: null,
    readyState: "", // registering, installing, installed, activating, activated
    meta: {},
    update: {
      error: null,
      readyState: "", // installing, installed, activating, activated
      meta: {},
      reloadRequired: true,
    },
  })

  const resourceUpdateHandlers = {}

  const onUpdateFound = async (toServiceWorker) => {
    const fromScriptMeta = await fromInspectPromise
    const toScriptMeta = await inspectServiceWorker(toServiceWorker)

    const serviceWorkerHotReplacer = createServiceWorkerHotReplacer({
      resourceUpdateHandlers,
      fromScriptMeta,
      toScriptMeta,
    })
    mutate({
      meta: fromScriptMeta,
      update: {
        meta: toScriptMeta,
        reloadRequired: !serviceWorkerHotReplacer,
      },
    })

    const onUpdateError = (errorEvent) => {
      mutate({ error: errorEvent })
    }
    toServiceWorker.addEventListener("error", onUpdateError)
    const applyUpdateStateEffects = async () => {
      const effects = {
        installing: () => {
          mutate({
            update: { readyState: "installing" },
          })
        },
        installed: () => {
          mutate({
            update: { readyState: "installed" },
          })
        },
        activating: () => {
          mutate({
            update: { readyState: "activating" },
          })
        },
        activated: async () => {
          mutate({
            update: { readyState: "activated" },
          })
          await ensureIsControllingNavigator(toServiceWorker)
          pwaLogger.info("update is controlling navigator")
          if (serviceWorkerHotReplacer) {
            pwaLogger.info("hot replace service worker")
            serviceWorkerHotReplacer()
          } else {
            pwaLogger.info("reloading page")
            postMessageToServiceWorker(toServiceWorker, {
              action: "postReloadAfterUpdateToClients",
            })
            reloadPage()
          }
        },
        redundant: () => {
          toServiceWorker.removeEventListener("error", onUpdateError)
          toServiceWorker.removeEventListener(
            "statechange",
            applyUpdateStateEffects,
          )
          mutate({
            update: { readyState: "redundant" },
          })
        },
      }
      await effects[toServiceWorker.state]()
    }
    applyUpdateStateEffects()
    toServiceWorker.addEventListener("statechange", applyUpdateStateEffects)
  }

  const watchRegistration = async (registration) => {
    const { installing, waiting, active } = registration
    const fromServiceWorker = installing || waiting || active
    registration.onupdatefound = () => {
      // https://github.com/w3c/ServiceWorker/issues/515
      // and listening onupdatefound after a setTimeout is not enough
      // as firefox will trigger "updatefound" when the worker is activating as well
      if (registration.installing === fromServiceWorker) {
        return
      }
      onUpdateFound(registration.installing)
    }
    serviceWorkerAPI.startMessages() // is it useful?
    fromInspectPromise = inspectServiceWorker(fromServiceWorker)
    const fromScriptMeta = await fromInspectPromise

    const onError = (errorEvent) => {
      mutate({ error: errorEvent })
    }
    fromServiceWorker.addEventListener("error", onError)
    const applyStateChangeEffect = () => {
      const effects = {
        installing: () => {
          mutate({ readyState: "installing", meta: fromScriptMeta })
        },
        installed: () => {
          mutate({ readyState: "installed", meta: fromScriptMeta })
        },
        activating: () => {
          mutate({ readyState: "activating", meta: fromScriptMeta })
        },
        activated: () => {
          mutate({ readyState: "activated", meta: fromScriptMeta })
          if (autoclaimOnFirstActivation && !serviceWorkerAPI.controller) {
            requestClaimOnServiceWorker(fromServiceWorker)
          }
        },
        redundant: () => {
          fromServiceWorker.removeEventListener(
            "statechange",
            applyStateChangeEffect,
          )
          fromServiceWorker.removeEventListener("error", onError)
          mutate({ readyState: "redundant", meta: fromScriptMeta })
        },
      }
      effects[fromServiceWorker.state]()
    }
    applyStateChangeEffect()
    fromServiceWorker.addEventListener("statechange", applyStateChangeEffect)
  }

  const init = async () => {
    const registration = await serviceWorkerAPI.getRegistration(scope)
    if (registration) {
      watchRegistration(registration)
    }
  }
  init()

  serviceWorkerAPI.addEventListener("controllerchange", async () => {
    const controller = serviceWorkerAPI.controller
    // happens when an other tab register the service worker and
    // make it control the navigator (when autoclaimOnFirstActivation is true)
    if (controller && state.readyState === "") {
      const registration = await serviceWorkerAPI.getRegistration()
      watchRegistration(registration)
    }
  })

  return {
    state,
    subscribe,
    setRegistationPromise: async (registrationPromise) => {
      try {
        mutate({ error: null, readyState: "registering" })
        const registration = await registrationPromise
        watchRegistration(registration)
      } catch (e) {
        mutate({ error: e })
      }
    },
    unregister: async () => {
      const registration = await serviceWorkerAPI.getRegistration(scope)
      if (!registration) {
        pwaLogger.debug("nothing to unregister")
        return false
      }
      pwaLogger.infoGroupCollapsed("registration.unregister()")
      const unregistered = await registration.unregister()
      if (unregistered) {
        pwaLogger.info("unregister done")
        pwaLogger.groupEnd()
        return true
      }
      pwaLogger.warn("unregister failed")
      pwaLogger.groupEnd()
      return false
    },
    checkForUpdates: async () => {
      pwaLogger.infoGroupCollapsed("checkForUpdates()")
      const registration = await serviceWorkerAPI.getRegistration(scope)
      if (!registration) {
        pwaLogger.info("no registration found")
        pwaLogger.groupEnd()
        return false
      }
      pwaLogger.debug("call registration.update()")
      const updateRegistration = await registration.update()
      if (updateRegistration.waiting) {
        pwaLogger.info("update found on registration.waiting")
        pwaLogger.groupEnd()
        onUpdateFound(updateRegistration.waiting)
        return true
      }
      // when installing, no need to call onUpdateFound, browser does it for us
      if (updateRegistration.installing) {
        pwaLogger.info("service worker found on registration.installing")
        pwaLogger.groupEnd()
        return true
      }

      pwaLogger.info(
        "no update found on registration.installing and registration.waiting",
      )
      pwaLogger.groupEnd()
      return false
    },
    activateUpdate: async () => {
      pwaLogger.infoGroupCollapsed("activateUpdate()")
      const registration = await serviceWorkerAPI.getRegistration(scope)
      if (!registration) {
        pwaLogger.warn("no registration")
        pwaLogger.groupEnd()
        return
      }
      const serviceWorker = registration.installing || registration.waiting
      if (!serviceWorker) {
        pwaLogger.warn("no service worker update")
        pwaLogger.groupEnd()
        return
      }
      if (serviceWorker.state === "installing") {
        pwaLogger.info("an update is installing, wait for it to be installed")
        await new Promise((resolve) => {
          serviceWorker.onstatechange = () => {
            if (serviceWorker.state === "installed") {
              serviceWorker.onstatechange = null
              resolve()
            }
          }
        })
      } else {
        pwaLogger.info("an update is waiting to activate")
      }
      const activatedPromise = new Promise((resolve) => {
        serviceWorker.onstatechange = () => {
          if (serviceWorker.state === "activated") {
            serviceWorker.onstatechange = null
            resolve()
          }
        }
      })
      pwaLogger.info("send skipWaiting")
      await requestSkipWaitingOnServiceWorker(serviceWorker)
      pwaLogger.info(`skipWaiting done, wait for update to switch to activated`)
      await activatedPromise
      pwaLogger.info("update is activated")
      await ensureIsControllingNavigator(serviceWorker)
      pwaLogger.info("update is controlling navigator")
      pwaLogger.groupEnd()
    },
    sendMessage: async (message) => {
      const registration = await serviceWorkerAPI.getRegistration(scope)
      if (!registration) {
        pwaLogger.warn(`no service worker script to communicate with`)
        return undefined
      }
      const serviceWorker =
        registration.installing || registration.waiting || registration.active
      // registration.active || registration.waiting || registration.installing
      pwaLogger.info(
        `postMessage(${JSON.stringify(message)}) on ${serviceWorker.scriptURL}`,
      )
      return postMessageToServiceWorker(serviceWorker, message)
    },
    defineResourceUpdateHandler: (url, handler) => {
      const urlResolved = new URL(url, document.location).href
      resourceUpdateHandlers[urlResolved] = handler
    },
  }
}

const ensureIsControllingNavigator = (serviceWorker) => {
  if (serviceWorkerAPI.controller === serviceWorker) {
    return null
  }
  const becomesControllerPromise = new Promise((resolve) => {
    const oncontrollerchange = () => {
      if (serviceWorkerAPI.controller === serviceWorker) {
        serviceWorkerAPI.removeEventListener(
          "controllerchange",
          oncontrollerchange,
        )
        resolve()
      }
    }
    serviceWorkerAPI.addEventListener("controllerchange", oncontrollerchange)
  })
  pwaLogger.info("request claim")
  requestClaimOnServiceWorker(serviceWorker)
  return becomesControllerPromise
}

// https://github.com/GoogleChrome/workbox/issues/1120
serviceWorkerAPI.addEventListener("message", (event) => {
  if (event.data === "reload_after_update") {
    reloadPage()
  }
})

let reloading = false
const reloadPage = () => {
  if (reloading) {
    return
  }
  reloading = true
  window.location.reload()
}
