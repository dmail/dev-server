import { assert } from "@jsenv/assert"

import { startServer, fetchUrl } from "@jsenv/server"
import { headersToObject } from "@jsenv/server/src/internal/headersToObject.js"

const { origin, stop } = await startServer({
  logLevel: "warn",
  requestToResponse: () => undefined,
})

{
  const response = await fetchUrl(origin)
  const actual = {
    url: response.url,
    status: response.status,
    statusText: response.statusText,
    headers: headersToObject(response.headers),
    body: await response.text(),
  }
  const expected = {
    url: `${origin}/`,
    status: 501,
    statusText: "Not Implemented",
    headers: {
      "connection": "close",
      "date": actual.headers.date,
      "transfer-encoding": "chunked",
    },
    body: "",
  }
  assert({ actual, expected })
}

stop()
