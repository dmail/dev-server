import { extname, basename, relative } from "path"
import { generateImportMapForPackage } from "@jsenv/node-module-import-map"
import { composeTwoImportMaps } from "@jsenv/import-map"
import { fileUrlToPath, resolveDirectoryUrl, fileUrlToRelativePath } from "../urlUtils.js"
import { serveCompiledFile } from "./serveCompiledFile.js"

// important to use require here
// because @jsenv/bundling use relativePathInception
// and if we use direct import we will no longer
// execute @jsenv/bunling bundled files but sources files
// meaning if we use @jsenv/core bundle we'll fail
// to find the @jsenv/bundling files
const { generateBundle, bundleToCompilationResult } = import.meta.require("@jsenv/bundling")
const { readProjectImportMap } = import.meta.require("@jsenv/core")

export const serveBundle = async ({
  logger,
  jsenvProjectDirectoryUrl,
  projectDirectoryUrl,
  compileDirectoryUrl,
  relativePathToProjectDirectory,
  relativePathToCompileDirectory,
  sourcemapRelativePath = computeSourcemapRelativePath(relativePathToCompileDirectory),
  importDefaultExtension,
  importMapFileRelativePath,
  importMapForBundle = {},
  importReplaceMap = {},
  projectFileRequestedCallback,
  babelPluginMap,
  request,
  format,
  formatOutputOptions = {},
}) => {
  if (typeof jsenvProjectDirectoryUrl !== "string") {
    throw new TypeError(
      `jsenvProjectDirectoryUrl must be a string, got ${jsenvProjectDirectoryUrl}`,
    )
  }

  const compile = async () => {
    const entryExtname = extname(relativePathToProjectDirectory)
    const entryBasename = basename(relativePathToProjectDirectory, entryExtname)
    const entryName = entryBasename
    const bundleDirectoryUrl = resolveDirectoryUrl(
      relativePathToProjectDirectory,
      compileDirectoryUrl,
    )
    const bundleDirectoryRelativePath = fileUrlToRelativePath(bundleDirectoryUrl)
    const entryPointMap = {
      [entryName]: relativePathToProjectDirectory,
    }

    const importMapForJsenvProjectUsingServeBundle = await generateImportMapForPackage({
      projectDirectoryPath: fileUrlToPath(jsenvProjectDirectoryUrl),
      rootProjectDirectoryPath: fileUrlToPath(projectDirectoryUrl),
      logger,
    })
    importMapForBundle = composeTwoImportMaps(
      importMapForBundle,
      importMapForJsenvProjectUsingServeBundle,
    )
    importReplaceMap = {
      ...importReplaceMap,
      "/.jsenv/compileServerImportMap.json": async () => {
        /**
         * Explanation of what happens here:
         *
         * To execute some code, jsenv injects some import like
         * import "@jsenv/core/helpers/regenerator-runtime/regenerator-runtime.js"
         * To find the corresponding file (which is inside @jsenv/core source code)
         * We use readProjectImportMap provided by @jsenv/core.
         * Internally it just adds @jsenv/core remapping to the project and
         * any of its dependency.
         * In practice only @jsenv/bundling and @jsenv/compile-server
         * will do that kind of stuff and depends directly on @jsenv/core.
         *
         * Other solution (for now rejected)
         *
         * Add an option to generateImportMapForProjectPackage
         * like fakeDependencies: {}
         * -> Rejected in favor of adding it explicitely in package.json
         *
         * Forcing every project to add either
         * "dependencies": { "@jsenv/helpers": "1.0.0"}
         * or
         * "peerDependencies": { "@jsenv/helpers": "1.0.0" }
         * And change the injected imports to @jsenv/helpers/*
         * -> Rejected because it would force project to declare the dependency
         * Even if in practice they do have this dependency
         * It feels strange.
         *
         * Inject "/node_modules/@jsenv/compile-server/node_modules/@jsenv/core/helpers/*"
         * instead of "@jsenv/core/helpers/*"
         * -> Rejected because it won't work when @jsenv/compile-server is a devDependency
         */
        const importMap = await readProjectImportMap({
          logger,
          projectDirectoryUrl,
          jsenvProjectDirectoryUrl,
          importMapFileRelativePath,
        })
        return JSON.stringify(importMap)
      },
    }

    const bundle = await generateBundle({
      logLevel: "off",
      projectDirectoryPath: fileUrlToPath(projectDirectoryUrl),
      bundleDirectoryRelativePath,
      importDefaultExtension,
      importMapFileRelativePath,
      importMapForBundle,
      importReplaceMap,
      entryPointMap,
      babelPluginMap,
      compileGroupCount: 1,
      throwUnhandled: false,
      writeOnFileSystem: false,
      format,
      formatOutputOptions,
    })

    const sourcemapPathForModule = sourcemapRelativePathToSourcemapPathForModule(
      sourcemapRelativePath,
      relativePathToCompileDirectory,
    )
    const sourcemapPathForCache = sourcemapRelativePathToSourcePathForCache(
      sourcemapRelativePath,
      relativePathToCompileDirectory,
    )

    return bundleToCompilationResult(bundle, {
      projectDirectoryUrl,
      sourcemapPathForModule,
      sourcemapPathForCache,
    })
  }

  return serveCompiledFile({
    projectDirectoryUrl,
    compileDirectoryUrl,
    relativePathToProjectDirectory,
    relativePathToCompileDirectory,
    projectFileRequestedCallback,
    compile,
    request,
  })
}

const computeSourcemapRelativePath = (relativePathToCompileDirectory) => {
  const entryBasename = basename(relativePathToCompileDirectory)
  const sourcemapRelativePath = `${relativePathToCompileDirectory}/${entryBasename}__asset__/${entryBasename}.map`
  return sourcemapRelativePath
}

const sourcemapRelativePathToSourcemapPathForModule = (
  sourcemapRelativePath,
  relativePathToCompileDirectory,
) => {
  return `./${relative(relativePathToCompileDirectory, sourcemapRelativePath)}`
}

const sourcemapRelativePathToSourcePathForCache = (
  sourcemapRelativePath,
  relativePathToCompileDirectory,
) => {
  return relative(relativePathToCompileDirectory, sourcemapRelativePath)
}
