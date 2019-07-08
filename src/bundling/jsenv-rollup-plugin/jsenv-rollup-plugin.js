/* eslint-disable import/max-dependencies */
import { resolve } from "url"
import { fileRead, fileWrite } from "@dmail/helper"
import { createOperation } from "@dmail/cancellation"
import { resolvePath, hrefToPathname, hrefToScheme } from "@jsenv/module-resolution"
import {
  pathnameToOperatingSystemPath,
  operatingSystemPathToPathname,
  pathnameIsInside,
  pathnameToRelativePathname,
  isWindowsPath,
} from "@jsenv/operating-system-path"
import { fetchUsingHttp } from "../../node-platform-service/node-platform/fetchUsingHttp.js"
import { writeSourceMappingURL, parseSourceMappingURL } from "../../source-mapping-url.js"
import {
  transpiler,
  findAsyncPluginNameInbabelPluginMap,
} from "../../compiled-js-service/transpiler.js"
import { readProjectImportMap } from "../../import-map/readProjectImportMap.js"
import { createLogger } from "../../logger.js"

const { minify: minifyCode } = import.meta.require("terser")

export const createJsenvRollupPlugin = ({
  cancellationToken,
  projectPathname,
  importMapRelativePath,
  importDefaultExtension,
  specifierMap,
  specifierDynamicMap,
  origin = "http://example.com",
  babelPluginMap,
  minify,
  format,
  detectAndTransformIfNeededAsyncInsertedByRollup = format === "global",
  dir,
  logLevel,
}) => {
  const { log } = createLogger({ logLevel })

  const projectImportMap = readProjectImportMap({
    projectPathname,
    importMapRelativePath,
  })
  const importMap = projectImportMap

  // https://github.com/babel/babel/blob/master/packages/babel-core/src/tools/build-external-helpers.js#L1

  const idSkipTransformArray = []
  const idLoadMap = {}

  const jsenvRollupPlugin = {
    name: "jsenv",

    resolveId: (specifier, importer) => {
      if (specifier in specifierDynamicMap) {
        const specifierDynamicMapping = specifierDynamicMap[specifier]
        if (typeof specifierDynamicMapping !== "function") {
          throw new Error(
            `specifier inside specifierDynamicMap must be functions, found ${specifierDynamicMapping} for ${specifier}`,
          )
        }

        const osPath = pathnameToOperatingSystemPath(`${projectPathname}${specifier}`)
        idLoadMap[osPath] = specifierDynamicMapping
        return osPath
      }

      if (specifier in specifierMap) {
        const specifierMapping = specifierMap[specifier]
        if (typeof specifierMapping !== "string") {
          throw new Error(
            `specifier inside specifierMap must be strings, found ${specifierMapping} for ${specifier}`,
          )
        }
        specifier = specifierMapping

        // disable remapping when specifier starts with file://
        // this is the only way for now to explicitely disable remapping
        // to target a specific file on filesystem
        // also remove file:// to keep only the os path
        // otherwise windows and rollup will not be happy when
        // searching the files
        if (specifier.startsWith("file:///")) {
          specifier = specifier.slice("file://".length)
          return pathnameToOperatingSystemPath(specifier)
        }
      }

      if (!importer) {
        if (specifier[0] === "/") specifier = specifier.slice(1)
        return pathnameToOperatingSystemPath(`${projectPathname}/${specifier}`)
      }

      let importerHref
      const hasSheme = isWindowsPath(importer) ? false : Boolean(hrefToScheme(importer))
      // there is already a scheme (http, https, file), keep it
      // it means there is an absolute import starting with file:// or http:// for instance.
      if (hasSheme) {
        importerHref = importer
      }
      // 99% of the time importer is an operating system path
      // here we ensure / is resolved against project by forcing an url resolution
      // prefixing with origin
      else {
        const importerPathname = operatingSystemPathToPathname(importer)
        const isInsideProject = pathnameIsInside(importerPathname, projectPathname)
        if (!isInsideProject) {
          throw createImporterOutsideProjectError({ importer, projectPathname })
        }

        importerHref = `${origin}${pathnameToRelativePathname(importerPathname, projectPathname)}`
      }

      const id = resolvePath({
        specifier,
        importer: importerHref,
        importMap,
        defaultExtension: importDefaultExtension,
      })

      // rollup works with operating system path
      // return os path when possible
      // to ensure we can predict sourcemap.sources returned by rollup
      const resolvedIdIsInsideProject = id.startsWith(`${origin}/`)
      if (resolvedIdIsInsideProject) {
        const idPathname = hrefToPathname(id)
        return pathnameToOperatingSystemPath(`${projectPathname}${idPathname}`)
      }

      return id
    },

    // https://rollupjs.org/guide/en#resolvedynamicimport
    // resolveDynamicImport: (specifier, importer) => {

    // },

    load: async (id) => {
      if (id in idLoadMap) {
        const returnValue = await idLoadMap[id]()
        if (typeof returnValue === "string") return returnValue
        if (returnValue.skipTransform) {
          idSkipTransformArray.push(id)
        }
        return returnValue.code
      }

      const hasSheme = isWindowsPath(id) ? false : Boolean(hrefToScheme(id))
      const href = hasSheme ? id : `file://${operatingSystemPathToPathname(id)}`
      let source = await fetchHref(href)

      if (id.endsWith(".json")) {
        source = `export default ${source}`
      }

      const sourcemapParsingResult = parseSourceMappingURL(source)

      if (!sourcemapParsingResult) return { code: source }

      if (sourcemapParsingResult.sourcemapString)
        return { code: source, map: JSON.parse(sourcemapParsingResult.sourcemapString) }

      const resolvedSourceMappingURL = resolve(href, sourcemapParsingResult.sourcemapURL)
      const sourcemapString = await fetchHref(resolvedSourceMappingURL)
      return { code: source, map: JSON.parse(sourcemapString) }
    },

    transform: async (source, id) => {
      if (idSkipTransformArray.includes(id)) {
        return null
      }

      const hasSheme = isWindowsPath(id) ? false : Boolean(hrefToScheme(id))
      let filename
      let filenameRelative
      if (hasSheme) {
        filename = id
      } else {
        filename = id
        const filePathname = operatingSystemPathToPathname(id)
        filenameRelative = pathnameToRelativePathname(filePathname, projectPathname).slice(1)
      }

      const { code, map } = await transpiler({
        input: source,
        filename,
        filenameRelative,
        babelPluginMap,
        // false, rollup will take care to transform module into whatever format
        transformModuleIntoSystemFormat: false,
      })
      return { code, map }
    },

    renderChunk: (source) => {
      if (!minify) return null

      // https://github.com/terser-js/terser#minify-options
      const minifyOptions = format === "global" ? { toplevel: false } : { toplevel: true }
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
      if (detectAndTransformIfNeededAsyncInsertedByRollup) {
        await transformAsyncInsertedByRollup({ dir, babelPluginMap, bundle })
      }

      Object.keys(bundle).forEach((bundleFilename) => {
        log(`-> ${dir}/${bundleFilename}`)
      })
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
        start: () => fileRead(pathnameToOperatingSystemPath(hrefToPathname(href))),
      })
      return code
    }

    return ""
  }

  return jsenvRollupPlugin
}

const ensureResponseSuccess = ({ url, status }) => {
  if (status < 200 || status > 299) {
    throw new Error(`unexpected response status for ${url}, got ${status}`)
  }
}

const createImporterOutsideProjectError = ({ importer, projectPathname }) =>
  new Error(`importer must be inside project
  importer: ${importer}
  project: ${pathnameToOperatingSystemPath(projectPathname)}`)

const transformAsyncInsertedByRollup = async ({ dir, babelPluginMap, bundle }) => {
  const asyncPluginName = findAsyncPluginNameInbabelPluginMap(babelPluginMap)

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
        babelPluginMap: { [asyncPluginName]: babelPluginMap[asyncPluginName] },
        transformModuleIntoSystemFormat: false, // already done by rollup
      })

      await Promise.all([
        fileWrite(
          `${dir}/${bundleFilename}`,
          writeSourceMappingURL(code, `./${bundleFilename}.map`),
        ),
        fileWrite(`${dir}/${bundleFilename}.map`, JSON.stringify(map)),
      ])
    }),
  )
}
