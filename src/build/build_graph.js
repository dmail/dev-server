import { createLog, startSpinner, UNICODE, ANSI } from "@jsenv/log"
import { urlToFilename } from "@jsenv/filesystem"

import { createProjectGraph } from "@jsenv/core/src/omega/project_graph.js"
import { createKitchen } from "@jsenv/core/src/omega/kitchen/kitchen.js"
import { composeTwoSourcemaps } from "@jsenv/core/src/utils/sourcemap/sourcemap_composition.js"
import { generateContentHash } from "@jsenv/core/src/utils/url_versioning.js"
import { byteAsFileSize } from "@jsenv/core/src/utils/logs/size_log.js"
import { msAsDuration } from "@jsenv/core/src/utils/logs/duration_log.js"

import { jsenvPluginAvoidVersioningCascade } from "./plugins/avoid_versioning_cascade/jsenv_plugin_avoid_versioning_cascade.js"
import { parseUrlMentions } from "../omega/url_mentions/parse_url_mentions.js"
import { applyLeadingSlashUrlResolution } from "../omega/kitchen/leading_slash_url_resolution.js"

export const buildGraph = async ({
  signal,
  logger,
  projectDirectoryUrl,
  buildUrlsGenerator,

  entryPoints,
  plugins,
  runtimeSupport,
  sourcemapInjection,
  lineBreakNormalization = process.platform === "win32",
}) => {
  const startMs = Date.now()
  const buildingLog = createLog()
  const spinner = startSpinner({
    log: buildingLog,
    text: `Loading project graph`,
  })
  let kitchen
  const urlPromiseCache = {}
  let urlCount = 0
  const cookUrl = ({ url, ...rest }) => {
    const promiseFromCache = urlPromiseCache[url]
    if (promiseFromCache) return promiseFromCache
    const promise = _cookUrl({
      outDirectoryName: `build`,
      runtimeSupport,
      url,
      ...rest,
    })
    urlPromiseCache[url] = promise
    return promise
  }

  const _cookUrl = async (params) => {
    urlCount++
    spinner.text = `Loading project graph ${urlCount}`
    const cookedUrl = await kitchen.cookUrl(params)
    if (cookedUrl.error) {
      spinner.stop(`${UNICODE.FAILURE} Failed to load project graph`)
      throw cookedUrl.error
    }
    await Promise.all(
      cookedUrl.urlMentions.map(async (urlMention) => {
        await cookUrl({
          parentUrl: cookedUrl.url,
          urlTrace: {
            type: "url_site",
            value: {
              url: cookedUrl.url,
              line: urlMention.line,
              column: urlMention.column,
            },
          },
          url: urlMention.url,
        })
      }),
    )
    return cookedUrl
  }

  const projectGraph = createProjectGraph({
    projectDirectoryUrl,
    scenario: "build",
  })
  kitchen = createKitchen({
    signal,
    logger,
    projectDirectoryUrl,
    plugins: [
      {
        name: "jsenv:build",
        appliesDuring: { build: true },
        cooked: ({ projectGraph, url, type }) => {
          // at this stage all deps are known and url mentions are replaced
          // "content" accurately represent the file content
          // and can be used to version the url
          const urlInfo = projectGraph.urlInfos[url]
          const { buildRelativeUrl, buildUrl } = buildUrlsGenerator.generate(
            urlToFilename(url),
            type === "js_module" ? "/" : "assets/",
          )
          urlInfo.buildRelativeUrl = buildRelativeUrl
          urlInfo.buildUrl = buildUrl
        },
      },
      jsenvPluginAvoidVersioningCascade(),
      ...plugins,
    ],
    runtimeSupport,
    sourcemapInjection,
    projectGraph,
    scenario: "build",
  })

  await Object.keys(entryPoints).reduce(
    async (previous, entryPointRelativeUrl) => {
      await previous
      const entryPointUrl = kitchen.resolveSpecifier({
        parentUrl: projectDirectoryUrl,
        specifierType: "http_request", // not really but kinda
        specifier: entryPointRelativeUrl,
      })
      await cookUrl({
        parentUrl: projectDirectoryUrl,
        urlTrace: {
          type: "parameter",
          value: `"entryPoints" parameter to buildProject`,
        },
        url: entryPointUrl,
      })
    },
    Promise.resolve(),
  )

  // here we can perform many checks such as ensuring ressource hints are used
  // circular deps, etc
  // we could also compute all assets version and urls starting with least dependent one
  // but maybe we'll keep that for later?
  // now we are done here we want
  // to build js modules entry points using rollup
  // the other js modules will be discovered as rollup loads js

  const visited = []
  const sorted = []
  const visit = (url, importerUrl) => {
    const isSorted = sorted.includes(url)
    if (isSorted) return
    const isVisited = visited.includes(url)
    if (isVisited) {
      throw new Error(`Circular dependency between ${url} and ${importerUrl}`)
    }
    visited.push(url)
    projectGraph.urlInfos[url].dependencies.forEach((dependencyUrl) => {
      visit(dependencyUrl, url)
    })
    sorted.push(url)
  }
  Object.keys(projectGraph.urlInfos).forEach((url) => {
    visit(url)
  })
  await sorted.reduce(async (previous, url) => {
    await previous
    const urlInfo = projectGraph.urlInfos[url]
    if (urlInfo.version === undefined) {
      urlInfo.version = generateContentHash(urlInfo.content, {
        contentType: urlInfo.contentType,
        lineBreakNormalization,
      })
    }
    // file using this file must update their reference
    const { urlMentions, replaceUrls } = await parseUrlMentions({
      type: urlInfo.type,
      url: urlInfo.url,
      content: urlInfo.content,
    })
    if (urlMentions.length) {
      const replacements = {}
      for (const urlMention of urlMentions) {
        const urlMentionUrl =
          applyLeadingSlashUrlResolution(
            urlMention.specifier,
            projectDirectoryUrl,
          ) || new URL(urlMention.specifier, urlInfo.url).href
        urlMention.url = urlMentionUrl
        const urlMentionInfo = projectGraph.urlInfos[urlMentionUrl]
        if (urlMentionInfo.version) {
          const urlObject = new URL(urlMentionUrl)
          urlObject.searchParams.set("v", urlMentionInfo.version)
          // TODO: stringify only when inside js
          replacements[urlMentionUrl] = JSON.stringify(urlObject.href)
        }
      }
      if (Object.keys(replacements).length) {
        const { content, sourcemap } = await replaceUrls(replacements)
        urlInfo.content = content
        if (sourcemap) {
          urlInfo.sourcemap = composeTwoSourcemaps(urlInfo.sourcemap, sourcemap)
        }
      }
    }
  }, Promise.resolve())

  const graphStats = createProjectGraphStats(projectGraph)
  const msEllapsed = Date.now() - startMs
  spinner.stop(
    `${UNICODE.OK} project graph loaded in ${msAsDuration(msEllapsed)}`,
  )
  logger.info(`--- graph summary ---  
${createRepartitionMessage(graphStats)}
${ANSI.color(`Total:`, ANSI.GREY)} ${graphStats.total.count} (${byteAsFileSize(
    graphStats.total.size,
  )})
---------------------`)
  return projectGraph
}

