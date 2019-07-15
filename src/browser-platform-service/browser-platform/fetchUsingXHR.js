import { hrefToOrigin } from "@jsenv/module-resolution/src/hrefToOrigin.js"

export const fetchUsingXHR = (url, { credentials = "same-origin", headers = {} }) => {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()

    const cleanup = () => {
      xhr.ontimeout = null
      xhr.onerror = null
      xhr.onload = null
      xhr.onreadystatechange = null
    }

    xhr.ontimeout = () => {
      cleanup()
      reject(createRequestTimeoutError({ url }))
    }

    xhr.onerror = (error) => {
      cleanup()
      if (typeof window.ProgressEvent === "function" && error instanceof ProgressEvent) {
        // unfortunately with have no clue why it fails
        // might be cors for instance
        reject(createRequestError({ url }))
      } else {
        reject(error)
      }
    }

    xhr.onload = () => {
      cleanup()
      if (xhr.status === 0) {
        resolve({
          ...normalizeXhr(xhr),
          status: 200,
        })
      } else {
        resolve(normalizeXhr(xhr))
      }
    }

    xhr.onreadystatechange = () => {
      if (xhr.readyState !== 4) {
        return
      }

      // in Chrome on file:/// URLs, status is 0
      if (xhr.status === 0) {
        if (xhr.responseText) {
          xhr.onload()
        }
        return
      }

      cleanup()
      resolve(normalizeXhr(xhr))
    }

    xhr.open("GET", url, true)
    Object.keys(headers).forEach((key) => {
      xhr.setRequestHeader(key, headers[key])
    })
    xhr.withCredentials = computeWithCredentials({ credentials, url })

    xhr.send(null)
  })
}

// https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch
const computeWithCredentials = ({ credentials, url }) => {
  if (credentials === "same-origin") {
    return originSameAsGlobalOrigin(url)
  }
  return credentials === "include"
}

const originSameAsGlobalOrigin = (url) => {
  // if we cannot read globalOrigin from window.location.origin, let's consider it's ok
  if (typeof window !== "object") return true
  if (typeof window.location !== "object") return true
  const globalOrigin = window.location.origin
  if (globalOrigin === "null") return true
  return hrefToOrigin(url) === globalOrigin
}

const createRequestError = ({ url }) => {
  const error = new Error(`request error.
url: ${url}`)
  error.code = "REQUEST_ERROR"
  return error
}

const createRequestTimeoutError = ({ url }) => {
  const error = new Error(`request timeout.
url: ${url}`)
  error.code = "REQUEST_TIMEOUT"
  return error
}

const normalizeXhr = (xhr) => {
  return {
    // https://developer.mozilla.org/en-US/docs/Web/API/XMLHttpRequest/responseURL
    url: xhr.responseURL,
    status: xhr.status,
    statusText: xhr.statusText,
    headers: getHeadersFromXHR(xhr),
    body: xhr.responseText,
  }
}

// https://developer.mozilla.org/en-US/docs/Web/API/XMLHttpRequest/getAllResponseHeaders#Example
const getHeadersFromXHR = (xhr) => {
  const headerMap = {}

  const headersString = xhr.getAllResponseHeaders()
  if (headersString === "") return headerMap

  const lines = headersString.trim().split(/[\r\n]+/)
  lines.forEach((line) => {
    const parts = line.split(": ")
    const name = parts.shift()
    const value = parts.join(": ")
    headerMap[name.toLowerCase()] = value
  })

  return headerMap
}
