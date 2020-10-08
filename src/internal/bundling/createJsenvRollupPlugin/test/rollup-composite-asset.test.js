/**
 * a faire
 *
 * - urlForCaching qu'on devrait rendre relative
 * il faudrait aussi un autre nom genre fileUrlRelativeToBundleDirectory (equivalent de fileName pour rollup)
 * - le fichier map des css bundled
 * - tester un aset remap avec importmap
 *
 */

import { createRequire } from "module"

import {
  urlToRelativeUrl,
  resolveUrl,
  urlToFileSystemPath,
  ensureEmptyDirectory,
  urlIsInsideOf,
  fileSystemPathToUrl,
  isFileSystemPath,
  readFile,
} from "@jsenv/util"
import { createLogger } from "@jsenv/logger"
import { createCompositeAssetHandler } from "../compositeAsset.js"
import { jsenvCompositeAssetHooks } from "../jsenvCompositeAssetHooks.js"
import { computeFileUrlForCaching } from "../computeFileUrlForCaching.js"

const require = createRequire(import.meta.url)

const { rollup } = require("rollup")

const projectDirectoryUrl = resolveUrl("./", import.meta.url)
const bundleDirectoryUrl = resolveUrl("./dist/", import.meta.url)
const inputFileUrl = resolveUrl("./index.html", import.meta.url)

const logger = createLogger({ logLevel: "debug" })

const generateBundle = async () => {
  await ensureEmptyDirectory(bundleDirectoryUrl)

  let compositeAssetHandler

  const virtualModules = {}

  const shortenUrl = (url) => {
    return urlIsInsideOf(url, projectDirectoryUrl)
      ? urlToRelativeUrl(url, projectDirectoryUrl)
      : url
  }

  const importerMapping = {}

  let emitFile = () => {}

  const compositeAssetPlugin = {
    async buildStart() {
      emitFile = (...args) => this.emitFile(...args)

      compositeAssetHandler = createCompositeAssetHandler(jsenvCompositeAssetHooks, {
        projectDirectoryUrl,
        connectReference: (reference) => {
          // ignore url outside project directory
          // a better version would console.warn about file url outside projectDirectoryUrl
          // and ignore them and console.info/debug about remote url (https, http, ...)
          if (!urlIsInsideOf(reference.url, projectDirectoryUrl)) {
            return { external: true }
          }

          if (reference.type === "asset") {
            reference.connect(async ({ transformPromise }) => {
              let { code, urlForCaching } = await transformPromise

              if (urlForCaching === undefined) {
                urlForCaching = computeFileUrlForCaching(reference.url, code)
              }
              logger.debug(`emit asset for ${shortenUrl(reference.url)}`)
              const rollupReferenceId = emitFile({
                type: "asset",
                source: code,
                fileName: urlToRelativeUrl(urlForCaching, projectDirectoryUrl),
              })
              logger.debug(`${shortenUrl(reference.url)} ready -> ${shortenUrl(urlForCaching)}`)
              return { rollupReferenceId, urlForCaching }
            })
          }

          if (reference.type === "js") {
            reference.connect(async ({ transformPromise }) => {
              const jsRelativeUrl = `./${urlToRelativeUrl(reference.url, projectDirectoryUrl)}`
              const id = jsRelativeUrl
              if (typeof reference.source !== "undefined") {
                virtualModules[id] = reference.source
              }

              logger.debug(`emit chunk for ${shortenUrl(reference.url)}`)
              const rollupReferenceId = emitFile({
                type: "chunk",
                id,
                ...(reference.previousJsReference
                  ? {
                      implicitlyLoadedAfterOneOf: [
                        `./${urlToRelativeUrl(
                          reference.previousJsReference.url,
                          projectDirectoryUrl,
                        )}`,
                      ],
                    }
                  : {}),
              })

              const { urlForCaching } = await transformPromise
              return { rollupReferenceId, urlForCaching }
            })
          }
        },
      })

      await compositeAssetHandler.prepareAssetEntry(inputFileUrl)
    },

    resolveId: (specifier, importer = projectDirectoryUrl) => {
      if (specifier in virtualModules) {
        return specifier
      }
      if (isFileSystemPath(importer)) {
        importer = fileSystemPathToUrl(importer)
      }
      const url = resolveUrl(specifier, importer)
      // keep external url intact
      if (!urlIsInsideOf(url, "file:///")) {
        return { id: specifier, external: true }
      }
      if (importer !== projectDirectoryUrl) {
        importerMapping[url] = importer
      }
      return url
    },

    load: async (id) => {
      if (id in virtualModules) {
        return virtualModules[id]
      }
      if (id.endsWith(".js")) {
        return readFile(id)
      }
      const importer = importerMapping[id]

      if (importer) {
        const assetReferenceId = await compositeAssetHandler.getAssetReferenceId(id, {
          importerUrl: importer,
        })
        return `export default import.meta.ROLLUP_FILE_URL_${assetReferenceId};`
      }

      compositeAssetHandler.getAssetReferenceId(id)
      return { code: "" }
    },

    async generateBundle(options, bundle) {
      emitFile = (...args) => this.emitFile(...args)
      // malheureusement rollup ne permet pas de savoir lorsqu'un chunk
      // a fini d'etre résolu (parsing des imports statiques et dynamiques recursivement)
      // donc lorsque le build se termine on va indiquer
      // aux assets faisant référence a ces chunk js qu'ils sont terminés
      // et donc les assets peuvent connaitre le nom du chunk
      // et mettre a jour leur dépendance vers ce fichier js
      await compositeAssetHandler.resolveAssetEntries(bundle)
    },
  }

  const bundle = await rollup({
    input: [],
    plugins: [compositeAssetPlugin],
  })

  await bundle.write({
    format: "esm",
    dir: urlToFileSystemPath(bundleDirectoryUrl),
  })
}

await generateBundle()
