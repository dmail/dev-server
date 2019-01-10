import { createBody } from "./createConnection/index.js"
import { headersFromObject } from "./headers.js"

export const nodeRequestToRequest = (nodeRequest, origin) => {
  const ressource = nodeRequest.url.slice(1)
  const { method } = nodeRequest
  const headers = headersFromObject(nodeRequest.headers)
  const body = createBody(
    method === "POST" || method === "PUT" || method === "PATCH" ? nodeRequest : undefined,
  )

  return Object.freeze({
    origin,
    ressource,
    method,
    headers,
    body,
  })
}
