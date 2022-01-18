import {
  urlIsInsideOf,
  urlToRelativeUrl,
  urlToRessource,
  normalizeStructuredMetaMap,
  urlToMeta,
} from "@jsenv/filesystem"

import { fetchUrl } from "@jsenv/core/src/internal/fetchUrl.js"
import { validateResponseIntegrity } from "@jsenv/core/src/internal/integrity/integrity_validation.js"

import { originDirectoryConverter } from "./origin_directory_converter.js"

export const createJsenvRemoteDirectory = ({
  projectDirectoryUrl,
  jsenvDirectoryRelativeUrl,
  preservedUrls,
}) => {
  const jsenvRemoteDirectoryUrl = `${projectDirectoryUrl}${jsenvDirectoryRelativeUrl}.remote/`
  const structuredMetaMap = normalizeStructuredMetaMap(
    { preserved: preservedUrls },
    projectDirectoryUrl,
  )
  const isPreservedUrl = (url) => {
    const meta = urlToMeta({ url, structuredMetaMap })
    return Boolean(meta.preserved)
  }

  const jsenvRemoteDirectory = {
    isPreservedUrl,

    isRemoteUrl: (url) => {
      return url.startsWith("http://") || url.startsWith("https://")
    },

    isFileUrlForRemoteUrl: (url) => {
      return urlIsInsideOf(url, jsenvRemoteDirectoryUrl)
    },

    fileUrlFromRemoteUrl: (remoteUrl) => {
      const origin = originFromUrlOrUrlPattern(remoteUrl)
      const ressource = urlToRessource(remoteUrl)
      const [pathname, search = ""] = ressource.split("?")
      const directoryName = originDirectoryConverter.toDirectoryName(origin)
      const fileRelativeUrl = `${directoryName}${
        pathname === "" ? "/" : pathname
      }`
      const fileUrl = `${jsenvRemoteDirectoryUrl}${fileRelativeUrl}${search}`
      return fileUrl
    },

    remoteUrlFromFileUrl: (fileUrl) => {
      const fileRelativeUrl = urlToRelativeUrl(fileUrl, jsenvRemoteDirectoryUrl)
      const { search } = new URL(fileUrl)
      const firstSlashIndex = fileRelativeUrl.indexOf("/")
      const directoryName = fileRelativeUrl.slice(0, firstSlashIndex)
      const origin = originDirectoryConverter.fromDirectoryName(directoryName)
      const pathname = fileRelativeUrl.slice(firstSlashIndex)
      const remoteUrl = `${origin}${pathname}${search}`
      return remoteUrl
    },

    fetchFileUrlAsRemote: async (url, request) => {
      const urlObject = new URL(url)
      const integrity = urlObject.searchParams.get("integrity")
      if (integrity) {
        urlObject.searchParams.delete("integrity")
      }
      const remoteUrl = jsenvRemoteDirectory.remoteUrlFromFileUrl(
        urlObject.href,
      )
      const requestHeadersToForward = { ...request.headers }
      delete requestHeadersToForward.host
      const response = await fetchUrl(remoteUrl, {
        mode: "cors",
        headers: requestHeadersToForward,
      })
      if (response.status !== 200) {
        throw createRemoteFetchError({
          code: "UNEXPECTED_STATUS",
          message: `unexpected status for ressource "${remoteUrl}", received ${response.status}`,
        })
      }
      if (integrity) {
        try {
          await validateResponseIntegrity(response, integrity)
        } catch (e) {
          throw createRemoteFetchError({
            code: e.code,
            message: e.message,
          })
        }
      }
      return response
    },
  }

  return jsenvRemoteDirectory
}

const createRemoteFetchError = ({ message, code }) => {
  const error = new Error(message)
  error.code = "UNEXPECTED_REMOTE_URL_RESPONSE"
  error.asResponse = () => {
    const data = {
      code,
      message,
    }
    const json = JSON.stringify(data)
    return {
      status: 502,
      statusText: "Bad Gateway",
      headers: {
        "cache-control": "no-store",
        "content-length": Buffer.byteLength(json),
        "content-type": "application/json",
      },
      body: json,
    }
  }
  return error
}

const originFromUrlOrUrlPattern = (url) => {
  if (url.startsWith("http://")) {
    const slashAfterProtocol = url.indexOf("/", "http://".length + 1)
    if (slashAfterProtocol === -1) {
      return url
    }
    const origin = url.slice(0, slashAfterProtocol)
    return origin
  }
  if (url.startsWith("https://")) {
    const slashAfterProtocol = url.indexOf("/", "https://".length + 1)
    if (slashAfterProtocol === -1) {
      return url
    }
    const origin = url.slice(0, slashAfterProtocol)
    return origin
  }
  if (url.startsWith("file://")) {
    return "file://"
  }
  return new URL(url).origin
}
