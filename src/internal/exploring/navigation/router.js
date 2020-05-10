/*

This file is meant to allow having on function called navigate that will be in charge
to implement a website navigation.

navigate({
  cancellationToken, // a token cancelled when navigation is no longer needed or navigated away
  event, // the reason we are navigating
  currentUrl, // where are are
  destinationUrl, // where we want to go
})

When navigate resolves website is considered has having navigated successfully to the next url.
(The ui should reflect the destination url).

This file hooks itself into window.popstate and provide two function

- launchCurrentUrl()

This function should be called asap and will perform the initial page navigation.
Meaning navigate gets called with currentHistoryEntry being undefined

- navigateToUrl(url, state, event)

This function should be called to politely ask to perform a navigation to the given url
after navigationEvent occured (a click on a <a href> for instance).

Every time a navigation is started onstart(navigation) is be called.
you can call navigation.cancel()

When navigate function throw, onerror(navigation, error) is called.

When navigation is cancelled (by you or because an other navigation cancels it)
oncancel(navigation, cancelError) is called.

const route = {
  name: String (optional),
  match: url => Boolean,
  setup: async ({ cancellationToken }, { reload }) => {

  },
  load: async ({ cancellationToken }, { reload, activePage }) => {
    const page = any
    return page
  }
}

See alo:
https://stackoverflow.com/questions/28028297/js-window-history-delete-a-state
https://developer.mozilla.org/en-US/docs/Web/API/History
*/

import {
  createCancellationSource,
  composeCancellationToken,
  isCancelError,
} from "@jsenv/cancellation"

