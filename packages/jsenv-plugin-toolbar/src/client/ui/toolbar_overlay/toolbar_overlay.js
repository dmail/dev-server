import { effect } from "@preact/signals"

import { openedSignal } from "../../core/toolbar_open_signals.js"
import { closeAllTooltips } from "../../core/tooltip_actions.js"
import { serverTooltipOpenedSignal } from "../../core/server_signals.js"
import { executionTooltipOpenedSignal } from "../../core/execution_signals.js"
import { hideSettings } from "../toolbar_settings/toolbar_settings.js"
import { getToolbarIframe, setStyles } from "../util/dom.js"

export const renderToolbarOverlay = () => {
  const toolbarOverlay = document.querySelector("#toolbar_overlay")
  toolbarOverlay.onclick = () => {
    closeAllTooltips()
    hideSettings()
  }

  effect(() => {
    if (!window.parent) {
      // can happen while parent iframe reloads
      return
    }
    const opened = openedSignal.value
    const serverTooltipOpened = serverTooltipOpenedSignal.value
    const executionTooltipOpened = executionTooltipOpenedSignal.value
    if (!opened) {
      return
    }
    if (serverTooltipOpened || executionTooltipOpened) {
      enableIframeOverflowOnParentWindow()
    } else {
      disableIframeOverflowOnParentWindow()
    }
  })
}

const enableIframeOverflowOnParentWindow = () => {
  const iframe = getToolbarIframe()

  const transitionDuration = iframe.style.transitionDuration
  setStyles(iframe, {
    "height": "100%",
    // we don't want to animate height transition
    // but if it was enabled, we'll restore it afterwards
    "transition-duration": "0ms",
  })
  if (transitionDuration) {
    setTimeout(() => {
      setStyles(iframe, { "transition-duration": transitionDuration })
    })
  }
}

const disableIframeOverflowOnParentWindow = () => {
  const iframe = getToolbarIframe()
  const transitionDuration = iframe.style.transitionDuration
  setStyles(iframe, {
    "height": "40px",
    // we don't want to animate height transition
    // but if it was enabled, we'll restore it afterwards
    "transition-duration": "0ms",
  })
  if (transitionDuration) {
    setTimeout(() => {
      setStyles(iframe, { "transition-duration": transitionDuration })
    })
  }
}
