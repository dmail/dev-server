import { fetchExploringJson } from "@jsenv/core/src/internal/exploring/fetch_exploring_json.js"

import { setAttributes, setStyles } from "./util/dom.js"

/* eslint-disable no-undef */
const TOOLBAR_HTML_RELATIVE_URL =
  typeof __TOOLBAR_BUILD_RELATIVE_URL_ === "undefined"
    ? "./src/internal/toolbar/toolbar.html"
    : __TOOLBAR_BUILD_RELATIVE_URL_
/* eslint-enable no-undef */
const jsenvLogoSvgUrl = new URL("./jsenv_logo.svg", import.meta.url)

const injectToolbar = async () => {
  await new Promise((resolve) => {
    if (window.requestIdleCallback) {
      window.requestIdleCallback(resolve, { timeout: 400 })
    } else {
      window.requestAnimationFrame(resolve)
    }
  })
  const exploringJSON = await fetchExploringJson()
  const placeholder = getToolbarPlaceholder()

  const iframe = document.createElement("iframe")
  setAttributes(iframe, {
    tabindex: -1,
    // sandbox: "allow-forms allow-modals allow-pointer-lock allow-popups allow-presentation allow-same-origin allow-scripts allow-top-navigation-by-user-activation",
    // allow: "accelerometer; ambient-light-sensor; camera; encrypted-media; geolocation; gyroscope; microphone; midi; payment; vr",
    allowtransparency: true,
  })
  setStyles(iframe, {
    "position": "fixed",
    "zIndex": 1000,
    "bottom": 0,
    "left": 0,
    "width": "100%",
    "height": 0,
    /* ensure toolbar children are not focusable when hidden */
    "visibility": "hidden",
    "transition-duration": "300ms",
    "transition-property": "height, visibility",
    "border": "none",
  })
  const iframeLoadedPromise = iframeToLoadedPromise(iframe)
  const jsenvCoreDirectoryServerUrl = new URL(
    exploringJSON.jsenvCoreDirectoryRelativeUrl,
    document.location.origin,
  ).href
  const jsenvToolbarHtmlServerUrl = new URL(
    TOOLBAR_HTML_RELATIVE_URL,
    jsenvCoreDirectoryServerUrl,
  )
  // set iframe src BEFORE putting it into the DOM (prevent firefox adding an history entry)
  iframe.setAttribute("src", jsenvToolbarHtmlServerUrl)
  placeholder.parentNode.replaceChild(iframe, placeholder)

  addToolbarEventCallback(iframe, "toolbar_ready", () => {
    sendCommandToToolbar(iframe, "renderToolbar", { exploringJSON })
  })

  await iframeLoadedPromise
  iframe.removeAttribute("tabindex")

  const div = document.createElement("div")
  div.innerHTML = `
<div id="jsenv-toolbar-trigger">
  <svg id="jsenv-toolbar-trigger-icon">
    <use xlink:href="${jsenvLogoSvgUrl}#jsenv_logo"></use>
  </svg>
  <style>
    #jsenv-toolbar-trigger {
      display: block;
      overflow: hidden;
      position: fixed;
      z-index: 1000;
      bottom: -32px;
      right: 20px;
      height: 40px;
      width: 40px;
      padding: 0;
      margin: 0;
      border-radius: 5px 5px 0 0;
      border: 1px solid rgba(0, 0, 0, 0.33);
      border-bottom: none;
      box-shadow: 0px 0px 6px 2px rgba(0, 0, 0, 0.46);
      background: transparent;
      text-align: center;
      transition: 600ms;
    }

    #jsenv-toolbar-trigger:hover {
      cursor: pointer;
    }

    #jsenv-toolbar-trigger[data-expanded] {
      bottom: 0;
    }

    #jsenv-toolbar-trigger-icon {
      width: 35px;
      height: 35px;
      opacity: 0;
      transition: 600ms;
    }

    #jsenv-toolbar-trigger[data-expanded] #jsenv-toolbar-trigger-icon {
      opacity: 1;
    }
  </style>
</div>`
  const toolbarTrigger = div.firstElementChild
  iframe.parentNode.appendChild(toolbarTrigger)

  let timer
  toolbarTrigger.onmouseenter = () => {
    toolbarTrigger.setAttribute("data-animate", "")
    timer = setTimeout(expandToolbarTrigger, 500)
  }
  toolbarTrigger.onmouseleave = () => {
    clearTimeout(timer)
    collapseToolbarTrigger()
  }
  toolbarTrigger.onfocus = () => {
    toolbarTrigger.removeAttribute("data-animate")
    expandToolbarTrigger()
  }
  toolbarTrigger.onblur = () => {
    toolbarTrigger.removeAttribute("data-animate")
    clearTimeout(timer)
    collapseToolbarTrigger()
  }
  toolbarTrigger.onclick = () => {
    sendCommandToToolbar(iframe, "showToolbar")
  }

  const showToolbarTrigger = () => {
    toolbarTrigger.style.display = "block"
  }

  const hideToolbarTrigger = () => {
    toolbarTrigger.style.display = "none"
  }

  const expandToolbarTrigger = () => {
    toolbarTrigger.setAttribute("data-expanded", "")
  }

  const collapseToolbarTrigger = () => {
    toolbarTrigger.removeAttribute("data-expanded", "")
  }

  hideToolbarTrigger()
  addToolbarEventCallback(iframe, "toolbar-visibility-change", (visible) => {
    if (visible) {
      hideToolbarTrigger()
    } else {
      showToolbarTrigger()
    }
  })

  return iframe
}

const addToolbarEventCallback = (iframe, eventName, callback) => {
  const messageEventCallback = (messageEvent) => {
    const { data } = messageEvent
    if (typeof data !== "object") {
      return
    }
    const { __jsenv__ } = data
    if (!__jsenv__) {
      return
    }
    if (__jsenv__.event !== eventName) {
      return
    }
    callback(__jsenv__.data)
  }

  window.addEventListener("message", messageEventCallback, false)
  return () => {
    window.removeEventListener("message", messageEventCallback, false)
  }
}

const sendCommandToToolbar = (iframe, command, ...args) => {
  iframe.contentWindow.postMessage(
    {
      __jsenv__: {
        command,
        args,
      },
    },
    window.origin,
  )
}

const getToolbarPlaceholder = () => {
  const placeholder = queryPlaceholder()
  if (placeholder) {
    if (document.body.contains(placeholder)) {
      return placeholder
    }
    // otherwise iframe would not be visible because in <head>
    console.warn(
      "element with [data-jsenv-toolbar-placeholder] must be inside document.body",
    )
    return createTooolbarPlaceholder()
  }
  return createTooolbarPlaceholder()
}

const queryPlaceholder = () => {
  return document.querySelector("[data-jsenv-toolbar-placeholder]")
}

const createTooolbarPlaceholder = () => {
  const placeholder = document.createElement("span")
  document.body.appendChild(placeholder)
  return placeholder
}

const iframeToLoadedPromise = (iframe) => {
  return new Promise((resolve) => {
    const onload = () => {
      iframe.removeEventListener("load", onload, true)
      resolve()
    }
    iframe.addEventListener("load", onload, true)
  })
}

if (document.readyState === "complete") {
  injectToolbar()
} else {
  window.addEventListener("load", injectToolbar)
  // document.addEventListener("readystatechange", () => {
  //   if (document.readyState === "complete") {
  //     injectToolbar()
  //   }
  // })
}
