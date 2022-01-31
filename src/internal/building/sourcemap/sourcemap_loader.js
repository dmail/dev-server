import { resolveUrl } from "@jsenv/filesystem"
import { createDetailedMessage } from "@jsenv/logger"

import { DataUrl } from "@jsenv/core/src/internal/data_url.js"
import { fetchUrl } from "@jsenv/core/src/internal/fetching.js"
import { validateResponse } from "@jsenv/core/src/internal/response_validation.js"

export const loadSourcemap = async ({
  signal,
  logger,

  code,
  url,
  getSourceMappingUrl,
} = {}) => {
  const sourcemapSpecifier = getSourceMappingUrl(code)
  if (!sourcemapSpecifier) {
    return null
  }

  const sourcemapUrl = resolveUrl(sourcemapSpecifier, url)
  if (sourcemapUrl.startsWith("data:")) {
    const sourcemapString = DataUrl.parse(sourcemapUrl, { as: "string" })
    return parseSourcemapString(
      sourcemapString,
      sourcemapUrl,
      `inline comment in ${url}`,
    )
  }

  const sourcemapResponse = await fetchUrl(sourcemapUrl, {
    signal,
    ignoreHttpsError: true,
  })
  const { isValid, details } = await validateResponse(sourcemapResponse, {
    // we could have a better trace
    // by appending the reference found in code
    // to an existing urlTrace array
    // good enough for now
    urlTrace: url,
    contentTypeExpected: ["application/json", "application/octet-stream"],
  })
  if (!isValid) {
    logger.warn(
      createDetailedMessage(`unexpected response for sourcemap`, details),
    )
    return null
  }

  const sourcemapBodyAsText = await sourcemapResponse.text()
  return parseSourcemapString(sourcemapBodyAsText, sourcemapUrl, url)
}

const parseSourcemapString = (sourcemapString, sourcemapUrl, importer) => {
  try {
    return JSON.parse(sourcemapString)
  } catch (e) {
    if (e.name === "SyntaxError") {
      console.error(
        createDetailedMessage(`syntax error while parsing sourcemap.`, {
          ["syntax error stack"]: e.stack,
          ["sourcemap url"]: sourcemapUrl,
          ["imported by"]: importer,
        }),
      )
      return null
    }
    throw e
  }
}
