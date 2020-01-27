/* eslint-disable import/max-dependencies */
import { readFileSync } from "fs"
import { createCancellationToken } from "@jsenv/cancellation"
import { composeTwoImportMaps } from "@jsenv/import-map"
import { generateImportMapForPackage } from "@jsenv/node-module-import-map"
import {
  jsenvAccessControlAllowedHeaders,
  startServer,
  firstService,
  serveFile,
} from "@jsenv/server"
import { createLogger } from "@jsenv/logger"
import {
  resolveUrl,
  urlToFileSystemPath,
  urlToRelativeUrl,
  resolveDirectoryUrl,
  readFile,
  writeFile,
  removeFileSystemNode,
  ensureEmptyDirectory,
  registerFileLifecycle,
} from "@jsenv/util"
import { jsenvCoreDirectoryUrl } from "../jsenvCoreDirectoryUrl.js"
import { assertImportMapFileRelativeUrl, assertImportMapFileInsideProject } from "../argUtils.js"
import { generateGroupMap } from "../generateGroupMap/generateGroupMap.js"
import { jsenvBabelPluginCompatMap } from "../../jsenvBabelPluginCompatMap.js"
import { jsenvBrowserScoreMap } from "../../jsenvBrowserScoreMap.js"
import { jsenvNodeVersionScoreMap } from "../../jsenvNodeVersionScoreMap.js"
import { jsenvBabelPluginMap } from "../../jsenvBabelPluginMap.js"
import { readProjectImportMap } from "./readProjectImportMap.js"
import { serveCompiledJs } from "./serveCompiledJs.js"
import { urlIsAsset } from "./urlIsAsset.js"

