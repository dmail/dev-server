export const errorNavigationRoute = {
  name: "error-navigation",

  enter: (navigation, error) => {
    return {
      // title: "Error", // Keep the original error title ?
      load: () => {
        const element = document.querySelector(`[data-page="error-navigation"`).cloneNode(true)

        const title = element.querySelector("h1")
        title.textContent = `Error during navigation to ${navigation.destinationUrl}.`

        const pre = element.querySelector("pre")
        pre.textContent = error.stack || error

        return {
          element,
        }
      },
    }
  },
}