// TODO: exlude inline files
// more groups:
// - js_classic
// - graphics: jpg, png, fonts, svgs
// - audio: mp3, ogg, midi
// - video: mp4
const createProjectGraphStats = (projectGraph) => {
  const { urlInfos } = projectGraph
  const countGroups = {
    html: 0,
    css: 0,
    js_module: 0,
    other: 0,
    total: 0,
  }
  const sizeGroups = {
    html: 0,
    css: 0,
    js_module: 0,
    other: 0,
    total: 0,
  }
  Object.keys(urlInfos).forEach((url) => {
    const urlInfo = urlInfos[url]
    const urlContentSize = Buffer.byteLength(urlInfo.content)
    countGroups.total++
    sizeGroups.total += urlContentSize

    const category = determineCategory(urlInfo)

    if (category === "html") {
      countGroups.html++
      sizeGroups.html += urlContentSize
      return
    }
    if (category === "css") {
      countGroups.css++
      sizeGroups.css += urlContentSize
      return
    }
    if (category === "js_module") {
      countGroups.js_module++
      sizeGroups.js_module += urlContentSize
      return
    }
    countGroups.other++
    sizeGroups.other += urlContentSize
    return
  })
  return {
    html: { count: countGroups.html, size: sizeGroups.html },
    css: { count: countGroups.css, size: sizeGroups.css },
    js_module: { count: countGroups.js_module, size: sizeGroups.js_module },
    other: { count: countGroups.other, size: sizeGroups.other },
    total: { count: countGroups.total, size: sizeGroups.total },
  }
}

const determineCategory = (urlInfo) => {
  if (urlInfo.type === "html") {
    return "html"
  }
  if (urlInfo.type === "css") {
    return "css"
  }
  if (urlInfo.type === "js_module") {
    const urlObject = new URL(urlInfo.url)
    if (urlObject.searchParams.has("json_module")) {
      return "json"
    }
    if (urlObject.searchParams.has("css_module")) {
      return "css"
    }
    if (urlObject.searchParams.has("text_module")) {
      return "text"
    }
    return "js_module"
  }
  return urlInfo.type
}

const createRepartitionMessage = ({ html, css, js_module, other }) => {
  const parts = []
  if (html.count) {
    parts.push(
      `${ANSI.color(`html:`, ANSI.GREY)} ${html.count} (${byteAsFileSize(
        html.size,
      )})`,
    )
  }
  if (css.count) {
    parts.push(
      `${ANSI.color(`css:`, ANSI.GREY)} ${css.count} (${byteAsFileSize(
        css.size,
      )})`,
    )
  }
  if (js_module.count) {
    parts.push(
      `${ANSI.color(`js module:`, ANSI.GREY)} ${
        js_module.count
      } (${byteAsFileSize(js_module.size)})`,
    )
  }
  if (other.count) {
    parts.push(
      `${ANSI.color(`other:`, ANSI.GREY)} ${other.count} (${byteAsFileSize(
        other.size,
      )})`,
    )
  }
  return `- ${parts.join(`
- `)}`
}