export const startCompileServer = async ({
  cancellationToken = createCancellationToken(),
  compileServerLogLevel,
  logStart,

  // js compile options
  transformTopLevelAwait = true,
  transformModuleIntoSystemFormat = true,

  projectDirectoryUrl,
  jsenvDirectoryRelativeUrl = ".jsenv",
  jsenvDirectoryClean = false,
  outDirectoryName = "out",

  writeOnFilesystem = true,
  useFilesystemAsCache = true,

  importMapFileRelativeUrl = "importMap.json",
  importDefaultExtension,

  env = {},

  babelPluginMap = jsenvBabelPluginMap,
  convertMap = {},

  // options related to the server itself
  protocol = "http",
  privateKey,
  certificate,
  ip = "127.0.0.1",
  port = 0,
  keepProcessAlive = false,
  stopOnPackageVersionChange = false,

  // this callback will be called each time a projectFile was
  // used to respond to a request
  // each time an execution needs a project file this callback
  // will be called.
  projectFileRequestedCallback = undefined,
  projectFilePredicate = () => true,

  // remaining options are complex or private
  compileGroupCount = 1,
  babelCompatMap = jsenvBabelPluginCompatMap,
  browserScoreMap = jsenvBrowserScoreMap,
  nodeVersionScoreMap = jsenvNodeVersionScoreMap,
  platformAlwaysInsidePlatformScoreMap = false,
}) => {
  if (typeof projectDirectoryUrl !== "string") {
    throw new TypeError(`projectDirectoryUrl must be a string. got ${projectDirectoryUrl}`)
  }

  assertImportMapFileRelativeUrl({ importMapFileRelativeUrl })
  const importMapFileUrl = resolveUrl(importMapFileRelativeUrl, projectDirectoryUrl)
  assertImportMapFileInsideProject({ importMapFileUrl, projectDirectoryUrl })
  // importMapFileRelativeUrl normalization
  importMapFileRelativeUrl = urlToRelativeUrl(importMapFileUrl, projectDirectoryUrl)

  if (typeof jsenvDirectoryRelativeUrl !== "string") {
    throw new TypeError(
      `jsenvDirectoryRelativeUrl must be a string. got ${jsenvDirectoryRelativeUrl}`,
    )
  }
  const jsenvDirectoryUrl = resolveDirectoryUrl(jsenvDirectoryRelativeUrl, projectDirectoryUrl)
  // jsenvDirectoryRelativeUrl normalization
  jsenvDirectoryRelativeUrl = urlToRelativeUrl(jsenvDirectoryUrl, projectDirectoryUrl)
  if (!jsenvDirectoryUrl.startsWith(projectDirectoryUrl)) {
    throw new TypeError(`jsenv directory must be inside project directory
--- jsenv directory url ---
${jsenvDirectoryUrl}
--- project directory url ---
${projectDirectoryUrl}`)
  }

  if (typeof outDirectoryName !== "string") {
    throw new TypeError(`outDirectoryName must be a string. got ${outDirectoryName}`)
  }
  const outDirectoryUrl = resolveDirectoryUrl(outDirectoryName, jsenvDirectoryUrl)
  const outDirectoryRelativeUrl = urlToRelativeUrl(outDirectoryUrl, projectDirectoryUrl)

  const logger = createLogger({ logLevel: compileServerLogLevel })

  const groupMap = generateGroupMap({
    babelPluginMap,
    babelCompatMap,
    platformScoreMap: { ...browserScoreMap, node: nodeVersionScoreMap },
    groupCount: compileGroupCount,
    platformAlwaysInsidePlatformScoreMap,
  })

  const outDirectoryMeta = {
    babelPluginMap,
    convertMap,
    groupMap,
  }
  if (jsenvDirectoryClean) {
    logger.info(`clean jsenv directory at ${jsenvDirectoryUrl}`)
    await ensureEmptyDirectory(jsenvDirectoryUrl)
  }
  if (useFilesystemAsCache) {
    await cleanOutDirectoryIfObsolete({
      logger,
      outDirectoryUrl,
      outDirectoryMeta,
    })
  }

  const packageFileUrl = resolveUrl("./package.json", jsenvCoreDirectoryUrl)
  const packageFilePath = urlToFileSystemPath(packageFileUrl)
  const packageVersion = readPackage(packageFilePath).version

  if (projectFileRequestedCallback) {
    if (typeof projectFileRequestedCallback !== "function") {
      throw new TypeError(
        `projectFileRequestedCallback must be a function, got ${projectFileRequestedCallback}`,
      )
    }
    const originalProjectFileRequestedCallback = projectFileRequestedCallback
    projectFileRequestedCallback = ({ relativeUrl, ...rest }) => {
      // I doubt an asset like .js.map will change
      // in theory a compilation asset should not change
      // if the source file did not change
      // so we can avoid watching compilation asset
      if (urlIsAsset(`${projectDirectoryUrl}${relativeUrl}`)) {
        return
      }

      if (projectFilePredicate(relativeUrl)) {
        originalProjectFileRequestedCallback({ relativeUrl, ...rest })
      }
    }
  } else {
    projectFileRequestedCallback = () => {}
  }

  const [compileServer, importMapForCompileServer] = await Promise.all([
    startServer({
      cancellationToken,
      logLevel: compileServerLogLevel,
      logStart,
      protocol,
      privateKey,
      certificate,
      ip,
      port,
      sendInternalErrorStack: true,
      requestToResponse: (request) => {
        return firstService(
          () => {
            const { origin, ressource, method, headers } = request
            const requestUrl = `${origin}${ressource}`
            // serve asset files directly
            if (urlIsAsset(requestUrl)) {
              const fileUrl = resolveUrl(ressource.slice(1), projectDirectoryUrl)
              return serveFile(fileUrl, {
                method,
                headers,
              })
            }
            return null
          },
          () => {
            return serveCompiledJs({
              cancellationToken,
              logger,

              projectDirectoryUrl,
              outDirectoryRelativeUrl,
              compileServerImportMap: importMapForCompileServer,
              importDefaultExtension,

              transformTopLevelAwait,
              transformModuleIntoSystemFormat,
              babelPluginMap,
              groupMap,
              convertMap,

              request,
              projectFileRequestedCallback,
              useFilesystemAsCache,
              writeOnFilesystem,
            })
          },
          () => {
            return serveProjectFiles({
              projectDirectoryUrl,
              request,
              projectFileRequestedCallback,
            })
          },
        )
      },
      accessControlAllowRequestOrigin: true,
      accessControlAllowRequestMethod: true,
      accessControlAllowRequestHeaders: true,
      accessControlAllowedRequestHeaders: [
        ...jsenvAccessControlAllowedHeaders,
        "x-jsenv-execution-id",
      ],
      accessControlAllowCredentials: true,
      keepProcessAlive,
    }),
    generateImportMapForCompileServer({
      logger,
      projectDirectoryUrl,
      outDirectoryRelativeUrl,
      importMapFileRelativeUrl,
    }),
  ])

  env = {
    ...env,
    jsenvDirectoryRelativeUrl,
    outDirectoryRelativeUrl,
    importDefaultExtension,
  }

  const importMapToString = () => JSON.stringify(importMapForCompileServer, null, "  ")
  const groupMapToString = () => JSON.stringify(groupMap, null, "  ")
  const envToString = () => JSON.stringify(env, null, "  ")

  const jsenvImportMapFileUrl = resolveUrl("./importMap.json", outDirectoryUrl)
  const jsenvGroupMapFileUrl = resolveUrl("./groupMap.json", outDirectoryUrl)
  const jsenvEnvFileUrl = resolveUrl("./env.json", outDirectoryUrl)

  await Promise.all([
    writeFile(jsenvImportMapFileUrl, importMapToString()),
    writeFile(jsenvGroupMapFileUrl, groupMapToString()),
    writeFile(jsenvEnvFileUrl, envToString()),
  ])

  if (!writeOnFilesystem) {
    compileServer.stoppedPromise.then(() => {
      removeFileSystemNode(jsenvImportMapFileUrl, { allowUseless: true })
      removeFileSystemNode(jsenvGroupMapFileUrl, { allowUseless: true })
      removeFileSystemNode(jsenvEnvFileUrl)
    })
  }

  if (stopOnPackageVersionChange) {
    const checkPackageVersion = () => {
      let packageObject
      try {
        packageObject = readPackage(packageFilePath)
      } catch (e) {
        // package json deleted ? not a problem
        // let's wait for it to show back
        if (e.code === "ENOENT") return
        // package.json malformed ? not a problem
        // let's wait for use to fix it or filesystem to finish writing the file
        if (e.name === "SyntaxError") return
        throw e
      }

      if (packageVersion !== packageObject.version) {
        compileServer.stop(STOP_REASON_PACKAGE_VERSION_CHANGED)
      }
    }

    const unregister = registerFileLifecycle(packageFilePath, {
      added: checkPackageVersion,
      updated: checkPackageVersion,
      keepProcessAlive: false,
    })
    compileServer.stoppedPromise.then(
      () => {
        unregister()
      },
      () => {},
    )
  }

  return {
    jsenvDirectoryRelativeUrl,
    outDirectoryRelativeUrl,
    ...compileServer,
    compileServerImportMap: importMapForCompileServer,
    compileServerGroupMap: groupMap,
  }
}

