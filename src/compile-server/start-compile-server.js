/* eslint-disable import/max-dependencies */
import { createCancellationToken } from "@dmail/cancellation"
import {
  defaultAccessControlAllowedHeaders,
  startServer,
  firstService,
  serveFile,
} from "@dmail/server"
import {
  operatingSystemPathToPathname,
  pathnameToOperatingSystemPath,
} from "@jsenv/operating-system-path"
import { generateGroupMap } from "@jsenv/grouping"
import { watchFile } from "../watchFile.js"
import { serveBrowserPlatform } from "../browser-platform-service/index.js"
import { serveNodePlatform } from "../node-platform-service/index.js"
import { serveCompiledJs, relativePathIsAsset } from "../compiled-js-service/index.js"
import { LOG_LEVEL_ERRORS_WARNINGS_AND_LOGS } from "../logger.js"
import { removeFolder } from "../removeFolder.js"
import { jsenvRelativePathInception } from "../JSENV_PATH.js"
import { assertFile } from "../filesystem-assertions.js"
import { readCompileIntoMeta } from "./read-compile-into-meta.js"
import { writeCompileIntoMeta } from "./write-compile-into-meta.js"
import {
  DEFAULT_COMPILE_INTO_RELATIVE_PATH,
  DEFAULT_IMPORT_MAP_RELATIVE_PATH,
  DEFAULT_BABEL_PLUGIN_MAP,
  DEFAULT_BABEL_COMPAT_MAP,
  DEFAULT_BROWSER_SCORE_MAP,
  DEFAULT_NODE_VERSION_SCORE_MAP,
} from "./compile-server-constant.js"

