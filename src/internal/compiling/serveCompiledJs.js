import { urlToContentType, serveFile } from "@jsenv/server"
import { COMPILE_ID_BUNDLE, COMPILE_ID_OTHERWISE } from "internal/CONSTANTS.js"
import { urlToRelativeUrl, resolveFileUrl, fileUrlToPath } from "internal/urlUtils.js"
import { readFileContent } from "internal/filesystemUtils.js"
import { transformJs } from "./js-compilation-service/transformJs.js"
import { transformResultToCompilationResult } from "./js-compilation-service/transformResultToCompilationResult.js"
import { serveCompiledFile } from "./serveCompiledFile.js"

export const serveCompiledJs = async ({
  cancellationToken,
  logger,

  projectDirectoryUrl,
  compileDirectoryUrl,
  importReplaceMap,
  importFallbackMap,

  transformTopLevelAwait,
  transformModuleIntoSystemFormat,
  groupMap,
  babelPluginMap,
  convertMap,
  projectFileRequestedCallback,
  request,
  useFilesystemAsCache,
  writeOnFilesystem,
}) => {
  const { origin, ressource, method, headers } = request
  const requestUrl = `${origin}${ressource}`
  const compileDirectoryRelativeUrl = urlToRelativeUrl(compileDirectoryUrl, projectDirectoryUrl)
  const compileDirectoryServerUrl = `${origin}/${compileDirectoryRelativeUrl}`
  // not inside compile directory -> nothing to compile
  if (!requestUrl.startsWith(compileDirectoryServerUrl)) {
    return null
  }

  const afterCompileDirectory = requestUrl.slice(compileDirectoryServerUrl.length)

  // serve files inside /.dist/* directly without compilation
  // this is just to allow some files to be written inside .dist and read directly
  // if asked by the client
  if (!afterCompileDirectory.includes("/") || afterCompileDirectory[0] === "/") {
    return serveFile(`${projectDirectoryUrl}${ressource.slice(1)}`, {
      method,
      headers,
    })
  }

  const parts = afterCompileDirectory.split("/")
  const compileId = parts[0]
  // no compileId, we don't know what to compile (not supposed so happen)
  if (compileId === "") {
    return null
  }

  // unexpected compileId
  if (compileId !== COMPILE_ID_BUNDLE && compileId in groupMap === false) {
    return {
      status: 400,
      statusText: `compileId must be one of ${Object.keys(groupMap)}, received ${compileId}`,
    }
  }

  const remaining = parts.slice(1).join("/")
  // nothing after compileId, we don't know what to compile (not supposed to happen)
  if (remaining === "") {
    return null
  }

  const originalFileRelativeUrl = remaining

  // json, css, html etc does not need to be compiled
  // they are redirected to the source location that will be served as file
  // ptet qu'on devrait pas parce que
  // on pourrait vouloir minifier ce résultat (mais bon ça osef disons)
  // par contre on voudrait ptet avoir le bon concept
  // (quon a dans transformResultToCompilationResult)
  // pour tracker la bonne source avec le bon etag
  // sinon on track le export default
  // mais ça ça vient plutot du bundle
  // qui doit gérer content/contentRaw
  const contentType = urlToContentType(requestUrl)
  if (contentType !== "application/javascript") {
    return {
      status: 307,
      headers: {
        location: resolveFileUrl(originalFileRelativeUrl, origin),
      },
    }
  }

  const originalFileUrl = `${projectDirectoryUrl}${originalFileRelativeUrl}`
  const originalFileServerUrl = `${origin}/${originalFileRelativeUrl}`
  if (originalFileServerUrl in importReplaceMap) {
    // disable cache if the file is ignored anyway
    // and a function is used instead
    useFilesystemAsCache = false
  }

  let compiledIdForGroupMap
  if (compileId === COMPILE_ID_BUNDLE) {
    compiledIdForGroupMap = getWorstCompileId(groupMap)
    // we are compiling for rollup, do not transform into systemjs format
    transformModuleIntoSystemFormat = false
  } else {
    compiledIdForGroupMap = compileId
  }

  const compiledFileUrl = `${compileDirectoryUrl}${compileId}/${originalFileRelativeUrl}`

  return serveCompiledFile({
    cancellationToken,
    logger,

    projectDirectoryUrl,
    importReplaceMap,
    importFallbackMap,
    originalFileUrl,
    compiledFileUrl,
    writeOnFilesystem,
    useFilesystemAsCache,
    projectFileRequestedCallback,
    request,
    compile: async () => {
      let code
      if (originalFileServerUrl in importReplaceMap) {
        code = await importReplaceMap[originalFileServerUrl]()
      } else if (originalFileServerUrl in importFallbackMap) {
        try {
          code = await readFileContent(fileUrlToPath(originalFileUrl))
        } catch (e) {
          if (e.code === "ENOENT") {
            code = await importFallbackMap[originalFileServerUrl]()
          } else {
            throw e
          }
        }
      } else {
        code = await readFileContent(fileUrlToPath(originalFileUrl))
      }

      const groupBabelPluginMap = {}
      groupMap[compiledIdForGroupMap].babelPluginRequiredNameArray.forEach(
        (babelPluginRequiredName) => {
          if (babelPluginRequiredName in babelPluginMap) {
            groupBabelPluginMap[babelPluginRequiredName] = babelPluginMap[babelPluginRequiredName]
          }
        },
      )

      const transformResult = await transformJs({
        projectDirectoryUrl,
        code,
        url: originalFileUrl,
        babelPluginMap: groupBabelPluginMap,
        convertMap,
        transformTopLevelAwait,
        transformModuleIntoSystemFormat,
      })

      const sourcemapFileUrl = `${compiledFileUrl}.map`

      return transformResultToCompilationResult(transformResult, {
        projectDirectoryUrl,
        originalFileContent: code,
        originalFileUrl,
        compiledFileUrl,
        sourcemapFileUrl,
      })
    },
  })
}

const getWorstCompileId = (groupMap) => {
  if (COMPILE_ID_OTHERWISE in groupMap) {
    return COMPILE_ID_OTHERWISE
  }
  return Object.keys(groupMap)[Object.keys(groupMap).length - 1]
}
