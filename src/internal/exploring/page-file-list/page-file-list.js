import { loadExploringConfig } from "../util/util.js"
import { move } from "../util/animation.js"
import { fetchUrl } from "../util/fetching.js"

export const fileListRoute = {
  name: "file-list",

  match: (url) => {
    return new URL(url).pathname === "/"
  },

  enter: async ({ cancellationToken }) => {
    return {
      title: "Explorable files",
      load: async () => {
        const { projectDirectoryUrl, explorableConfig } = await loadExploringConfig({
          cancellationToken,
        })
        const directoryName = directoryUrlToDirectoryName(projectDirectoryUrl)
        const fileListElement = document.querySelector(`[data-page="file-list"`).cloneNode(true)
        return {
          element: fileListElement,
          mutateElementBeforeDisplay: async () => {
            const span = fileListElement.querySelector("h2 span")
            span.title = projectDirectoryUrl
            span.textContent = directoryName

            const response = await fetchUrl(`/explorables`, {
              method: "POST",
              body: JSON.stringify(explorableConfig),
              headers: {
                "x-jsenv-exploring": "1",
              },
            })
            const files = await response.json()

            const ul = fileListElement.querySelector("ul")
            ul.innerHTML = files
              .map((file) => `<li><a class="execution-link" href=${file}>${file}</a></li>`)
              .join("")

            cancellationToken.register(async ({ reason }) => {
              const { event, destinationUrl } = reason

              // only if we leave this page because of a click
              // (we could also do the animation on history.back() or history.forward())
              // for now let's ignore
              if (event.type !== "click") {
                return
              }

              const href = new URL(destinationUrl).pathname.slice(1)
              const aElement = document.querySelector(`a[href="${href}"]`)
              if (!aElement) {
                return
              }

              // put the file name in the input in the toolbar
              const fileInput = document.querySelector("#file-input")
              // hide the input during animation
              fileInput.style.opacity = "0"
              await move(aElement, fileInput, {
                duration: 700,
                fill: "forwards",
                easing: "ease-in-out",
              })
              fileInput.style.opacity = "1"
            })
          },
        }
      },
    }
  },
}

const directoryUrlToDirectoryName = (directoryUrl) => {
  const slashLastIndex = directoryUrl.lastIndexOf(
    "/",
    // ignore last slash
    directoryUrl.length - 2,
  )
  if (slashLastIndex === -1) return ""

  return directoryUrl.slice(slashLastIndex + 1)
}
