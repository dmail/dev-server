/*
 * startBuildServer is mean to interact with the build files;
 * files that will be deployed to production server(s).
 * We want to be as close as possible from the production in order to:
 * - run lighthouse
 * - run an automated test tool such as cypress, playwright
 * - see exactly how build file behaves (debug, measure perf, etc)
 * For these reasons "startBuildServer" must be as close as possible from a static file server.
 * It is not meant to provide a nice developper experience: this is the role "startDevServer".
 *
 * Conclusion:
 * "startBuildServer" must be as close as possible from a static file server because
 * we want to be in the user shoes and we should not alter build files.
 */

import { existsSync } from "node:fs"
import { parentPort } from "node:worker_threads"
import {
  jsenvAccessControlAllowedHeaders,
  startServer,
  fetchFileSystem,
  jsenvServiceCORS,
  jsenvServiceErrorHandler,
} from "@jsenv/server"
import {
  validateDirectoryUrl,
  registerDirectoryLifecycle,
} from "@jsenv/filesystem"
import { Abort, raceProcessTeardownEvents } from "@jsenv/abort"
import { createLogger, createTaskLog } from "@jsenv/log"
import { getCallerPosition } from "@jsenv/urls"

import { createReloadableWorker } from "@jsenv/core/src/helpers/worker_reload.js"

/**
 * Start a server for build files.
 * @param {Object} buildServerParameters
 * @param {string|url} buildServerParameters.buildDirectoryUrl Directory where build files are written
 * @param {string|url} buildServerParameters.sourceDirectoryUrl Directory containing source files
 * @return {Object} A build server object
 */
