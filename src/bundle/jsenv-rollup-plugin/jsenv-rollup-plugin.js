/* eslint-disable import/max-dependencies */
import { resolve } from "url"
import { fileRead, fileWrite } from "/node_modules/@dmail/helper/index.js"
import { createOperation } from "/node_modules/@dmail/cancellation/index.js"
import {
  resolveImport,
  remapResolvedImport,
  hrefToPathname,
  hrefToScheme,
} from "/node_modules/@jsenv/module-resolution/index.js"
import { fetchUsingHttp } from "../../platform/node/fetchUsingHttp.js"
import { readSourceMappingURL } from "../../replaceSourceMappingURL.js"
import { transpiler, findAsyncPluginNameInBabelConfigMap } from "../../jsCompile/transpiler.js"
import { writeSourceMapLocation } from "../../jsCompile/jsCompile.js"
import { computeBabelConfigMapSubset } from "./computeBabelConfigMapSubset.js"

const { minify: minifyCode } = import.meta.require("terser")
const { buildExternalHelpers } = import.meta.require("@babel/core")

const HELPER_FILENAME = "\0rollupPluginBabelHelpers.js"

export const createJsenvRollupPlugin = ({
  cancellationToken,
  importMap = {},
  projectFolder,
  origin = "http://example.com",

  featureNameArray,
  babelConfigMap,
  minify,
  target,
  detectAndTransformIfNeededAsyncInsertedByRollup = target === "browser",
  dir,
}) => {
  const babelConfigMapSubset = computeBabelConfigMapSubset({
    HELPER_FILENAME,
    featureNameArray,
    babelConfigMap,
    target,
  })

  const jsenvRollupPlugin = {
    name: "jsenv",

    resolveId: (specifier, importer) => {
      if (specifier === HELPER_FILENAME) return specifier

      let importerHref
      if (importer) {
        // importer will be a pathname
        // except if you have an absolute dependency like import 'http://domain.com/file.js'
        // so when needed convert importer back to an url
        if (importer.startsWith(`${projectFolder}/`)) {
          importerHref = `${origin}${importer.slice(projectFolder.length)}`
        } else if (hrefToScheme(importer) === "") {
          importerHref = `${origin}${importer}`
        } else {
          importerHref = importer
        }
      } else {
        // hotfix because entry file has no importer
        // so it would be resolved against root which is a folder
        // and url resolution would not do what we expect
        importerHref = `${origin}${projectFolder}`
      }

      const resolvedImport = resolveImport({
        importer: importerHref,
        specifier,
      })

      const id = remapResolvedImport({
        importMap,
        importerHref,
        resolvedImport,
      })

      // rollup works with pathname
      // le'sreturn himpathname when possible
      // otherwise sourcemap.sources will be messed up
      if (id.startsWith(`${origin}/`)) {
        const filename = `${projectFolder}${hrefToPathname(id)}`
        return filename
      }

      return id
    },

    // https://rollupjs.org/guide/en#resolvedynamicimport
    // resolveDynamicImport: (specifier, importer) => {

    // },

    load: async (id) => {
      if (id === HELPER_FILENAME) {
        // https://github.com/babel/babel/blob/master/packages/babel-core/src/tools/build-external-helpers.js#L1
        const allHelperCode = buildExternalHelpers(undefined, "module")
        return allHelperCode
      }

      const href = id[0] === "/" ? `file://${id}` : id
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

    transform: async (source, filename) => {
      if (filename === HELPER_FILENAME) return null
      if (filename.endsWith(".json")) {
        return {
          code: `export default ${source}`,
          map: { mappings: "" },
        }
      }

      const { code, map } = await transpiler({
        input: source,
        filename,
        babelConfigMap: babelConfigMapSubset,
        // false, rollup will take care to transform module into whatever format
        transformModuleIntoSystemFormat: false,
      })
      return { code, map }
    },

    renderChunk: (source) => {
      if (!minify) return null

      // https://github.com/terser-js/terser#minify-options
      const minifyOptions = target === "browser" ? { toplevel: false } : { toplevel: true }
      const result = minifyCode(source, {
        sourceMap: true,
        ...minifyOptions,
      })
      if (result.error) {
        throw result.error
      } else {
        return result
      }
    },

    writeBundle: async (bundle) => {
      if (!detectAndTransformIfNeededAsyncInsertedByRollup) return

      const asyncPluginName = findAsyncPluginNameInBabelConfigMap(babelConfigMapSubset)

      if (!asyncPluginName) return

      // we have to do this because rollup ads
      // an async wrapper function without transpiling it
      // if your bundle contains a dynamic import
      await Promise.all(
        Object.keys(bundle).map(async (bundleFilename) => {
          const bundleInfo = bundle[bundleFilename]

          const { code, map } = await transpiler({
            input: bundleInfo.code,
            inputMap: bundleInfo.map,
            filename: bundleFilename,
            babelConfigMap: { [asyncPluginName]: babelConfigMapSubset[asyncPluginName] },
            transformModuleIntoSystemFormat: false, // already done by rollup
          })

          await Promise.all([
            fileWrite(
              `${dir}/${bundleFilename}`,
              writeSourceMapLocation({ source: code, location: `./${bundleFilename}.map` }),
            ),
            fileWrite(`${dir}/${bundleFilename}.map`, JSON.stringify(map)),
          ])
        }),
      )
    },
  }

  const fetchHref = async (href) => {
    // this code allow you to have http/https dependency for convenience
    // but maybe we should warn about this.
    // it could also be vastly improved using a basic in memory cache
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
        start: () => fileRead(hrefToPathname(href)),
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

  return jsenvRollupPlugin
}
