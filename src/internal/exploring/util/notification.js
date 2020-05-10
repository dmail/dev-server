import { createPreference } from "./preferences.js"

const notificationPreference = createPreference("notification")

export const notificationAvailable = typeof window.Notification === "function"

export const getNotificationPreference = () =>
  notificationPreference.has() ? notificationPreference.get() : true

export const setNotificationPreference = (value) => notificationPreference.set(value)

export const registerNotifications = () => {
  const notifCheckbox = document.querySelector("#toggle-notifs")
  notifCheckbox.checked = getNotificationPreference()
  notifCheckbox.onchange = () => {
    setNotificationPreference(notifCheckbox.checked)
  }
}

export const notifyFileExecution = (execution, previousExecution) => {
  const notificationEnabled = getNotificationPreference()
  if (!notificationEnabled) return

  const { fileRelativeUrl } = execution
  const notificationOptions = {
    lang: "en",
    icon: getFaviconHref(),
    clickToFocus: true,
    clickToClose: true,
  }

  if (execution.result.status === "errored") {
    if (previousExecution) {
      if (previousExecution.result.status === "completed") {
        notify("Broken", {
          ...notificationOptions,
          body: `${fileRelativeUrl} execution now failing.`,
        })
      } else {
        notify("Still failing", {
          ...notificationOptions,
          body: `${fileRelativeUrl} execution still failing.`,
        })
      }
    } else {
      notify("Failing", {
        ...notificationOptions,
        body: `${fileRelativeUrl} execution failed.`,
      })
    }
  } else if (previousExecution && previousExecution.result.status === "errored") {
    notify("Fixed", {
      ...notificationOptions,
      body: `${fileRelativeUrl} execution fixed.`,
    })
  }
}

const getFaviconHref = () => {
  const link = document.querySelector('link[rel="icon"]')
  return link ? link.href : undefined
}

/* TODO: ne pas oublier que dans firefox

La permission de notification ne peut être demandée que depuis un gestionnaire d’évènements généré
par l’utilisateur et en cours d’exécution.

Donc en gros depuis le bouton qui active les notifications.
Et dans firefox il faudrait donc jouer avec le checkbox.onclick pour obtenir cette authorisation

*/

const notify = notificationAvailable
  ? async (title, { clickToFocus = false, clickToClose = false, ...options } = {}) => {
      const permission = await requestPermission()
      if (permission === "granted") {
        const notification = new Notification(title, options)
        notification.onclick = () => {
          // but if the user navigated inbetween
          // focusing window will show something else
          // in that case it could be great to do something
          // maybe like showing a message saying this execution
          // is no longer visible
          // we could also navigauate to this file execution but
          // there is no guarantee re-executing the file would give same output
          // and it would also trigger an other notification
          if (clickToFocus) window.focus()
          if (clickToClose) notification.close()
        }
        return notification
      }
      return null
    }
  : () => {}

const requestPermission = notificationAvailable
  ? async () => {
      const permission = await Notification.requestPermission()
      return permission
    }
  : () => Promise.resolve("denied")
