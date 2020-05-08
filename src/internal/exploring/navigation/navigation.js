/*

TODO:

- faire deux fois router.loadCurrentUrl()
le deuxieme doit cancel le load de la pageView
mais ne doit pas cancel la navigation a proprement parler
en gros on a un routeCancellationToken (on change de route)
et un pageLoadCancellationToken (on a plus besoin de load la page)
  et celui ci est cancel si on change de route of course

- on a pas de currentPageView par défaut
on ne sait donc pas comment faire la transition
pour la page initiale
il faudrait ptet le passer a createRouter en lui filant la page par défaut

- dans router.js test what happens with history.go(0)
if it trigger popstate ensure we behave corretly
otherwise if it's just location.reload() we got nothing to do

*/

import { fadeIn, transit } from "../util/animation.js"
import { renderToolbar } from "../toolbar/toolbar.js"
import { errorNavigationRoute } from "../page-error-navigation/page-error-navigation.js"
import { fileListRoute } from "../page-file-list/page-file-list.js"
import { fileExecutionRoute } from "../page-file-execution/page-file-execution.js"
import { createRouter } from "./router.js"

export const installNavigation = () => {
  const pageContainer = document.querySelector("#page")
  // const pageLoader = document.querySelector("#page-loader")
  const pageLoaderFadein = transit(
    {
      "#page-loader": { visibility: "hidden", opacity: 0 },
    },
    {
      "#page-loader": { visibility: "visible", opacity: 0.2 },
    },
    { duration: 300 },
  )
  const routes = [fileListRoute, fileExecutionRoute]
  const router = createRouter(routes, {
    errorRoute: errorNavigationRoute,
    onstart: (navigation) => {
      pageLoaderFadein.play()

      // every navigation must render toolbar
      // this function is synchronous it's just ui
      renderToolbar(new URL(navigation.destinationUrl).pathname.slice(1), navigation)
    },
    oncancel: () => {
      pageLoaderFadein.reverse()
    },
    onerror: (navigation, error) => {
      pageLoaderFadein.reverse()
      throw error
    },
    addPageView: async (pageView, currentPageView, { cancellationToken }) => {
      const { title, element, mutateElementBeforeDisplay = () => {} } = pageView

      if (title) {
        document.title = title
      }
      element.style.display = "none"
      pageContainer.appendChild(element)
      await mutateElementBeforeDisplay()
      // if everything is super fast it might be better to wait for pageLoader fade in to be done
      // before doing the loader fadeout but this is to be checked
      // await fadeinPromise
      pageLoaderFadein.reverse()

      // if we got cancelled during mutateElementBeforeDisplay
      // no need to perform the DOM changes and the animation the element
      // will be removed anyway
      if (cancellationToken.cancellationRequested) {
        return
      }

      currentPageView.element.style.position = "absolute"
      element.style.position = "relative"
      element.style.display = "block"
      const elementFadein = fadeIn(element, { duration: 300 })
      await elementFadein
    },
    removePageView: ({ element, onPageViewRemoved = () => {} }) => {
      pageContainer.removeChild(element)
      onPageViewRemoved()
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
    router.navigateToUrl(aElement.href, {}, clickEvent)
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
