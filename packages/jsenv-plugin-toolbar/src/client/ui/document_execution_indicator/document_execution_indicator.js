import {
  executionSignal,
  executionTooltipRequestedSignal,
} from "../../core/execution_signals.js"
import {
  closeExecutionTooltip,
  requestExecutionTooltip,
} from "../../core/execution_actions.js"

import { removeForceHideElement } from "../util/dom.js"
import { enableVariant } from "../variant.js"
import { effect } from "@preact/signals"

export const renderDocumentExecutionIndicator = async () => {
  removeForceHideElement(
    document.querySelector("#document_execution_indicator"),
  )
  effect(() => {
    const execution = executionSignal.value
    updateExecutionIndicator(execution)
  })
}

// const changeLink = variantNode.querySelector(".eventsource-changes-link")
// changeLink.innerHTML = reloadMessageCount
// changeLink.onclick = () => {
//   console.log(reloadMessages)
//   // eslint-disable-next-line no-alert
//   window.parent.alert(JSON.stringify(reloadMessages, null, "  "))
// }

// const someFailed = reloadMessages.some((m) => m.status === "failed")
// const somePending = reloadMessages.some((m) => m.status === "pending")
// const applyLink = variantNode.querySelector(".eventsource-reload-link")
// applyLink.innerHTML = someFailed
//   ? "failed"
//   : somePending
//   ? "applying..."
//   : "apply changes"
// applyLink.onclick = someFailed
//   ? () => {
//       parentEventSourceClient.applyReloadMessageEffects()
//     }
//   : somePending
//   ? () => {}
//   : () => {
//       parentEventSourceClient.applyReloadMessageEffects()
//     }

// parentEventSourceClient.reloadMessagesSignal.onchange = () => {
//   updateEventSourceIndicator()
// }
// const autoreloadCheckbox = document.querySelector("#toggle-autoreload")
// autoreloadCheckbox.checked = parentEventSourceClient.isAutoreloadEnabled()
// autoreloadCheckbox.onchange = () => {
//   parentEventSourceClient.setAutoreloadPreference(autoreloadCheckbox.checked)
//   updateEventSourceIndicator()
// }

const updateExecutionIndicator = ({ status, startTime, endTime } = {}) => {
  const executionIndicator = document.querySelector(
    "#document_execution_indicator",
  )
  enableVariant(executionIndicator, { execution: status })
  const variantNode = executionIndicator.querySelector("[data-when-active]")
  variantNode.querySelector("button").onclick = () => {
    const executionTooltipRequested = executionTooltipRequestedSignal.value
    if (executionTooltipRequested) {
      closeExecutionTooltip()
    } else {
      requestExecutionTooltip()
    }
  }
  variantNode.querySelector(".tooltip").textContent = computeText({
    status,
    startTime,
    endTime,
  })
}

// relative time: https://github.com/tc39/proposal-intl-relative-time/issues/118
const computeText = ({ status, startTime, endTime }) => {
  if (status === "completed") {
    return `Execution completed in ${endTime - startTime}ms`
  }
  if (status === "errored") {
    return `Execution failed in ${endTime - startTime}ms`
  }
  if (status === "running") {
    return "Executing..."
  }
  return ""
}
