import { effect } from "@preact/signals"

import { settingsOpenedSignal } from "../../core/settings_signals.js"
import { openSettings, closeSettings } from "../../core/settings_actions.js"
import { enableVariant } from "../variant.js"
import {
  activateToolbarSection,
  deactivateToolbarSection,
} from "../util/dom.js"
import { renderToolbarAnimationSetting } from "./toolbar_animation_setting.js"
import { renderToolbarNotificationSetting } from "./toolbar_notification_setting.js"
import { renderToolbarThemeSetting } from "./toolbar_theme_setting.js"

export const renderToolbarSettings = () => {
  document.querySelector("#settings_open_button").onclick = toggleSettings
  document.querySelector("#settings_close_button").onclick = toggleSettings
  disableWarningStyle()

  renderToolbarAnimationSetting()
  renderToolbarNotificationSetting()
  renderToolbarThemeSetting()

  effect(() => {
    const settingsOpened = settingsOpenedSignal.value
    if (settingsOpened) {
      activateToolbarSection(document.querySelector("#settings"))
    } else {
      deactivateToolbarSection(document.querySelector("#settings"))
    }
  })
}

const toggleSettings = () => {
  const settingsOpened = settingsOpenedSignal.value
  if (settingsOpened) {
    closeSettings()
  } else {
    openSettings()
  }
}

export const enableWarningStyle = () => {
  enableVariant(document.querySelector("#settings_open_button"), {
    has_warning: "yes",
  })
}

export const disableWarningStyle = () => {
  enableVariant(document.querySelector("#settings_open_button"), {
    has_warning: "no",
  })
}
