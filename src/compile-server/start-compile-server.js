/* eslint-disable import/max-dependencies */
import { createCancellationToken } from "@dmail/cancellation"
import { serveFile } from "../file-service/index.js"
import {
  acceptContentType,
  createSSERoom,
  startServer,
  serviceCompose,
  firstService,
} from "../server/index.js"
import { watchFile } from "../watchFile.js"
import { generateGroupMap } from "../group-map/index.js"
import {
  DEFAULT_COMPILE_INTO_RELATIVE_PATH,
  DEFAULT_IMPORT_MAP_RELATIVE_PATH,
  DEFAULT_BROWSER_GROUP_RESOLVER_RELATIVE_PATH,
  DEFAULT_NODE_GROUP_RESOLVER_RELATIVE_PATH,
  DEFAULT_BABEL_CONFIG_MAP,
  DEFAULT_BABEL_COMPAT_MAP,
  DEFAULT_BROWSER_SCORE_MAP,
  DEFAULT_NODE_VERSION_SCORE_MAP,
} from "./compile-server-constant.js"
import { serveBrowserPlatform } from "../browser-platform-service/index.js"
import { serveNodePlatform } from "../node-platform-service/index.js"
import { serveCompiledJs, relativePathIsAsset } from "../compiled-js-service/index.js"
import { operatingSystemFilenameToPathname } from "../operating-system-filename.js"