export const createRouter = (
  routes,
  {
    activePage,
    fallbackRoute,
    errorRoute,
    onstart = () => {},
    oncancel = () => {},
    onerror = (navigation) => {
      throw navigation.error
    },
    enter,
    leave,
    oncomplete = () => {},
  },
) => {
  const windowHistory = window.history
  const initialHistoryPosition = windowHistory.state
    ? windowHistory.state.position
    : window.history.length
  const initialHistoryState = windowHistory.state ? windowHistory.state.state : null
  const initialUrl = document.location.href
  let browserHistoryPosition = initialHistoryPosition
  let browserHistoryState = initialHistoryState
  let browserUrl = initialUrl
  let applicationHistoryPosition = initialHistoryPosition
  let applicationHistoryState = initialHistoryState
  let applicationUrl = initialUrl
  let currentRouteCancellationSource
  let currentPageCancellationSource
  let activeRouteCancellationSource
  let activePageCancellationSource
  let activeRoute

  const createNavigation = ({
    type,
    event,
    destinationUrl,
    destinationHistoryPosition,
    destinationHistoryState,
  }) => {
    const externalCancellationSource = createCancellationSource()
    const externalCancellationToken = externalCancellationSource.token
    const routeCancellationSource = createCancellationSource()
    const routeCancellationToken = composeCancellationToken(
      externalCancellationToken,
      routeCancellationSource.token,
    )
    const pageCancellationSource = createCancellationSource()
    const pageCancellationToken = composeCancellationToken(
      routeCancellationToken,
      pageCancellationSource.token,
    )

    const navigation = {
      status: "",
      routeCancellationToken,
      pageCancellationToken,
      cancel: (reason) => {
        navigation.status = "canceled"
        navigation.cancelReason = reason
        externalCancellationSource.cancel(navigation)
      },
      reload: (event = { type: "reload" }) => loadCurrentUrl(event),
      event,
      activePage,
      currentHistoryPosition: applicationHistoryPosition,
      currentHistoryState: applicationHistoryState,
      currentUrl: applicationUrl,
      destinationHistoryPosition,
      destinationHistoryState,
      destinationUrl,
    }

    const start = async () => {
      /*
      a navigation means browser wants to see something that application
      is responsible to show.

      When navigation starts we update
      - browserHistoryPosition
      - browserHistoryState
      - browserUrl
      variables to reflect what browser wants to see

      resolving aysnc navigate means the application is done navigating:
      the ui shows what browser wants to see.
      After resolving we synchronize
      - applicationHistoryPosition
      - applicationHistoryState
      - applicationUrl
      with browser
      */

      navigation.status = "started"
      browserHistoryPosition = destinationHistoryPosition
      browserHistoryState = destinationHistoryState
      browserUrl = destinationUrl

      // replace an history entry (initial navigation or reload)
      if (type === "replace") {
        windowHistory.replaceState(
          { position: browserHistoryPosition, state: browserHistoryState },
          "",
          destinationUrl,
        )
      }
      // create immediatly a new entry in the history (click on a link)
      else if (type === "push") {
        windowHistory.pushState(
          { position: browserHistoryPosition, state: browserHistoryState },
          "",
          destinationUrl,
        )
      }
      // restoring an history entry (popstate)
      else if (type === "restore") {
        if (browserHistoryPosition === applicationHistoryPosition) {
          navigation.status = "completed"
          applicationHistoryPosition = browserHistoryPosition
          applicationHistoryState = browserHistoryState
          applicationUrl = browserUrl
          // (should happen only when cancelling navigation induced by popstate)
          return undefined
        }
      }

      const activateRoute = async (navigation) => {
        onstart(navigation)
        routeCancellationToken.throwIfRequested() // in case external cancellation happens

        if (currentRouteCancellationSource && !navigation.isReload) {
          currentRouteCancellationSource.cancel(navigation)
        }
        if (currentPageCancellationSource) {
          currentPageCancellationSource.cancel(navigation)
        }

        if (!navigation.isReload && navigation.route.setup) {
          currentRouteCancellationSource = routeCancellationSource
          await navigation.route.setup(navigation)
          routeCancellationToken.throwIfRequested()
        }

        currentPageCancellationSource = pageCancellationSource
        const page = await navigation.route.load(navigation)
        routeCancellationToken.throwIfRequested()

        await enter(page, navigation)
        // at this point we put page in the DOM but it's no longer needed
        // let's remove it from the DOM and throw to cancel the navigation
        routeCancellationToken.throwIfRequested()

        // remove currentPage from the DOM
        const pageLeft = activePage

        activeRoute = navigation.route
        activePage = page
        navigation.page = page
        navigation.activePage = activePage
        currentRouteCancellationSource = undefined
        currentPageCancellationSource = undefined

        if (activeRouteCancellationSource) {
          if (navigation.isReload) {
            activePageCancellationSource.cancel(navigation)
          } else {
            activeRouteCancellationSource.cancel(navigation)
          }
        }
        activeRouteCancellationSource = routeCancellationSource
        activePageCancellationSource = pageCancellationSource

        if (pageLeft) {
          leave(pageLeft, navigation)
        }

        return page
      }

      const handleCancel = (cancelError) => {
        navigation.status = "canceled"
        navigation.cancelError = cancelError
        const movement = applicationHistoryPosition - browserHistoryPosition
        if (movement) {
          windowHistory.go(movement)
        }
        return oncancel(navigation)
      }

      if (type === "replace" && activeRoute) {
        navigation.route = activeRoute
        navigation.isReload = true
      } else {
        navigation.route =
          routes.find((route) => route.match(navigation.destinationUrl, navigation)) ||
          fallbackRoute
        navigation.isReload = false
      }

      try {
        await activateRoute(navigation)
      } catch (error) {
        if (isCancelError(error)) {
          return handleCancel(error)
        }
        navigation.status = "errored"
        navigation.error = error
        if (!errorRoute) {
          return onerror(navigation)
        }

        try {
          navigation.route = errorRoute
          await activateRoute(navigation)
        } catch (internalError) {
          if (isCancelError(internalError)) {
            return handleCancel(internalError)
          }
          // error while trying to load error route
          // by default we will throw because it's an unexpected internal error.
          navigation.originalError = error
          navigation.error = internalError
          return onerror(navigation)
        }
      }
      navigation.status = "completed"
      applicationHistoryPosition = browserHistoryPosition
      applicationHistoryState = browserHistoryState
      applicationUrl = browserUrl

      return oncomplete(navigation)
    }

    navigation.start = start

    return navigation
  }

  const loadCurrentUrl = (navigationEvent = { type: "initial-navigation" }) => {
    const navigation = createNavigation({
      type: "replace",
      event: navigationEvent,
      destinationHistoryPosition: applicationHistoryPosition,
      destinationHistoryState: applicationHistoryState,
      destinationUrl: applicationUrl,
    })
    return navigation.start()
  }

  const navigateToUrl = async (destinationUrl, destinationHistoryState, navigationEvent) => {
    destinationUrl = new URL(destinationUrl, document.location).href // resolve relative urls
    const navigation = createNavigation({
      type: "push",
      event: navigationEvent,
      destinationHistoryPosition: applicationHistoryPosition + 1,
      destinationHistoryState,
      destinationUrl,
    })
    return navigation.start()
  }

  window.onpopstate = async (popstateEvent) => {
    /*
      This navigation occurs because:
      - user click browser back button
      - user click browser forward button
      - programmatic history.back(), history.forward(), history.go()

      In this context the browser already moved in the history (and window.location is up-to-date).
      Assuming we want to cancel history.back() we will call history.forward()
      and when receiving popstate corresponding to that history.forward() we'll compare
      windowHistory.state with our current state and if they are the same
      we don't need to naviguate.
    */
    const popstateHistoryEntry = popstateEvent.state
    const destinationHistoryPosition = popstateHistoryEntry.position
    const destinationHistoryState = popstateHistoryEntry.state
    const destinationUrl = document.location.href
    const popstateNavigation = createNavigation({
      type: "restore",
      event: popstateEvent,
      destinationHistoryPosition,
      destinationHistoryState,
      destinationUrl,
    })
    popstateNavigation.start()
  }

  // we could imagine exporting a router.activateRoute
  // that would skip the match part
  // we could have in the ui a page that does not match the browser url
  // just because we can (also might be useful for unit test)

  return {
    loadCurrentUrl,
    navigateToUrl,
  }
}
