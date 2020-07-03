import { removeForceHideElement, activateToolbarSection } from "../util/dom.js"
import { createHorizontalBreakpoint } from "../util/responsive.js"
import { toggleTooltip } from "../tooltip/tooltip.js"

// to know the execution duration, something as below
// window.performance.timing.domContentLoadedEventEnd - window.performance.timing.navigationStart

const WINDOW_MEDIUM_WIDTH = 570

export const renderExecutionInToolbar = () => {
  const fileRelativeUrl = new URL(window.parent.document.location).pathname.slice(1)

  // reset file execution indicator ui
  applyExecutionIndicator()
  removeForceHideElement(document.querySelector("#execution-indicator"))

  // apply responsive design on fileInput if needed + add listener on resize screen
  const input = document.querySelector("#file-input")
  const fileWidthBreakpoint = createHorizontalBreakpoint(WINDOW_MEDIUM_WIDTH)
  const handleFileWidthBreakpoint = () => {
    resizeInput(input, fileWidthBreakpoint)
  }
  handleFileWidthBreakpoint()
  fileWidthBreakpoint.changed.listen(handleFileWidthBreakpoint)
  input.value = fileRelativeUrl
  resizeInput(input, fileWidthBreakpoint)

  activateToolbarSection(document.querySelector("#file"))
  removeForceHideElement(document.querySelector("#file"))
}

const applyExecutionIndicator = (state = "default", duration) => {
  const executionIndicator = document.querySelector("#execution-indicator")
  const variant = executionIndicator.querySelector(`[data-variant="${state}"]`).cloneNode(true)
  const variantContainer = executionIndicator.querySelector("[data-variant-container]")
  variantContainer.innerHTML = ""
  variantContainer.appendChild(variant)

  executionIndicator.querySelector("button").onclick = () => toggleTooltip(executionIndicator)
  executionIndicator.querySelector(".tooltip").textContent = computeText({ state, duration })
}

const computeText = ({ state, duration }) => {
  if (state === "loading") {
    return ""
  }

  if (state === "success") {
    return `Execution completed in ${duration}ms`
  }

  if (state === "failure") {
    return `Execution failed in ${duration}ms`
  }

  return ""
}

const resizeInput = (input, fileWidthBreakpoint) => {
  const size = fileWidthBreakpoint.isBelow() ? 20 : 40
  if (input.value.length > size) {
    input.style.width = `${size}ch`
  } else {
    input.style.width = `${input.value.length}ch`
  }
}
