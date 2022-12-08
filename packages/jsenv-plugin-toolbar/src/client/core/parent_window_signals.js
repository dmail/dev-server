import { signal } from "@preact/signals"

import { parentWindowReloader } from "./parent_window_context.js"

export const autoreloadEnabledSignal = signal(false)
export const reloaderStatusSignal = signal("idle")
export const changesSignal = signal(0)

if (parentWindowReloader) {
  autoreloadEnabledSignal.value = parentWindowReloader.autoreload.enabled
  parentWindowReloader.autoreload.onchange = () => {
    autoreloadEnabledSignal.value = parentWindowReloader.autoreload.enabled
  }
  reloaderStatusSignal.value = parentWindowReloader.status.value
  parentWindowReloader.status.onchange = () => {
    reloaderStatusSignal.value = parentWindowReloader.status.value
  }
  changesSignal.value = parentWindowReloader.changes.value
  parentWindowReloader.changes.onchange = () => {
    changesSignal.value = [...parentWindowReloader.changes.value]
  }
}
