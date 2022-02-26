import { urlToRelativeUrl } from "@jsenv/filesystem"

import { createRessourceGraph } from "@jsenv/core/src/internal/autoreload/ressource_graph.js"
import { findAsync } from "#omega/internal/find_async.js"

import { parseJsModuleUrlMentions } from "./js_module/js_module_url_mentions.js"

const urlMentionParsers = [parseJsModuleUrlMentions]

export const jsenvPluginUrlMentions = ({ projectDirectoryUrl }) => {
  const ressourceGraph = createRessourceGraph({ projectDirectoryUrl })

  return {
    name: "jsenv:url_mentions",

    appliesDuring: {
      dev: true,
      test: true,
      preview: true,
      build: true,
    },

    transform: async ({
      projectDirectoryUrl,
      urlInfoMap,
      resolve,
      url,
      urlFacade,
      contentType,
      content,
    }) => {
      const parseReturnValue = await findAsync({
        array: urlMentionParsers,
        start: (urlMentionParser) => {
          return urlMentionParser({
            url,
            urlFacade,
            content,
          })
        },
        predicate: (returnValue) => Boolean(returnValue),
      })
      if (!parseReturnValue) {
        return null
      }
      const {
        urlMentions,
        hotDecline,
        hotAcceptSelf,
        hotAcceptDependencies,
        transformUrlMentions,
      } = parseReturnValue
      await urlMentions.reduce(async (previous, urlMention) => {
        await previous
        const resolvedUrl = await resolve({
          parentUrl: url,
          specifierType: urlMention.type, // 'js_import_meta_url_pattern', 'js_import_export'
          specifier: urlMention.specifier,
        })
        urlMention.url = resolvedUrl
      }, Promise.resolve())
      ressourceGraph.updateRessourceDependencies({
        url,
        type: contentType,
        dependencyUrls: urlMentions.map((urlMention) => urlMention.url),
        hotDecline,
        hotAcceptSelf,
        hotAcceptDependencies,
      })
      const hmr = new URL(url).searchParams.get("hmr")
      const transformReturnValue = await transformUrlMentions({
        transformUrlMention: (urlMention) => {
          const { urlFacade, urlVersion } = urlInfoMap.get(urlMention.url)
          const hmrTimestamp = hmr
            ? ressourceGraph.getHmrTimestamp(urlMention.url)
            : null
          const mentionedUrl = urlFacade || urlMention.url
          const specifier = isValidUrl(mentionedUrl)
            ? `/${urlToRelativeUrl(mentionedUrl, projectDirectoryUrl)}`
            : mentionedUrl
          const params = {}
          if (hmrTimestamp) {
            params.hmr = ""
            params.v = hmrTimestamp
          } else if (urlVersion) {
            params.v = urlVersion
          }
          const specifierWithParams = injectQueryParamsToSpecifier(
            specifier,
            params,
          )
          return specifierWithParams
        },
      })
      return transformReturnValue
    },
  }
}

const injectQueryParamsToSpecifier = (specifier, params) => {
  const urlObject = new URL(specifier, "file://")
  Object.keys(params).forEach((key) => {
    urlObject.searchParams.set(key, params[key])
  })
  const urlWithParams = urlObject.href
  // specifier was absolute, keep it absolute
  if (specifier.startsWith("file:") || !urlWithParams.startsWith("file:")) {
    return urlWithParams
  }
  return urlWithParams.slice("file://".length)
}

const isValidUrl = (url) => {
  try {
    // eslint-disable-next-line no-new
    new URL(url)
    return true
  } catch (e) {
    return false
  }
}