export const startCompileServer = async ({
  cancellationToken = createCancellationToken(),
  projectFolder,
  compileIntoRelativePath = DEFAULT_COMPILE_INTO_RELATIVE_PATH,
  importMapRelativePath = DEFAULT_IMPORT_MAP_RELATIVE_PATH,
  browserGroupResolverRelativePath = DEFAULT_BROWSER_GROUP_RESOLVER_RELATIVE_PATH,
  nodeGroupResolverRelativePath = DEFAULT_NODE_GROUP_RESOLVER_RELATIVE_PATH,
  compileGroupCount = 1,
  babelConfigMap = DEFAULT_BABEL_CONFIG_MAP,
  babelCompatMap = DEFAULT_BABEL_COMPAT_MAP,
  browserScoreMap = DEFAULT_BROWSER_SCORE_MAP,
  nodeVersionScoreMap = DEFAULT_NODE_VERSION_SCORE_MAP,
  // options related to how cache/hotreloading
  watchSource = false,
  watchSourcePredicate = () => true, // aybe we should exclude node_modules by default
  // js compile options
  transformTopLevelAwait = true,
  // options related to the server itself
  cors = true,
  protocol = "http",
  ip = "127.0.0.1",
  port = 0,
  signature,
  logLevel = "log",
}) => {
  if (typeof projectFolder !== "string")
    throw new TypeError(`projectFolder must be a string. got ${projectFolder}`)

  const projectPathname = operatingSystemFilenameToPathname(projectFolder)

  const groupMap = generateGroupMap({
    babelConfigMap,
    babelCompatMap,
    platformScoreMap: { ...browserScoreMap, node: nodeVersionScoreMap },
    groupCount: compileGroupCount,
  })

  // this callback will be called each time a projectFile was
  // used to respond to a request
  // it is not used yet but is meant to implement hotreloading
  // each time a client will need a project file we will watch that file
  // and a client can register to these events to reload the page
  // when a project file changed
  let projectFileRequestedCallback = () => {}

  const services = []

  if (watchSource) {
    const originalWatchSourcePredicate = watchSourcePredicate
    watchSourcePredicate = (relativePath) => {
      // I doubt an asset like .js.map will change
      // in theory a compilation asset should not change
      // if the source file did not change
      // so we can avoid watching compilation asset
      if (relativePathIsAsset(relativePath)) return false
      return originalWatchSourcePredicate(relativePath)
    }

    const { registerFileChangedCallback, triggerFileChanged } = createFileChangedSignal()

    const watchedFiles = new Map()
    cancellationToken.register(() => {
      watchedFiles.forEach((closeWatcher) => closeWatcher())
      watchedFiles.clear()
    })
    projectFileRequestedCallback = ({ fileRelativePath }) => {
      const filePath = `${projectFolder}/${fileRelativePath}`
      // when I ask for a compiled file, watch the corresponding file on filesystem
      // here we should use the registerFileLifecyle stuff made in
      // jsenv-eslint-import-resolver so support if file gets created/deleted
      // by the way this is not truly working if compile creates a bundle
      // in that case we should watch for the whole bundle
      // sources, for now let's ignore
      if (watchedFiles.has(filePath) === false && watchSourcePredicate(fileRelativePath)) {
        const fileWatcher = watchFile(filePath, () => {
          triggerFileChanged({ fileRelativePath })
        })
        watchedFiles.set(filePath, fileWatcher)
      }
    }

    const fileChangedSSE = createSSERoom()

    fileChangedSSE.open()
    cancellationToken.register(fileChangedSSE.close)

    registerFileChangedCallback(({ fileRelativePath }) => {
      fileChangedSSE.sendEvent({
        type: "file-changed",
        data: fileRelativePath,
      })
    })

    const watchSSEService = ({ headers }) => {
      if (acceptContentType(headers.accept, "text/event-stream")) {
        return fileChangedSSE.connect(headers["last-event-id"])
      }
      return null
    }

    services.push(watchSSEService)
  }

  services.push((request) =>
    firstService(
      () =>
        serveImportMap({
          importMapRelativePath,
          request,
        }),
      () =>
        serveBrowserPlatform({
          projectPathname,
          compileIntoRelativePath,
          importMapRelativePath,
          browserGroupResolverRelativePath,
          babelConfigMap,
          groupMap,
          projectFileRequestedCallback,
          request,
        }),
      () =>
        serveNodePlatform({
          projectPathname,
          compileIntoRelativePath,
          importMapRelativePath,
          nodeGroupResolverRelativePath,
          babelConfigMap,
          groupMap,
          projectFileRequestedCallback,
          request,
        }),
      () =>
        serveCompiledJs({
          projectPathname,
          compileIntoRelativePath,
          groupMap,
          babelConfigMap,
          transformTopLevelAwait,
          projectFileRequestedCallback,
          request,
        }),
      () =>
        serveCompiledAsset({
          projectPathname,
          request,
        }),
      () =>
        serveProjectFiles({
          projectPathname,
          projectFileRequestedCallback,
          request,
        }),
    ),
  )

  const compileServer = await startServer({
    cancellationToken,
    protocol,
    ip,
    port,
    signature,
    requestToResponse: serviceCompose(...services),
    logLevel,
    cors,
  })
  // https://nodejs.org/api/net.html#net_server_unref
  // but while debugging it may close the server too soon, to be tested
  compileServer.nodeServer.unref()

  return compileServer
}

const serveImportMap = ({ importMapRelativePath, request: { origin, ressource } }) => {
  if (ressource !== "/.jsenv/importMap.json") return null

  return {
    status: 307,
    headers: {
      location: `${origin}/${importMapRelativePath}`,
    },
  }
}

const serveCompiledAsset = ({ projectFolder, request: { ressource, method, headers } }) => {
  if (!relativePathIsAsset(ressource)) return null

  return serveFile(`${projectFolder}${ressource}`, {
    method,
    headers,
    // because chrome seems to cache map files
    // meaning reloaidng the page will not update sourcemapped code
    // apparently not required anymore ?
    // cacheStrategy: "none",
  })
}

const serveProjectFiles = ({
  projectPathname,
  projectFileRequestedCallback,
  request: { ressource, method, headers },
}) => {
  projectFileRequestedCallback({
    fileRelativePath: ressource,
  })

  return serveFile(`${projectPathname}/${ressource}`, { method, headers })
}

const createFileChangedSignal = () => {
  const fileChangedCallbackArray = []

  const registerFileChangedCallback = (callback) => {
    fileChangedCallbackArray.push(callback)
  }

  const changed = (data) => {
    const callbackArray = fileChangedCallbackArray.slice()
    callbackArray.forEach((callback) => {
      callback(data)
    })
  }

  return { registerFileChangedCallback, changed }
}
