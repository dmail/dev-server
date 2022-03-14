import { fileURLToPath, pathToFileURL } from "node:url"
import { isFileSystemPath } from "@jsenv/filesystem"

import { applyRollupPlugins } from "@jsenv/core/src/utils/js_ast/apply_rollup_plugins.js"

import { applyLeadingSlashUrlResolution } from "../omega/kitchen/leading_slash_url_resolution.js"

export const buildWithRollup = async ({
  signal,
  logger,
  projectDirectoryUrl,
  buildDirectoryUrl,
  projectGraph,
  jsModulesUrlsToBuild,

  runtimeSupport,
  sourcemapInjection,
}) => {
  const resultRef = { current: null }
  await applyRollupPlugins({
    rollupPlugins: [
      rollupPluginJsenv({
        signal,
        logger,
        projectDirectoryUrl,
        buildDirectoryUrl,
        projectGraph,
        jsModulesUrlsToBuild,

        runtimeSupport,
        sourcemapInjection,
        resultRef,
      }),
    ],
    inputOptions: {
      input: [],
      onwarn: (warning) => {
        logger.warn(String(warning))
      },
    },
  })
  return resultRef.current
}

const rollupPluginJsenv = ({
  // logger,
  projectDirectoryUrl,
  buildDirectoryUrl,
  projectGraph,
  jsModulesUrlsToBuild,

  resultRef,
}) => {
  let _rollupEmitFile = () => {
    throw new Error("not implemented")
  }
  const emitChunk = (chunk) => {
    return _rollupEmitFile({
      type: "chunk",
      ...chunk,
    })
  }
  const urlImporters = {}

  return {
    name: "jsenv",
    async buildStart() {
      _rollupEmitFile = (...args) => this.emitFile(...args)
      jsModulesUrlsToBuild.forEach((jsModuleUrl) => {
        // const jsModuleUrlInfo = projectGraph.getUrlInfo(jsModuleUrl)
        emitChunk({
          id: jsModuleUrl,
        })
      })
    },
    async generateBundle(outputOptions, rollupResult) {
      _rollupEmitFile = (...args) => this.emitFile(...args)

      const jsModuleInfos = {}
      Object.keys(rollupResult).forEach((fileName) => {
        const rollupFileInfo = rollupResult[fileName]
        // there is 3 types of file: "placeholder", "asset", "chunk"
        if (rollupFileInfo.type === "chunk") {
          const { facadeModuleId } = rollupFileInfo
          let url
          if (facadeModuleId) {
            url = pathToFileURL(facadeModuleId).href
          } else {
            const { sources } = rollupFileInfo.map
            const sourcePath = sources[sources.length - 1]
            url = pathToFileURL(sourcePath).href
          }
          jsModuleInfos[url] = {
            // buildRelativeUrl: rollupFileInfo.fileName,
            content: rollupFileInfo.code,
            sourcemap: rollupFileInfo.map,
          }
        }
      })
      resultRef.current = {
        jsModuleInfos,
      }
    },
    outputOptions: (outputOptions) => {
      Object.assign(outputOptions, {
        format: "esm",
        dir: fileURLToPath(buildDirectoryUrl),
        entryFileNames: () => {
          return `[name].js`
        },
        chunkFileNames: () => {
          return `[name].js`
        },
      })
    },
    resolveId: (specifier, importer = projectDirectoryUrl) => {
      if (isFileSystemPath(importer)) {
        importer = pathToFileURL(importer).href
      }
      const url =
        applyLeadingSlashUrlResolution(specifier, projectDirectoryUrl) ||
        new URL(specifier, importer).href
      const existingImporter = urlImporters[url]
      if (!existingImporter) {
        urlImporters[url] = importer
      }
      if (!url.startsWith("file:")) {
        return { url, external: true }
      }
      return fileURLToPath(url)
    },
    async load(rollupId) {
      const fileUrl = pathToFileURL(rollupId).href
      const urlInfo = projectGraph.getUrlInfo(fileUrl)
      return {
        code: urlInfo.content,
        map: urlInfo.sourcemap,
      }
    },
    // nope: will be done by url versioning
    // resolveFileUrl: ({ moduleId, referenceId }) => {
    //   const url = pathToFileURL(moduleId).href
    //   urlsReferencedByJs.push(url)
    //   console.log("resolve file url for", url, "referenced by", referenceId)
    //   return `window.__asVersionedSpecifier__("${true}")`
    // },
    // renderDynamicImport: ({ facadeModuleId }) => {
    //   const url = pathToFileURL(facadeModuleId).href
    //   urlsReferencedByJs.push(url)
    //   console.log("render dynamic import", url)
    //   return {
    //     left: "import(window.__asVersionedSpecifier__(",
    //     right: "), import.meta.url)",
    //   }
    // },
    renderChunk: (code, chunkInfo) => {
      const { facadeModuleId } = chunkInfo
      if (!facadeModuleId) {
        // happens for inline module scripts for instance
        return null
      }
      return null
    },
  }
}
