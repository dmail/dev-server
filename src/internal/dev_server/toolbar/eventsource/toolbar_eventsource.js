import { removeForceHideElement } from "../util/dom.js"
import { enableVariant } from "../variant/variant.js"
import {
  toggleTooltip,
  removeAutoShowTooltip,
  autoShowTooltip,
} from "../tooltip/tooltip.js"

let livereloadingAvailableOnServer = false
const parentEventSourceClient = window.parent.__jsenv_event_source_client__

export const initToolbarEventSource = ({ livereloading }) => {
  removeForceHideElement(document.querySelector("#eventsource-indicator"))
  livereloadingAvailableOnServer = livereloading
  if (!livereloadingAvailableOnServer) {
    disableLivereloadSetting()
  }
  parentEventSourceClient.status.onchange = () => {
    updateEventSourceIndicator()
  }
  parentEventSourceClient.reloadMessagesSignal.onchange = () => {
    updateEventSourceIndicator()
  }
  const livereloadCheckbox = document.querySelector("#toggle-livereload")
  livereloadCheckbox.checked = parentEventSourceClient.isLivereloadEnabled()
  livereloadCheckbox.onchange = () => {
    parentEventSourceClient.setLivereloadPreference(livereloadCheckbox.checked)
    updateEventSourceIndicator()
  }
  updateEventSourceIndicator()
}

const updateEventSourceIndicator = () => {
  const eventSourceIndicator = document.querySelector("#eventsource-indicator")
  const reloadMessages = parentEventSourceClient.reloadMessages
  const reloadMessageCount = reloadMessages.length

  const eventSourceConnectionState = parentEventSourceClient.status.value
  enableVariant(eventSourceIndicator, {
    eventsource: eventSourceConnectionState,
    livereload: parentEventSourceClient.isLivereloadEnabled() ? "on" : "off",
    changes: reloadMessageCount > 0 ? "yes" : "no",
  })

  const variantNode = document.querySelector(
    "#eventsource-indicator > [data-when-active]",
  )
  variantNode.querySelector("button").onclick = () => {
    toggleTooltip(eventSourceIndicator)
  }

  if (eventSourceConnectionState === "connecting") {
    variantNode.querySelector("a").onclick = () => {
      parentEventSourceClient.disconnect()
    }
  } else if (eventSourceConnectionState === "connected") {
    removeAutoShowTooltip(eventSourceIndicator)
    if (reloadMessageCount > 0) {
      const changeLink = variantNode.querySelector(".eventsource-changes-link")
      changeLink.innerHTML = reloadMessageCount
      changeLink.onclick = () => {
        console.log(reloadMessages)
        // eslint-disable-next-line no-alert
        window.parent.alert(JSON.stringify(reloadMessages, null, "  "))
      }

      const someFailed = reloadMessages.some((m) => m.status === "failed")
      const somePending = reloadMessages.some((m) => m.status === "pending")
      const applyLink = variantNode.querySelector(".eventsource-reload-link")
      applyLink.innerHTML = someFailed
        ? "failed"
        : somePending
        ? "applying..."
        : "apply changes"
      applyLink.onclick = someFailed
        ? () => {
            parentEventSourceClient.applyReloadMessageEffects()
          }
        : somePending
        ? () => {}
        : () => {
            parentEventSourceClient.applyReloadMessageEffects()
          }
    }
  } else if (eventSourceConnectionState === "disconnected") {
    autoShowTooltip(eventSourceIndicator)
    variantNode.querySelector("a").onclick = () => {
      parentEventSourceClient.connect()
    }
  }
}

const disableLivereloadSetting = () => {
  document
    .querySelector(".settings-livereload")
    .setAttribute("data-disabled", "true")
  document
    .querySelector(".settings-livereload")
    .setAttribute("title", `Livereload not available: disabled by server`)
  document.querySelector("#toggle-livereload").disabled = true
}
