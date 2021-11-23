import {
  normalizeStructuredMetaMap,
  collectFiles,
  urlToRelativeUrl,
} from "@jsenv/filesystem"
import { setupRoutes } from "@jsenv/server"

import { jsenvCoreDirectoryUrl } from "./internal/jsenvCoreDirectoryUrl.js"
import {
  assertProjectDirectoryUrl,
  assertProjectDirectoryExists,
} from "./internal/argUtils.js"
import {
  startCompileServer,
  computeOutDirectoryRelativeUrl,
} from "./internal/compiling/startCompileServer.js"
import { jsenvExplorableConfig } from "./jsenvExplorableConfig.js"
import {
  redirectorHtmlFileInfo,
  redirectorJsFileInfo,
} from "./internal/dev_server/redirector/redirector_file_info.js"
import {
  exploringIndexHtmlFileInfo,
  exploringIndexJsFileInfo,
} from "@jsenv/core/src/internal/dev_server/exploring/exploring_file_info.js"
import {
  sourcemapMainFileInfo,
  sourcemapMappingFileInfo,
  jsenvToolbarJsFileInfo,
} from "./internal/jsenvInternalFiles.js"
import { jsenvRuntimeSupportDuringDev } from "./jsenvRuntimeSupportDuringDev.js"
import { eventSourceClientFileInfo } from "./internal/dev_server/event_source_client/event_source_client_file_info.js"

export const startDevServer = async ({
  signal = new AbortController().signal,
  handleSIGINT = true,
  port,
  ip,
  protocol,
  http2,
  certificate,
  privateKey,
  plugins,
  customServices,

  projectDirectoryUrl,
  explorableConfig = jsenvExplorableConfig,
  mainFileRelativeUrl = urlToRelativeUrl(
    exploringIndexHtmlFileInfo.sourceUrl,
    projectDirectoryUrl,
  ),
  jsenvDirectoryRelativeUrl,
  outDirectoryName = "dev",
  jsenvToolbar = true,
  livereloading = true,
  inlineImportMapIntoHTML = true,
  keepProcessAlive = true,

  babelPluginMap,
  runtimeSupportDuringDev = jsenvRuntimeSupportDuringDev,
  logLevel,
  compileServerCanReadFromFilesystem,
  compileServerCanWriteOnFilesystem,
  sourcemapMethod,
  customCompilers,
  livereloadWatchConfig,
  livereloadLogLevel,
  jsenvDirectoryClean,
}) => {
  projectDirectoryUrl = assertProjectDirectoryUrl({ projectDirectoryUrl })
  await assertProjectDirectoryExists({ projectDirectoryUrl })

  const outDirectoryRelativeUrl = computeOutDirectoryRelativeUrl({
    projectDirectoryUrl,
    jsenvDirectoryRelativeUrl,
    outDirectoryName,
  })

  const compileServer = await startCompileServer({
    signal,
    handleSIGINT,
    keepProcessAlive,
    logLevel,
    port,
    ip,
    protocol,
    http2,
    certificate,
    privateKey,
    plugins,
    customServices: {
      ...customServices,
      "jsenv:redirector": createRedirectorService({
        projectDirectoryUrl,
        mainFileRelativeUrl,
      }),
      "jsenv:event_source_client": createEventSourceClientService({
        projectDirectoryUrl,
      }),
      "jsenv:exploring_index": createExploringIndexService({
        projectDirectoryUrl,
      }),
      "jsenv:exploring_json": createExploringJsonService({
        projectDirectoryUrl,
        outDirectoryRelativeUrl,
        explorableConfig,
        livereloading,
      }),
      "jsenv:explorables_json": createExplorableJsonService({
        projectDirectoryUrl,
        outDirectoryRelativeUrl,
        explorableConfig,
      }),
      "jsenv:toolbar": createToolbarService({
        projectDirectoryUrl,
      }),
    },

    projectDirectoryUrl,
    livereloadSSE: livereloading,
    jsenvEventSourceClientInjection: true,
    jsenvToolbarInjection: jsenvToolbar,
    jsenvDirectoryRelativeUrl,
    outDirectoryName,
    inlineImportMapIntoHTML,

    compileServerCanReadFromFilesystem,
    compileServerCanWriteOnFilesystem,
    customCompilers,
    sourcemapMethod,
    babelPluginMap,
    runtimeSupport: runtimeSupportDuringDev,
    livereloadWatchConfig,
    livereloadLogLevel,
    jsenvDirectoryClean,
  })

  return compileServer
}

