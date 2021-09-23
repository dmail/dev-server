import { serveFile } from "@jsenv/server"
import { resolveUrl, resolveDirectoryUrl } from "@jsenv/filesystem"

import { serverUrlToCompileInfo } from "@jsenv/core/src/internal/url_conversion.js"
import {
  COMPILE_ID_BUILD_GLOBAL,
  COMPILE_ID_BUILD_GLOBAL_FILES,
  COMPILE_ID_BUILD_COMMONJS,
  COMPILE_ID_BUILD_COMMONJS_FILES,
} from "../CONSTANTS.js"
import { compileFile } from "./compileFile.js"
import { jsenvCompilerForHtml } from "./jsenvCompilerForHtml.js"
import { jsenvCompilerForImportmap } from "./jsenvCompilerForImportmap.js"
import { jsenvCompilerForJavaScript } from "./jsenvCompilerForJavaScript.js"

const jsenvCompilers = {
  ...jsenvCompilerForJavaScript,
  ...jsenvCompilerForHtml,
  ...jsenvCompilerForImportmap,
}

export const createCompiledFileService = ({
  sourceFileService,
  cancellationToken,
  logger,

  projectDirectoryUrl,
  outDirectoryRelativeUrl,

  runtimeSupport,
  transformTopLevelAwait,
  moduleOutFormat,
  importMetaFormat,
  babelPluginMap,
  groupMap,
  convertMap,
  customCompilers,
  urlMappings,

  jsenvToolbarInjection,

  projectFileRequestedCallback,
  useFilesystemAsCache,
  writeOnFilesystem,
  compileCacheStrategy,
  sourcemapExcludeSources,
}) => {
  return (request) => {
    const { origin, ressource } = request
    const requestUrl = `${origin}${ressource}`

    const requestCompileInfo = serverUrlToCompileInfo(requestUrl, {
      outDirectoryRelativeUrl,
      compileServerOrigin: origin,
    })

    // not inside compile directory -> nothing to compile
    if (!requestCompileInfo.insideCompileDirectory) {
      return sourceFileService(request)
    }

    const { compileId, afterCompileId } = requestCompileInfo
    // serve files inside /.jsenv/out/* directly without compilation
    // this is just to allow some files to be written inside outDirectory and read directly
    // if asked by the client (such as env.json, groupMap.json, meta.json)
    if (!compileId) {
      return serveFile(request, {
        rootDirectoryUrl: projectDirectoryUrl,
        etagEnabled: true,
      })
    }

    const allowedCompileIds = [
      ...Object.keys(groupMap),
      COMPILE_ID_BUILD_GLOBAL,
      COMPILE_ID_BUILD_GLOBAL_FILES,
      COMPILE_ID_BUILD_COMMONJS,
      COMPILE_ID_BUILD_COMMONJS_FILES,
    ]
    if (!allowedCompileIds.includes(compileId)) {
      return {
        status: 400,
        statusText: `compileId must be one of ${allowedCompileIds}, received ${compileId}`,
      }
    }

    // nothing after compileId, we don't know what to compile (not supposed to happen)
    if (afterCompileId === "") {
      return sourceFileService(request)
    }

    const originalFileRelativeUrl = afterCompileId
    projectFileRequestedCallback(originalFileRelativeUrl, request)

    const originalFileUrl = `${projectDirectoryUrl}${originalFileRelativeUrl}`
    const compileDirectoryRelativeUrl = `${outDirectoryRelativeUrl}${compileId}/`
    const compileDirectoryUrl = resolveDirectoryUrl(
      compileDirectoryRelativeUrl,
      projectDirectoryUrl,
    )
    const compiledFileUrl = resolveUrl(
      originalFileRelativeUrl,
      compileDirectoryUrl,
    )

    let compilerOptions = null
    const compilerCandidateParams = {
      cancellationToken,
      logger,

      compileServerOrigin: request.origin,
      projectDirectoryUrl,
      originalFileUrl,
      compiledFileUrl,
      compileId,
      outDirectoryRelativeUrl,

      urlMappings,

      moduleOutFormat,
      importMetaFormat,
      groupMap,
      babelPluginMap,
      convertMap,
      transformTopLevelAwait,
      runtimeSupport,

      writeOnFilesystem,
      sourcemapExcludeSources,
      jsenvToolbarInjection,
    }
    const compilerCandidates = { ...jsenvCompilers, ...customCompilers }
    Object.keys(compilerCandidates).find((compilerCandidateName) => {
      const returnValue = compilerCandidates[compilerCandidateName](
        compilerCandidateParams,
      )
      if (returnValue && typeof returnValue === "object") {
        compilerOptions = returnValue
        return true
      }
      return false
    })

    if (compilerOptions) {
      return compileFile({
        cancellationToken,
        logger,

        projectDirectoryUrl,
        originalFileUrl,
        compiledFileUrl,

        writeOnFilesystem: true, // we always need them
        useFilesystemAsCache,
        compileCacheStrategy,
        projectFileRequestedCallback,
        request,

        ...compilerOptions,
      })
    }

    // no compiler -> serve original file
    // we don't redirect otherwise it complexify ressource tracking
    // and url resolution
    return sourceFileService({
      ...request,
      ressource: `/${originalFileRelativeUrl}`,
    })
  }
}
