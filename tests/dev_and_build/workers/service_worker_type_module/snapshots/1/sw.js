
self.serviceWorkerUrls = {
  "/main.html": {
    "versioned": false,
    "version": "3d5abac8"
  },
  "/css/style.css?v=0e312da1": {
    "versioned": true
  }
};
/* globals self */

self.order = [];

self.addEventListener("message", async (messageEvent) => {
  if (messageEvent.data === "inspect") {
    messageEvent.ports[0].postMessage({
      order: self.order,
      serviceWorkerUrls: self.serviceWorkerUrls,
    });
  }
});

// trigger jsenv dynamic import for slicedToArray
const fn = ([a]) => {
  console.log(a);
};
fn(["a"]);