export const startCompileServer = async ({
  cancellationToken = createCancellationToken(),
  projectPath,
  compileIntoRelativePath = DEFAULT_COMPILE_INTO_RELATIVE_PATH,
  importMapRelativePath = DEFAULT_IMPORT_MAP_RELATIVE_PATH,
  importDefaultExtension,
  browserPlatformRelativePath,
  nodePlatformRelativePath,
  compileGroupCount = 1,
  platformAlwaysInsidePlatformScoreMap = false,
  babelPluginMap = DEFAULT_BABEL_PLUGIN_MAP,
  babelCompatMap = DEFAULT_BABEL_COMPAT_MAP,
  browserScoreMap = DEFAULT_BROWSER_SCORE_MAP,
  nodeVersionScoreMap = DEFAULT_NODE_VERSION_SCORE_MAP,
  // this callback will be called each time a projectFile was
  // used to respond to a request
  // each time an execution needs a project file this callback
  // will be called.
  projectFileRequestedCallback = () => {},
  // this optionnal function will be called every time a project file changes
  // code using compileServer can use it to do something when
  // a project file is modified
  projectFileChangedCallback = null,
  // should we exclude node_modules by default ?
  projectFileWatchPredicate = () => true,
  // js compile options
  transformTopLevelAwait = true,
  // options related to the server itself
  cors = true,
  protocol = "http",
  ip = "127.0.0.1",
  port = 0,
  signature,
  logLevel = LOG_LEVEL_ERRORS_WARNINGS_AND_LOGS,
  cleanCompileInto = false,
  keepProcessAlive = false,
}) => {
  if (typeof projectPath !== "string")
    throw new TypeError(`projectPath must be a string. got ${projectPath}`)

  const projectPathname = operatingSystemPathToPathname(projectPath)

  const groupMap = generateGroupMap({
    babelPluginMap,
    babelCompatMap,
    platformScoreMap: { ...browserScoreMap, node: nodeVersionScoreMap },
    groupCount: compileGroupCount,
    platformAlwaysInsidePlatformScoreMap,
  })

  const previousCompileIntoMeta = await readCompileIntoMeta({
    projectPathname,
    compileIntoRelativePath,
  })
  const compileIntoMeta = computeCompileIntoMeta({ babelPluginMap, groupMap })
  if (cleanCompileInto || shouldInvalidateCache({ previousCompileIntoMeta, compileIntoMeta })) {
    await removeFolder(
      pathnameToOperatingSystemPath(`${projectPathname}${compileIntoRelativePath}`),
    )
  }
  await writeCompileIntoMeta({ projectPathname, compileIntoRelativePath, compileIntoMeta })

  if (typeof browserPlatformRelativePath === "undefined") {
    browserPlatformRelativePath = jsenvRelativePathInception({
      jsenvRelativePath: "/src/browser-platform-service/browser-platform/index.js",
      projectPathname,
    })
  }
  await assertFile(
    pathnameToOperatingSystemPath(`${projectPathname}${browserPlatformRelativePath}`),
  )

  if (typeof nodePlatformRelativePath === "undefined") {
    nodePlatformRelativePath = jsenvRelativePathInception({
      jsenvRelativePath: "/src/node-platform-service/node-platform/index.js",
      projectPathname,
    })
  }
  await assertFile(pathnameToOperatingSystemPath(`${projectPathname}${nodePlatformRelativePath}`))

  if (projectFileChangedCallback) {
    const originalProjectFileWatchPredicate = projectFileWatchPredicate
    projectFileWatchPredicate = (relativePath) => {
      // I doubt an asset like .js.map will change
      // in theory a compilation asset should not change
      // if the source file did not change
      // so we can avoid watching compilation asset
      if (relativePathIsAsset(relativePath)) return false
      return originalProjectFileWatchPredicate(relativePath)
    }

    const { registerFileChangedCallback, triggerFileChanged } = createFileChangedSignal()

    const watchedFiles = new Map()
    cancellationToken.register(() => {
      watchedFiles.forEach((closeWatcher) => closeWatcher())
      watchedFiles.clear()
    })
    const originalProjectFileRequestedCallback = projectFileRequestedCallback
    projectFileRequestedCallback = ({ relativePath, executionId }) => {
      const filePath = `${projectPath}${relativePath}`
      // when I ask for a compiled file, watch the corresponding file on filesystem
      // here we should use the registerFileLifecyle stuff made in
      // jsenv-eslint-import-resolver so support if file gets created/deleted
      // by the way this is not truly working if compile creates a bundle
      // in that case we should watch for the whole bundle
      // sources, for now let's ignore
      if (watchedFiles.has(filePath) === false && projectFileWatchPredicate(relativePath)) {
        const fileWatcher = watchFile(filePath, () => {
          triggerFileChanged({ relativePath })
        })
        watchedFiles.set(filePath, fileWatcher)
      }
      originalProjectFileRequestedCallback({ relativePath, executionId })
    }

    registerFileChangedCallback(({ relativePath }) => {
      projectFileChangedCallback({ relativePath })
    })
  }

  const compileServer = await startServer({
    cancellationToken,
    protocol,
    ip,
    port,
    signature,
    requestToResponse: (request) =>
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
            importDefaultExtension,
            browserPlatformRelativePath,
            babelPluginMap,
            groupMap,
            projectFileRequestedCallback,
            request,
          }),
        () =>
          serveNodePlatform({
            projectPathname,
            compileIntoRelativePath,
            importMapRelativePath,
            importDefaultExtension,
            nodePlatformRelativePath,
            babelPluginMap,
            groupMap,
            projectFileRequestedCallback,
            request,
          }),
        () =>
          serveCompiledJs({
            projectPathname,
            compileIntoRelativePath,
            groupMap,
            babelPluginMap,
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
    logLevel,
    cors,
    accessControlAllowRequestOrigin: true,
    accessControlAllowRequestMethod: true,
    accessControlAllowRequestHeaders: true,
    accessControlAllowedRequestHeaders: [
      ...defaultAccessControlAllowedHeaders,
      "x-jsenv-execution-id",
    ],
    keepProcessAlive,
  })

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

const serveCompiledAsset = ({ projectPathname, request: { ressource, method, headers } }) => {
  if (!relativePathIsAsset(ressource)) return null

  return serveFile(`${projectPathname}${ressource}`, {
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
    relativePath: ressource,
    // the client (browser or node) should send
    // somehow the execution-id if we want to read it here
    // for now there is no such thing.
    // It means any project file which is not a module cannot be associated
    // to a specific execution.
    executionId: headers["x-jsenv-execution-id"],
  })

  return serveFile(`${projectPathname}${ressource}`, { method, headers })
}

const computeCompileIntoMeta = ({ babelPluginMap, groupMap }) => {
  return { babelPluginMap, groupMap }
}

const shouldInvalidateCache = ({ previousCompileIntoMeta, compileIntoMeta }) => {
  return (
    previousCompileIntoMeta &&
    JSON.stringify(previousCompileIntoMeta) !== JSON.stringify(compileIntoMeta)
  )
}

const createFileChangedSignal = () => {
  const fileChangedCallbackArray = []

  const registerFileChangedCallback = (callback) => {
    fileChangedCallbackArray.push(callback)
  }

  const triggerFileChanged = (data) => {
    const callbackArray = fileChangedCallbackArray.slice()
    callbackArray.forEach((callback) => {
      callback(data)
    })
  }

  return { registerFileChangedCallback, triggerFileChanged }
}