const readPackage = (packagePath) => {
  const buffer = readFileSync(packagePath)
  const string = String(buffer)
  const packageObject = JSON.parse(string)
  return packageObject
}

export const STOP_REASON_PACKAGE_VERSION_CHANGED = {
  toString: () => `package version changed`,
}

const serveProjectFiles = async ({
  projectDirectoryUrl,
  request,
  projectFileRequestedCallback,
}) => {
  const { ressource, method, headers } = request
  const relativeUrl = ressource.slice(1)

  projectFileRequestedCallback({
    relativeUrl,
    request,
  })

  const fileUrl = resolveUrl(relativeUrl, projectDirectoryUrl)
  const filePath = urlToFileSystemPath(fileUrl)

  const responsePromise = serveFile(filePath, {
    method,
    headers,
  })

  return responsePromise
}

/**
 * generateImportMapForCompileServer allows the following:
 *
 * import importMap from '/.jsenv/importMap.json'
 *
 * returns jsenv internal importMap and
 *
 * import importMap from '/importMap.json'
 *
 * returns the project importMap.
 * Note that if importMap file does not exists an empty object is returned.
 * Note that if project uses a custom importMapFileRelativeUrl jsenv internal import map
 * remaps '/importMap.json' to the real importMap
 *
 * This pattern exists so that jsenv can resolve some dynamically injected import such as
 *
 * @jsenv/core/helpers/regenerator-runtime/regenerator-runtime.js
 */
const generateImportMapForCompileServer = async ({
  logger,
  projectDirectoryUrl,
  outDirectoryRelativeUrl,
  importMapFileRelativeUrl,
}) => {
  const importMapForJsenvCore = await generateImportMapForPackage({
    logger,
    projectDirectoryUrl: jsenvCoreDirectoryUrl,
    rootProjectDirectoryUrl: projectDirectoryUrl,
    includeImports: true,
    includeExports: true,
  })
  const importMapInternal = {
    imports: {
      ...(outDirectoryRelativeUrl === ".jsenv/out/"
        ? {}
        : {
            "/.jsenv/out/": `./${outDirectoryRelativeUrl}`,
          }),
      // in case importMapFileRelativeUrl is not the default
      // redirect /importMap.json to the proper location
      // well fuck it won't be compiled to something
      // with this approach
      ...(importMapFileRelativeUrl === "importMap.json"
        ? {}
        : {
            // but it means importMap.json is not
            // gonna hit compile server
            "/importMap.json": `./${importMapFileRelativeUrl}`,
          }),
    },
  }
  const importMapForProject = await readProjectImportMap({
    projectDirectoryUrl,
    importMapFileRelativeUrl,
  })
  const importMap = [importMapForJsenvCore, importMapInternal, importMapForProject].reduce(
    (previous, current) => composeTwoImportMaps(previous, current),
    {},
  )
  return importMap
}

const cleanOutDirectoryIfObsolete = async ({ logger, outDirectoryUrl, outDirectoryMeta }) => {
  const jsenvCorePackageFileUrl = resolveUrl("./package.json", jsenvCoreDirectoryUrl)
  const jsenvCorePackageFilePath = urlToFileSystemPath(jsenvCorePackageFileUrl)
  const jsenvCorePackageVersion = readPackage(jsenvCorePackageFilePath).version

  outDirectoryMeta = {
    ...outDirectoryMeta,
    jsenvCorePackageVersion,
  }

  const metaFileUrl = resolveUrl("./meta.json", outDirectoryUrl)

  let previousOutDirectoryMeta
  try {
    const source = await readFile(metaFileUrl)
    previousOutDirectoryMeta = JSON.parse(source)
  } catch (e) {
    if (e && e.code === "ENOENT") {
      previousOutDirectoryMeta = null
    } else {
      throw e
    }
  }

  if (
    previousOutDirectoryMeta !== null &&
    JSON.stringify(previousOutDirectoryMeta) !== JSON.stringify(outDirectoryMeta)
  ) {
    logger.info(`clean out directory at ${urlToFileSystemPath(outDirectoryUrl)}`)
    await ensureEmptyDirectory(outDirectoryUrl)
  }

  await writeFile(metaFileUrl, JSON.stringify(outDirectoryMeta, null, "  "))
}
