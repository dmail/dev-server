import { resolve } from "url"
import createRollupBabelPlugin from "rollup-plugin-babel"
import { resolveImport, filenameToFileHref, fileHrefToFilename } from "@jsenv/module-resolution"
import { fileRead } from "@dmail/helper"
import { createOperation } from "@dmail/cancellation"
import { babelPluginDescriptionToBabelPluginArray } from "../jsCompile/babelPluginDescriptionToBabelPluginArray.js"
import { fetchUsingHttp } from "../platform/node/fetchUsingHttp.js"
import { readSourceMappingURL } from "../replaceSourceMappingURL.js"
import { writeRollupBundle } from "./writeRollupBundle.js"

export const generateEntryPointsForPlatform = async ({
  cancellationToken,
  projectFolder,
  into,
  entryPointsDescription,
  babelPluginDescription,
  rollupOptions,
}) => {
  const rollupJsenvPlugin = {
    name: "jsenv",
    resolveId: (importee, importer) => {
      const rootHref = filenameToFileHref(projectFolder)
      // hotfix because entry file has no importer
      // so it would be resolved against root which is a folder
      // and url resolution would not do what we expect
      if (!importer) return `${rootHref}/${importee}`

      const id = resolveImport({
        root: rootHref,
        importer,
        specifier: importee,
        useNodeModuleResolutionOnRelative: false,
        // once you have decided to bundle using jsenv
        // you must stick to jsenv module resolution
        // so that jsenv knows where to find the source file to bundle
        // because it will bundle node_modules as well
        // (to get proper babel plugin applied)
        // but won't rely on stuff like having a module inside your package.json
        useNodeModuleResolutionInsideDedicatedFolder: true,
      })
      return id
    },

    load: async (href) => {
      const source = await fetchHref(href)

      const sourceMappingURL = readSourceMappingURL(source)
      if (!sourceMappingURL) return { code: source }

      const base64Prefix = "data:application/json;charset=utf-8;base64,"
      if (sourceMappingURL.startsWith(base64Prefix)) {
        const mapBase64Source = sourceMappingURL.slice(base64Prefix.length)
        const mapSource = new Buffer(mapBase64Source, "base64").toString("utf8")
        return { code: source, map: JSON.parse(mapSource) }
      }

      const resolvedSourceMappingURL = resolve(href, sourceMappingURL)
      const mapSource = await fetchHref(resolvedSourceMappingURL)

      return { code: source, map: JSON.parse(mapSource) }
    },
  }

  const fetchHref = async (href) => {
    if (href.startsWith("http://")) {
      const response = await fetchUsingHttp(href, { cancellationToken })
      ensureResponseSuccess(response)
      return response.body
    }
    if (href.startsWith("https://")) {
      const response = await fetchUsingHttp(href, { cancellationToken })
      ensureResponseSuccess(response)
      return response.body
    }
    if (href.startsWith("file:///")) {
      const code = await createOperation({
        cancellationToken,
        start: () => fileRead(fileHrefToFilename(href)),
      })
      return code
    }

    return ""
  }

  const ensureResponseSuccess = ({ url, status }) => {
    if (status < 200 || status > 299) {
      throw new Error(`unexpected response status for ${url}, got ${status}`)
    }
  }

  const babelPluginArray = babelPluginDescriptionToBabelPluginArray(babelPluginDescription)

  // https://github.com/rollup/rollup-plugin-babel
  const rollupBabelPlugin = createRollupBabelPlugin({
    babelrc: false,
    plugins: babelPluginArray,
    parserOpts: {
      allowAwaitOutsideFunction: true,
    },
  })

  return writeRollupBundle({
    cancellationToken,
    inputOptions: {
      input: entryPointsDescription,
      plugins: [rollupJsenvPlugin, rollupBabelPlugin],
      // skip rollup warnings
      onwarn: () => {},
      experimentalTopLevelAwait: true,
    },
    outputOptions: {
      // https://rollupjs.org/guide/en#output-dir
      dir: `${projectFolder}/${into}`,
      // https://rollupjs.org/guide/en#output-sourcemap
      sourcemap: true,
      sourcemapExcludeSources: true,
      // https://rollupjs.org/guide/en#experimentaltoplevelawait
      experimentalTopLevelAwait: true,
      ...rollupOptions,
    },
  })
}
