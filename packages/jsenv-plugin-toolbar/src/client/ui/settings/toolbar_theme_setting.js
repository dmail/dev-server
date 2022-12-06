import {
  getCurrentTheme,
  switchToDefaultTheme,
  switchToLightTheme,
} from "../../core/toolbar_theme.js"

export const renderToolbarThemeSetting = () => {
  const checkbox = document.querySelector("#checkbox-dark-theme")
  checkbox.checked = getCurrentTheme() === "dark"
  checkbox.onchange = () => {
    if (checkbox.checked) {
      switchToDefaultTheme()
    } else {
      switchToLightTheme()
    }
  }
}
