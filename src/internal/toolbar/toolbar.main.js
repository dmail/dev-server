/* eslint-disable import/max-dependencies */
import { urlIsInsideOf } from "@jsenv/util/src/urlIsInsideOf.js"
import { urlToRelativeUrl } from "@jsenv/util/src/urlToRelativeUrl.js"
import { loadExploringConfig } from "./util/util.js"
import "./focus/toolbar.focus.js"
import { renderBackToListInToolbar } from "./backtolist/toolbar.backtolist.js"
import { getToolbarIframe, deactivateToolbarSection, setStyles } from "./util/dom.js"
import { registerNotifications } from "./util/notification.js"
import { createPreference } from "./util/preferences.js"
import { hideTooltip, hideAllTooltip } from "./tooltip/tooltip.js"
import { renderToolbarSettings, hideSettings } from "./settings/toolbar.settings.js"
import { renderToolbarTheme } from "./theme/toolbar.theme.js"
import { renderToolbarAnimation } from "./animation/toolbar.animation.js"
import { renderExecutionInToolbar } from "./execution/toolbar.execution.js"
import { renderToolbarLivereload } from "./livereloading/toolbar.livereloading.js"
import { makeToolbarResponsive } from "./responsive/toolbar.responsive.js"

const toolbarVisibilityPreference = createPreference("toolbar")

const renderToolbar = async () => {
  const executedFileCompiledUrl = window.parent.location.href
  const compileServerOrigin = window.parent.location.origin
  // this should not block the whole toolbar rendering + interactivity
  // (but this is not the main reason it feels lagish)
  const exploringConfig = await loadExploringConfig()
  const { outDirectoryRelativeUrl } = exploringConfig
  const outDirectoryRemoteUrl = String(new URL(outDirectoryRelativeUrl, compileServerOrigin))
  const executedFileRelativeUrl = urlToOriginalRelativeUrl(
    executedFileCompiledUrl,
    outDirectoryRemoteUrl,
  )

  const toolbarOverlay = document.querySelector("#toolbar-overlay")
  toolbarOverlay.onclick = () => {
    hideAllTooltip()
    hideSettings()
  }

  const toolbarElement = document.querySelector("#toolbar")
  exposeOnParentWindow({
    toolbar: {
      element: toolbarElement,
      show: showToolbar,
      hide: () => hideToolbar(),
    },
  })

  const toolbarVisible = toolbarVisibilityPreference.has()
    ? toolbarVisibilityPreference.get()
    : true

  if (toolbarVisible) {
    showToolbar({ animate: false })
  } else {
    hideToolbar({ animate: false })
  }

  renderBackToListInToolbar({
    outDirectoryRelativeUrl,
    exploringHtmlFileRelativeUrl: exploringConfig.exploringHtmlFileRelativeUrl,
  })

  registerNotifications()
  makeToolbarResponsive()
  renderToolbarSettings()
  renderToolbarAnimation()
  renderToolbarTheme()
  renderExecutionInToolbar({ executedFileRelativeUrl })
  // this might become active but we need to detect this somehow
  deactivateToolbarSection(document.querySelector("#file-list-link"))
  renderToolbarLivereload({ executedFileRelativeUrl })

  // if user click enter or space quickly while closing toolbar
  // it will cancel the closing
  // that's why I used toggleToolbar and not hideToolbar
  document.querySelector("#button-close-toolbar").onclick = () => toogleToolbar()
}

const exposeOnParentWindow = (object) => {
  let { __jsenv__ } = window.parent
  if (!__jsenv__) {
    __jsenv__ = {}
    window.parent.__jsenv__ = {}
  }

  Object.assign(__jsenv__, object)
}

const toogleToolbar = () => {
  if (toolbarIsVisible()) {
    hideToolbar()
  } else {
    showToolbar()
  }
}

const toolbarIsVisible = () => document.documentElement.hasAttribute("data-toolbar-visible")

let hideToolbar = () => {
  // toolbar hidden by default, nothing to do to hide it by default
  sendEventToParent("toolbar-visibility-change", false)
}

// (by the way it might be cool to have the toolbar auto show when)
// it has something to say (being disconnected from livereload server)
const showToolbar = ({ animate = true } = {}) => {
  toolbarVisibilityPreference.set(true)
  if (animate) {
    document.documentElement.setAttribute("data-toolbar-animation", "")
  } else {
    document.documentElement.removeAttribute("data-toolbar-animation")
  }
  document.documentElement.setAttribute("data-toolbar-visible", "")

  sendEventToParent("toolbar-visibility-change", true)

  const toolbarIframe = getToolbarIframe()
  const toolbarIframeParent = toolbarIframe.parentNode

  // maybe we should use js animation here because we would not conflict with css
  const restoreToolbarIframeParentStyles = setStyles(toolbarIframeParent, {
    "scroll-padding-bottom": "40px", // same here we should add 40px
    "transition-property": "padding-bottom",
    "transition-duration": "300ms",
    "padding-bottom": "40px", // if there is already one we should add 40px
  })
  const restoreToolbarIframeStyles = setStyles(toolbarIframe, {
    "height": "40px",
    "visibility": "visible",
    "transition-property": "height, visibility",
    "transition-duration": "300ms",
  })

  hideToolbar = () => {
    restoreToolbarIframeParentStyles()
    restoreToolbarIframeStyles()

    hideTooltip(document.querySelector("#livereload-indicator"))
    hideTooltip(document.querySelector("#execution-indicator"))
    toolbarVisibilityPreference.set(false)
    if (animate) {
      document.documentElement.setAttribute("data-toolbar-animation", "")
    } else {
      document.documentElement.removeAttribute("data-toolbar-animation")
    }
    document.documentElement.removeAttribute("data-toolbar-visible")
    sendEventToParent("toolbar-visibility-change", false)
  }
}

const urlToOriginalRelativeUrl = (url, outDirectoryRemoteUrl) => {
  if (urlIsInsideOf(url, outDirectoryRemoteUrl)) {
    const afterCompileDirectory = urlToRelativeUrl(url, outDirectoryRemoteUrl)
    const fileRelativeUrl = afterCompileDirectory.slice(afterCompileDirectory.indexOf("/") + 1)
    return fileRelativeUrl
  }
  return new URL(url).pathname.slice(1)
}

const sendEventToParent = (type, value) => {
  window.parent.postMessage(
    {
      jsenv: true,
      type,
      value,
    },
    "*",
  )
}

renderToolbar()
