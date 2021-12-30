/* globals self */

self.order = []
self.order.push("before-a")

// eslint-disable-next-line import/first
import "./a.js"

self.order.push("after-a")

self.addEventListener("message", async (messageEvent) => {
  if (messageEvent.data === "inspect") {
    messageEvent.ports[0].postMessage({
      order: self.order,
      generatedUrlsConfig: self.generatedUrlsConfig,
    })
  }
})

// trigger jsenv dynamic import for slicedToArray
const fn = ([a]) => {
  console.log(a)
}
fn(["a"])