const createRedirectorService = ({
  projectDirectoryUrl,
  mainFileRelativeUrl,
}) => {
  const jsenvRedirectorHtmlRelativeUrlForProject = urlToRelativeUrl(
    redirectorHtmlFileInfo.sourceUrl,
    projectDirectoryUrl,
  )
  const jsenvRedirectorJsBuildRelativeUrlForProject = urlToRelativeUrl(
    redirectorJsFileInfo.buildUrl,
    projectDirectoryUrl,
  )
  return setupRoutes({
    "/": (request) => {
      const redirectTarget = mainFileRelativeUrl
      return {
        status: 307,
        headers: {
          location: `${request.origin}/${jsenvRedirectorHtmlRelativeUrlForProject}?redirect=${redirectTarget}`,
        },
      }
    },
    "/.jsenv/redirect/:rest*": (request) => {
      const redirectTarget = request.ressource.slice("/.jsenv/redirect/".length)
      return {
        status: 307,
        headers: {
          location: `${request.origin}/${jsenvRedirectorHtmlRelativeUrlForProject}?redirect=${redirectTarget}`,
        },
      }
    },
    "/.jsenv/redirector.js": (request) => {
      return {
        status: 307,
        headers: {
          location: `${request.origin}/${jsenvRedirectorJsBuildRelativeUrlForProject}`,
        },
      }
    },
  })
}

const createEventSourceClientService = ({ projectDirectoryUrl }) => {
  const eventSourceClientBuildRelativeUrlForProject = urlToRelativeUrl(
    eventSourceClientFileInfo.buildUrl,
    projectDirectoryUrl,
  )
  return setupRoutes({
    "/.jsenv/event_source_client.js": (request) => {
      return {
        status: 307,
        headers: {
          location: `${request.origin}/${eventSourceClientBuildRelativeUrlForProject}`,
        },
      }
    },
    // unfortunately browser resolves sourcemap to url before redirection (not after).
    // It means browser tries to load source map from "/.jsenv/jsenv-toolbar.js.map"
    // we could also inline sourcemap but it's not yet possible
    // inside buildProject
    "/.jsenv/event_source_client.js.map": (request) => {
      return {
        status: 307,
        headers: {
          location: `${request.origin}/${eventSourceClientBuildRelativeUrlForProject}.map`,
        },
      }
    },
  })
}

const createExploringIndexService = ({ projectDirectoryUrl }) => {
  const jsenvExploringJsBuildRelativeUrlForProject = urlToRelativeUrl(
    exploringIndexJsFileInfo.buildUrl,
    projectDirectoryUrl,
  )
  return setupRoutes({
    "/.jsenv/exploring.index.js": (request) => {
      return {
        status: 307,
        headers: {
          location: `${request.origin}/${jsenvExploringJsBuildRelativeUrlForProject}`,
        },
      }
    },
    // unfortunately browser resolves sourcemap to url before redirection (not after).
    // It means browser tries to load source map from "/.jsenv/jsenv-toolbar.js.map"
    // we could also inline sourcemap but it's not yet possible
    // inside buildProject
    "/.jsenv/jsenv_exploring_index.js.map": (request) => {
      return {
        status: 307,
        headers: {
          location: `${request.origin}/${jsenvExploringJsBuildRelativeUrlForProject}.map`,
        },
      }
    },
  })
}

