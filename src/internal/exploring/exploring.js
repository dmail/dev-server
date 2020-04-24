import { installNavigation } from "./navigation.js"

installNavigation()

// handle data-last-interaction attr on html (focusring)
window.addEventListener("mousedown", (mousedownEvent) => {
  if (mousedownEvent.defaultPrevented) {
    return
  }
  document.documentElement.setAttribute("data-last-interaction", "mouse")
})
window.addEventListener("touchstart", (touchstartEvent) => {
  if (touchstartEvent.defaultPrevented) {
    return
  }
  document.documentElement.setAttribute("data-last-interaction", "mouse")
})
window.addEventListener("keydown", (keydownEvent) => {
  if (keydownEvent.defaultPrevented) {
    return
  }
  document.documentElement.setAttribute("data-last-interaction", "keyboard")
})
