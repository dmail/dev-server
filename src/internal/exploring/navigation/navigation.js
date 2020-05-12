/*

- dans router.js test what happens with history.go(0)
if it trigger popstate ensure we behave corretly
otherwise if it's just location.reload() we got nothing to do

*/

import { setStyles } from "../util/dom.js"
import { fadeIn, fadeOut, transit } from "../util/animation.js"
import { renderToolbar } from "../toolbar/toolbar.js"
import { getAnimationPreference } from "../toolbar/toolbar-animation.js"
import { errorNavigationRoute } from "../page-error-navigation/page-error-navigation.js"
import { fileListRoute } from "../page-file-list/page-file-list.js"
import { fileExecutionRoute } from "../page-file-execution/page-file-execution.js"
import { createRouter } from "./router.js"

export const installNavigation = () => {
  const pageContainer = document.querySelector("#page")
  // const pageLoader = document.querySelector("#page-loader")
  const pageLoaderFading = transit(
    {
      "#page-loader": {
        visibility: "hidden",
        opacity: 0,
      },
    },
    {
      "#page-loader": {
        visibility: "visible",
        opacity: 0.4,
      },
    },
    { duration: 300 },
  )
  const routes = [fileListRoute, fileExecutionRoute]
  const activePage = {
    title: document.title,
    element: document.querySelector('[data-page="default"]'),
  }
  let pageLoaderFadeinPromise
  const router = createRouter(routes, {
    activePage,
    errorRoute: errorNavigationRoute,
    onstart: (navigation) => {
      pageLoaderFadeinPromise = pageLoaderFading.play()
      if (!getAnimationPreference()) {
        pageLoaderFading.finish()
      }
      document.querySelector("#page-loader a").onclick = navigation.cancel

      // every navigation must render toolbar
      // this function is synchronous it's just ui
      renderToolbar(new URL(navigation.destinationUrl).pathname.slice(1), navigation)

      if (navigation.activePage) {
        addBlurFilter(navigation.activePage.element)
        if (navigation.activePage.onleavestart) {
          navigation.activePage.onleavestart(navigation)
        }
      }
    },
    oncancel: (navigation) => {
      // every navigation must render toolbar
      // this function is synchronous it's just ui
      renderToolbar(new URL(navigation.destinationUrl).pathname.slice(1), navigation)

      pageLoaderFading.reverse()
      if (!getAnimationPreference()) {
        pageLoaderFading.finish()
      }
      if (navigation.activePage) {
        removeBlurFilter(navigation.activePage.element)
      }
    },
    onerror: (navigation, error) => {
      pageLoaderFading.reverse()
      if (!getAnimationPreference()) {
        pageLoaderFading.finish()
      }
      if (navigation.activePage) {
        removeBlurFilter(navigation.activePage.element)
      }
      throw error
    },
    enter: async (page, { pageCancellationToken }) => {
      const { effect, title, element, mutateElementBeforeDisplay = () => {} } = page

      const redisplay = setStyles(element, { display: "none" })
      pageContainer.appendChild(element)
      await mutateElementBeforeDisplay()
      // if mutateElementBeforeDisplay and things before it were super fast
      // wait for pageLoader fade in to be done before doing the loader fadeout

      if (pageCancellationToken.cancellationRequested) {
        element.parentNode.removeChild(element)
        return
      }

      if (effect) {
        pageCancellationToken.register(effect())
      }
      if (title) {
        document.title = title
      }

      // show this new page, transition will be handled by leave
      redisplay()
    },
    leave: async (page, { pageCancellationToken, activePage }) => {
      const pageElement = page.element
      const activePageElement = activePage.element

      // if new page is smaller active page can be interacted because pageloader is fadedout ?
      setStyles(pageElement, {
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        top: 0,
      })
      activePageElement.style.position = "relative" // to be sure it's above page element

      pageLoaderFadeinPromise.then(() => {
        pageLoaderFading.reverse()
        if (!getAnimationPreference()) {
          pageLoaderFading.finish()
        }
      })

      const pageElementFadeout = fadeOut(pageElement, {
        cancellationToken: pageCancellationToken,
        duration: getAnimationPreference() ? 300 : 0,
      })
      const activePageElementFadein = fadeIn(activePageElement, {
        cancellationToken: pageCancellationToken,
        duration: getAnimationPreference() ? 300 : 0,
      })

      await Promise.all([pageElementFadeout, activePageElementFadein])

      pageElement.parentNode.removeChild(pageElement)
    },
  })

  const onclick = (clickEvent) => {
    if (clickEvent.defaultPrevented) {
      return
    }

    if (isClickToOpenTab(clickEvent)) {
      return
    }

    const aElement = clickEventToAElement(clickEvent)
    if (!aElement) {
      return
    }

    if (aElementHasSpecificNavigationBehaviour(aElement)) {
      return
    }

    if (aElement.origin !== window.location.origin) {
      return
    }

    clickEvent.preventDefault()
    router.navigateToUrl(aElement.href, clickEvent)
  }
  document.addEventListener("click", onclick)

  // if we cancel this navigation we will just show the default page
  // which is a blank page
  // and reloading the page is the only wait to get this to happen again
  // moreover this function is what we want to call
  // inside file-execution page when we want to re-execute
  router.loadCurrentUrl()

  return () => {
    document.removeEventListener("click", onclick)
  }
}

const addBlurFilter = (element) => {
  /**
  see https://codepen.io/tigt/post/fixing-the-white-glow-in-the-css-blur-filter
    <filter id="better-blur" x="0" y="0" width="1" height="1">
  <feGaussianBlur stdDeviation="[radius radius]" result="blurred"/>

  <feMorphology in="blurred" operator="dilate" radius="[radius radius]" result="expanded"/>

  <feMerge>
    <feMergeNode in="expanded"/>
    <feMergeNode in="blurred"/>
  </feMerge>
</filter>
    */
  element.style.filter = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='a' x='0' y='0' width='1' height='1'%3E%3CfeGaussianBlur stdDeviation='4' result='b'/%3E%3CfeMorphology operator='dilate' radius='4'/%3E %3CfeMerge%3E%3CfeMergeNode/%3E%3CfeMergeNode in='b'/%3E%3C/feMerge%3E%3C/filter%3E%3C/svg%3E#a")`
}

const removeBlurFilter = (element) => {
  element.style.filter = "none"
}

const isClickToOpenTab = (clickEvent) => {
  if (clickEvent.button !== 0) {
    // Chrome < 55 fires a click event when the middle mouse button is pressed
    return true
  }
  if (clickEvent.metaKey) {
    return true
  }
  if (clickEvent.ctrlKey) {
    return true
  }
  return false
}

const clickEventToAElement = (clickEvent) => {
  const target = clickEvent.target
  let elementOrAncestor = target
  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (elementOrAncestor.nodeName === "A") {
      return elementOrAncestor
    }
    elementOrAncestor = elementOrAncestor.parentNode
    if (!elementOrAncestor) {
      return null
    }
  }
}

const aElementHasSpecificNavigationBehaviour = (aElement) => {
  // target="_blank" (open in a new tab)
  if (aElement.target) {
    return true
  }

  // navigator will download the href
  if (aElement.hasAttribute("download")) {
    return true
  }

  // #hash page navigation (scroll to element with this id)
  const { location } = window
  if (
    aElement.origin === location.origin &&
    aElement.pathname === location.pathname &&
    aElement.search
  ) {
    return true
  }

  return false
}