const createToolbarService = ({ projectDirectoryUrl }) => {
  const jsenvToolbarJsBuildRelativeUrlForProject = urlToRelativeUrl(
    jsenvToolbarJsFileInfo.jsenvBuildUrl,
    projectDirectoryUrl,
  )

  return setupRoutes({
    "/.jsenv/toolbar.main.js": (request) => {
      const jsenvToolbarJsBuildServerUrl = `${request.origin}/${jsenvToolbarJsBuildRelativeUrlForProject}`
      return {
        status: 307,
        headers: {
          location: jsenvToolbarJsBuildServerUrl,
        },
      }
    },
    "/.jsenv/jsenv_toolbar.js.map": (request) => {
      return {
        status: 307,
        headers: {
          location: `${request.origin}/${jsenvToolbarJsBuildRelativeUrlForProject}.map`,
        },
      }
    },
  })
}

const createExploringJsonService = ({
  projectDirectoryUrl,
  outDirectoryRelativeUrl,
  explorableConfig,
  livereloading,
}) => {
  return (request) => {
    if (
      request.ressource === "/.jsenv/exploring.json" &&
      request.method === "GET"
    ) {
      const data = {
        projectDirectoryUrl,
        outDirectoryRelativeUrl,
        jsenvDirectoryRelativeUrl: urlToRelativeUrl(
          jsenvCoreDirectoryUrl,
          projectDirectoryUrl,
        ),
        exploringHtmlFileRelativeUrl: urlToRelativeUrl(
          exploringIndexHtmlFileInfo.sourceUrl,
          projectDirectoryUrl,
        ),
        sourcemapMainFileRelativeUrl: urlToRelativeUrl(
          sourcemapMainFileInfo.url,
          jsenvCoreDirectoryUrl,
        ),
        sourcemapMappingFileRelativeUrl: urlToRelativeUrl(
          sourcemapMappingFileInfo.url,
          jsenvCoreDirectoryUrl,
        ),
        explorableConfig,
        livereloading,
      }
      const json = JSON.stringify(data)
      return {
        status: 200,
        headers: {
          "cache-control": "no-store",
          "content-type": "application/json",
          "content-length": Buffer.byteLength(json),
        },
        body: json,
      }
    }
    return null
  }
}

const createExplorableJsonService = ({
  projectDirectoryUrl,
  outDirectoryRelativeUrl,
  explorableConfig,
}) => {
  return async (request) => {
    if (
      request.ressource === "/.jsenv/explorables.json" &&
      request.method === "GET"
    ) {
      const structuredMetaMapRelativeForExplorable = {}
      Object.keys(explorableConfig).forEach((explorableGroup) => {
        const explorableGroupConfig = explorableConfig[explorableGroup]
        structuredMetaMapRelativeForExplorable[explorableGroup] = {
          "**/.jsenv/": false, // temporary (in theory) to avoid visting .jsenv directory in jsenv itself
          ...explorableGroupConfig,
          [outDirectoryRelativeUrl]: false,
        }
      })
      const structuredMetaMapForExplorable = normalizeStructuredMetaMap(
        structuredMetaMapRelativeForExplorable,
        projectDirectoryUrl,
      )
      const matchingFileResultArray = await collectFiles({
        directoryUrl: projectDirectoryUrl,
        structuredMetaMap: structuredMetaMapForExplorable,
        predicate: (meta) =>
          Object.keys(meta).some((explorableGroup) =>
            Boolean(meta[explorableGroup]),
          ),
      })
      const explorableFiles = matchingFileResultArray.map(
        ({ relativeUrl, meta }) => ({
          relativeUrl,
          meta,
        }),
      )
      const json = JSON.stringify(explorableFiles)
      return {
        status: 200,
        headers: {
          "cache-control": "no-store",
          "content-type": "application/json",
          "content-length": Buffer.byteLength(json),
        },
        body: json,
      }
    }
    return null
  }
}