export const startBuildServer = async ({
  signal = new AbortController().signal,
  handleSIGINT = true,
  logLevel,
  serverLogLevel = "warn",
  https,
  http2,
  acceptAnyIp,
  hostname,
  port = 9779,
  services = [],
  keepProcessAlive = true,

  buildDirectoryUrl,
  buildMainFilePath = "index.html",

  sourceDirectoryUrl,
  buildServerFiles = {
    "./package.json": true,
    "./jsenv.config.mjs": true,
  },
  buildServerAutoreload = false,
  buildServerMainFile = getCallerPosition().url,
  cooldownBetweenFileEvents,
  ...rest
}) => {
  // params validation
  {
    const unexpectedParamNames = Object.keys(rest)
    if (unexpectedParamNames.length > 0) {
      throw new TypeError(
        `${unexpectedParamNames.join(",")}: there is no such param`,
      )
    }
    if (sourceDirectoryUrl) {
      const sourceDirectoryUrlValidation =
        validateDirectoryUrl(sourceDirectoryUrl)
      if (!sourceDirectoryUrlValidation.valid) {
        throw new TypeError(
          `rootDirectoryUrl ${sourceDirectoryUrlValidation.message}, got ${sourceDirectoryUrl}`,
        )
      }
      sourceDirectoryUrl = sourceDirectoryUrlValidation.value
    }
    const buildDirectoryUrlValidation = validateDirectoryUrl(buildDirectoryUrl)
    if (!buildDirectoryUrlValidation.valid) {
      throw new TypeError(
        `buildDirectoryUrl ${buildDirectoryUrlValidation.message}, got ${buildDirectoryUrlValidation}`,
      )
    }
    buildDirectoryUrl = buildDirectoryUrlValidation.value

    if (buildMainFilePath) {
      if (typeof buildMainFilePath !== "string") {
        throw new TypeError(
          `buildMainFilePath must be a string, got ${buildMainFilePath}`,
        )
      }
      if (buildMainFilePath[0] === "/") {
        buildMainFilePath = buildMainFilePath.slice(1)
      } else {
        const buildMainFileUrl = new URL(buildMainFilePath, buildDirectoryUrl)
          .href
        if (!buildMainFileUrl.startsWith(buildDirectoryUrl)) {
          throw new Error(
            `buildMainFilePath must be relative, got ${buildMainFilePath}`,
          )
        }
        buildMainFilePath = buildMainFileUrl.slice(buildDirectoryUrl.length)
      }
      if (!existsSync(new URL(buildMainFilePath, buildDirectoryUrl))) {
        buildMainFilePath = null
      }
    }
  }

  const logger = createLogger({ logLevel })
  const operation = Abort.startOperation()
  operation.addAbortSignal(signal)
  if (handleSIGINT) {
    operation.addAbortSource((abort) => {
      return raceProcessTeardownEvents(
        {
          SIGINT: true,
        },
        abort,
      )
    })
  }

  let reloadableWorker
  if (buildServerAutoreload) {
    reloadableWorker = createReloadableWorker(buildServerMainFile)
    if (reloadableWorker.isPrimary) {
      const buildServerFileChangeCallback = ({ relativeUrl, event }) => {
        const url = new URL(relativeUrl, sourceDirectoryUrl).href
        logger.info(`file ${event} ${url} -> restarting server...`)
        reloadableWorker.reload()
      }
      const stopWatchingBuildServerFiles = registerDirectoryLifecycle(
        sourceDirectoryUrl,
        {
          watchPatterns: {
            ...buildServerFiles,
            [buildServerMainFile]: true,
          },
          cooldownBetweenFileEvents,
          keepProcessAlive: false,
          recursive: true,
          added: ({ relativeUrl }) => {
            buildServerFileChangeCallback({ relativeUrl, event: "added" })
          },
          updated: ({ relativeUrl }) => {
            buildServerFileChangeCallback({ relativeUrl, event: "modified" })
          },
          removed: ({ relativeUrl }) => {
            buildServerFileChangeCallback({ relativeUrl, event: "removed" })
          },
        },
      )
      operation.addAbortCallback(() => {
        stopWatchingBuildServerFiles()
        reloadableWorker.terminate()
      })
      const worker = await reloadableWorker.load()
      const messagePromise = new Promise((resolve) => {
        worker.once("message", resolve)
      })
      const origin = await messagePromise
      // if (!keepProcessAlive) {
      //   worker.unref()
      // }
      return {
        origin,
        stop: () => {
          stopWatchingBuildServerFiles()
          reloadableWorker.terminate()
        },
      }
    }
  }

  const startBuildServerTask = createTaskLog("start build server", {
    disabled: !logger.levels.info,
  })
  const server = await startServer({
    signal,
    stopOnExit: false,
    stopOnSIGINT: false,
    stopOnInternalError: false,
    // the worker should be kept alive by the parent otherwise
    keepProcessAlive,
    logLevel: serverLogLevel,
    startLog: false,

    https,
    http2,
    acceptAnyIp,
    hostname,
    port,
    serverTiming: true,
    requestWaitingMs: 60_000,
    services: [
      jsenvServiceCORS({
        accessControlAllowRequestOrigin: true,
        accessControlAllowRequestMethod: true,
        accessControlAllowRequestHeaders: true,
        accessControlAllowedRequestHeaders: jsenvAccessControlAllowedHeaders,
        accessControlAllowCredentials: true,
        timingAllowOrigin: true,
      }),
      ...services,
      {
        name: "jsenv:build_files_service",
        handleRequest: createBuildFilesService({
          buildDirectoryUrl,
          buildMainFilePath,
        }),
      },
      jsenvServiceErrorHandler({
        sendErrorDetails: true,
      }),
    ],
  })
  startBuildServerTask.done()
  if (hostname) {
    delete server.origins.localip
    delete server.origins.externalip
  }
  logger.info(``)
  Object.keys(server.origins).forEach((key) => {
    logger.info(`- ${server.origins[key]}`)
  })
  logger.info(``)
  if (reloadableWorker && reloadableWorker.isWorker) {
    parentPort.postMessage(server.origin)
  }
  return {
    origin: server.origin,
    stop: () => {
      server.stop()
    },
  }
}

const createBuildFilesService = ({ buildDirectoryUrl, buildMainFilePath }) => {
  return (request) => {
    const urlIsVersioned = new URL(request.url).searchParams.has("v")
    if (buildMainFilePath && request.resource === "/") {
      request = {
        ...request,
        resource: `/${buildMainFilePath}`,
      }
    }
    return fetchFileSystem(
      new URL(request.resource.slice(1), buildDirectoryUrl),
      {
        headers: request.headers,
        cacheControl: urlIsVersioned
          ? `private,max-age=${SECONDS_IN_30_DAYS},immutable`
          : "private,max-age=0,must-revalidate",
        etagEnabled: true,
        compressionEnabled: !request.pathname.endsWith(".mp4"),
        rootDirectoryUrl: buildDirectoryUrl,
        canReadDirectory: true,
      },
    )
  }
}

const SECONDS_IN_30_DAYS = 60 * 60 * 24 * 30
