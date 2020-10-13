import {
  resolveUrl,
  urlToRelativeUrl,
  urlIsInsideOf,
  isFileSystemPath,
  fileSystemPathToUrl,
  urlToParentUrl,
} from "@jsenv/util"
import { createLogger } from "@jsenv/logger"
import { computeFileNameForRollup } from "./computeFileNameForRollup.js"
import { showSourceLocation } from "./showSourceLocation.js"

const logger = createLogger({ logLevel: "debug" })

const assetFileNamePattern = "assets/[name]-[hash][extname]"

const computeTargetFileNameForRollup = (target) => {
  return computeFileNameForRollup(
    target.url,
    target.sourceAfterTransformation,
    target.fileNamePattern || assetFileNamePattern,
  )
}

const precomputeTargetFileNameForRollup = (target, sourceAfterTransformation = "") => {
  if (target.fileNameForRollup) {
    return target.fileNameForRollup
  }

  target.sourceAfterTransformation = sourceAfterTransformation
  const precomputedFileNameForRollup = computeTargetFileNameForRollup(target)
  target.sourceAfterTransformation = undefined
  return precomputedFileNameForRollup
}

export const createCompositeAssetHandler = (
  { load, parse },
  {
    projectDirectoryUrl = "file:///",
    bundleDirectoryUrl = "file:///",
    loadReference = () => null,
    urlToOriginalProjectUrl = (url) => url,
    emitAsset,
    connectTarget = () => {},
    resolveTargetReference = (specifier, target) => resolveUrl(specifier, target.url),
  },
) => {
  const prepareAssetEntry = async (url, { fileNamePattern }) => {
    logger.debug(`prepare entry asset ${shortenUrl(url)}`)

    // we don't really know where this reference to that asset file comes from
    // we could almost say it's from the script calling this function
    // so we could analyse stack trace here to put this function caller
    // as the reference to this target file
    const callerLocation = getCallerLocation()
    const entryReference = createReference(callerLocation, {
      isEntry: true,
      isAsset: true,
      url,
      fileNamePattern,
    })

    await entryReference.target.getDependenciesReadyPromise()
    // start to wait internally for eventual chunks
    // but don't await here because this function will be awaited by rollup before starting
    // to parse chunks
    entryReference.target.getFileNameReadyPromise()
  }

  const targetMap = {}
  const createReference = (referenceData, targetData) => {
    const { url } = targetData

    if (url in targetMap) {
      const target = targetMap[url]
      const reference = { target, ...referenceData }
      target.references.push(reference)
      return [reference, target]
    }

    const target = createTarget(targetData)
    const reference = { target, ...referenceData }
    target.references.push(reference)
    targetMap[url] = target
    connectTarget(target)
    return reference
  }

  const assetTransformMap = {}
  const createTarget = ({
    url,
    isEntry = false,
    isAsset = false,
    isInline = false,
    source,
    sourceAfterTransformation,
    fileNamePattern,
    references = [],
  }) => {
    const target = {
      url,
      relativeUrl: urlToRelativeUrl(url, projectDirectoryUrl),
      isEntry,
      isAsset,
      isInline,
      source,
      sourceAfterTransformation,
      fileNamePattern,
      references,
    }

    const getSourceReadyPromise = memoize(async () => {
      const source = await load(url)
      target.source = source
    })
    if (source !== undefined) {
      getSourceReadyPromise.forceMemoization(source)
    }

    const getDependenciesReadyPromise = memoize(async () => {
      await getSourceReadyPromise()
      const dependencies = []

      let previousJsReference

      const notifyReferenceFound = ({
        isAsset,
        isInline,
        specifier,
        line,
        column,
        source,
        fileNamePattern,
      }) => {
        if (!isEntry && !isAsset) {
          // for now we can only emit a chunk from an entry file as visible in
          // https://rollupjs.org/guide/en/#thisemitfileemittedfile-emittedchunk--emittedasset--string
          // https://github.com/rollup/rollup/issues/2872
          logger.warn(
            `ignoring js reference found in an asset (it's only possible to reference js from entry asset)`,
          )
          return null
        }

        const dependencyTargetUrl = resolveTargetReference(target, specifier, { isAsset, isInline })
        const dependencyReference = createReference(
          { url: target.url, column, line, previousJsReference },
          { url: dependencyTargetUrl, isAsset, isInline, source, fileNamePattern },
        )
        if (dependencyReference.target.isConnected()) {
          dependencies.push(dependencyTargetUrl)
          if (!isAsset) {
            previousJsReference = dependencyReference
          }
        }
        logger.debug(formatReferenceFound(dependencyReference))
        return dependencyReference
      }

      const parseReturnValue = await parse(
        {
          ...target,
          url: urlToOriginalProjectUrl(url),
        },
        {
          notifyAssetFound: (data) =>
            notifyReferenceFound({
              isAsset: true,
              isInline: false,
              ...data,
            }),
          notifyInlineAssetFound: (data) =>
            notifyReferenceFound({
              isAsset: true,
              isInline: true,
              // inherit parent directory location because it's an inline asset
              fileNamePattern: () => {
                const importerFileNameForRollup = precomputeTargetFileNameForRollup(target)
                const importerParentRelativeUrl = urlToRelativeUrl(
                  urlToParentUrl(resolveUrl(importerFileNameForRollup, "file://")),
                  "file://",
                )
                return `${importerParentRelativeUrl}[name]-[hash][extname]`
              },
              ...data,
            }),
          notifyJsFound: (data) =>
            notifyReferenceFound({
              isAsset: false,
              isInline: false,
              ...data,
            }),
          notifyInlineJsFound: (data) =>
            notifyReferenceFound({
              isAsset: false,
              isInline: true,
              ...data,
            }),
        },
      )

      if (dependencies.length > 0 && typeof parseReturnValue !== "function") {
        throw new Error(
          `parse has dependencies, it must return a function but received ${parseReturnValue}`,
        )
      }
      if (typeof parseReturnValue === "function") {
        assetTransformMap[url] = parseReturnValue
      }
      if (dependencies.length) {
        logger.debug(
          `${shortenUrl(url)} dependencies collected -> ${dependencies.map((url) =>
            shortenUrl(url),
          )}`,
        )
      }

      target.dependencies = dependencies
    })

    const getFileNameReadyPromise = memoize(async () => {
      // la transformation d'un asset c'est avant tout la transformation de ses dépendances
      await getDependenciesReadyPromise()
      const dependencies = target.dependencies
      await Promise.all(
        dependencies.map(async (dependencyUrl) => {
          const dependencyTarget = targetMap[dependencyUrl]
          logger.debug(`${shortenUrl(url)} waiting for ${shortenUrl(dependencyUrl)} to be ready`)
          await dependencyTarget.getFileNameReadyPromise()
        }),
      )

      // une fois que les dépendances sont transformées on peut transformer cet asset
      if (!target.isAsset) {
        // ici l'url n'est pas top parce que
        // l'url de l'asset est relative au fichier html source
        logger.debug(`waiting for rollup chunk to be ready to resolve ${shortenUrl(url)}`)
        const rollupChunkReadyPromise = new Promise((resolve) => {
          registerCallbackOnceRollupChunkIsReady(target.url, resolve)
        })
        const { sourceAfterTransformation, fileNameForRollup } = await rollupChunkReadyPromise
        target.sourceAfterTransformation = sourceAfterTransformation
        target.fileNameForRollup = fileNameForRollup
        return
      }

      if (!assetTransformMap.hasOwnProperty(url)) {
        target.sourceAfterTransformation = target.source
        target.fileNameForRollup = computeTargetFileNameForRollup(target)
        return
      }

      const transform = assetTransformMap[url]
      // assetDependenciesMapping contains all dependencies for an asset
      // each key is the absolute url to the dependency file
      // each value is an url relative to the asset importing this dependency
      // it looks like this:
      // {
      //   "file:///project/coin.png": "./coin-45eiopri.png"
      // }
      // it must be used by transform to update url in the asset source
      const dependenciesMapping = {}
      // we don't yet know the exact importerFileNameForRollup but we can generate a fake one
      // to ensure we resolve dependency against where the importer file will be
      const importerFileNameForRollup = precomputeTargetFileNameForRollup(target)
      dependencies.forEach((dependencyUrl) => {
        const dependencyTarget = targetMap[dependencyUrl]
        // here it's guaranteed that dependencUrl is in urlMappings
        // because we throw in case there is circular deps
        // so each each dependency is handled one after an other
        // ensuring dependencies where already handled before
        const dependencyFileNameForRollup = dependencyTarget.fileNameForRollup
        const dependencyFileUrlForRollup = resolveUrl(dependencyFileNameForRollup, "file:///")
        const importerFileUrlForRollup = resolveUrl(importerFileNameForRollup, "file:///")
        dependenciesMapping[dependencyUrl] = urlToRelativeUrl(
          dependencyFileUrlForRollup,
          importerFileUrlForRollup,
        )
      })
      logger.debug(
        `${shortenUrl(url)} transform starts to replace ${JSON.stringify(
          dependenciesMapping,
          null,
          "  ",
        )}`,
      )
      const assetEmitters = []
      const transformReturnValue = await transform(dependenciesMapping, {
        precomputeFileNameForRollup: (sourceAfterTransformation) =>
          precomputeTargetFileNameForRollup(target, sourceAfterTransformation),
        registerAssetEmitter: (callback) => {
          assetEmitters.push(callback)
        },
      })
      if (transformReturnValue === null || transformReturnValue === undefined) {
        throw new Error(`transform must return an object {code, map}`)
      }

      let sourceAfterTransformation
      let fileNameForRollup
      if (typeof transformReturnValue === "string") {
        sourceAfterTransformation = transformReturnValue
      } else {
        sourceAfterTransformation = transformReturnValue.sourceAfterTransformation
        if (transformReturnValue.fileNameForRollup) {
          fileNameForRollup = transformReturnValue.fileNameForRollup
        }
      }

      target.sourceAfterTransformation = sourceAfterTransformation
      if (fileNameForRollup === undefined) {
        fileNameForRollup = computeTargetFileNameForRollup(target)
      }
      target.fileNameForRollup = fileNameForRollup

      assetEmitters.forEach((callback) => {
        const importerProjectUrl = target.url
        const importerBundleUrl = resolveUrl(fileNameForRollup, bundleDirectoryUrl)
        const { assetSource, assetUrl } = callback({
          importerProjectUrl,
          importerBundleUrl,
        })

        emitAsset({
          source: assetSource,
          fileName: urlToRelativeUrl(assetUrl, bundleDirectoryUrl),
        })
        logger.debug(`emit ${fileNameForRollup} asset emitted by ${fileNameForRollup}`)
      })
    })

    let connected = false
    const connect = memoize(async (connectFn) => {
      connected = true
      const { rollupReferenceId } = await connectFn()
      target.rollupReferenceId = rollupReferenceId
    })

    const getRollupReferenceIdReadyPromise = () => connect()

    Object.assign(target, {
      connect,
      isConnected: () => connected,
      createReference,

      getSourceReadyPromise,
      getDependenciesReadyPromise,
      getFileNameReadyPromise,
      getRollupReferenceIdReadyPromise,
    })

    return target
  }

  const rollupChunkReadyCallbackMap = {}
  const registerCallbackOnceRollupChunkIsReady = (url, callback) => {
    rollupChunkReadyCallbackMap[url] = callback
  }

  const resolveJsReferencesUsingRollupBundle = async (rollupBundle) => {
    Object.keys(rollupChunkReadyCallbackMap).forEach((key) => {
      const chunkName = Object.keys(rollupBundle).find(
        (bundleKey) => rollupBundle[bundleKey].facadeModuleId === key,
      )
      const chunk = rollupBundle[chunkName]
      logger.debug(`resolve rollup chunk ${shortenUrl(key)}`)
      rollupChunkReadyCallbackMap[key]({
        sourceAfterTransformation: chunk.code,
        fileNameForRollup: chunk.fileName,
      })
    })

    // wait html files to be emitted
    const urlToWait = Object.keys(targetMap).filter((url) => targetMap[url].isEntry)
    await Promise.all(urlToWait.map((url) => targetMap[url].getRollupReferenceIdReadyPromise()))
  }

  const generateJavaScriptForAssetImport = async (url, { source, importerUrl } = {}) => {
    const assetReference = createReference(
      // the reference to this target comes from importerUrl
      // but we don't really know the line and column
      // because rollup does not share this information
      {
        url: importerUrl,
        column: undefined,
        line: undefined,
      },
      {
        url,
        isAsset: true,
        source,
      },
    )

    logger.debug(formatReferenceFound(assetReference))

    if (!assetReference.target.isConnected()) {
      throw new Error(`target is not connected ${url}`)
    }
    await assetReference.target.getRollupReferenceIdReadyPromise()
    const { rollupReferenceId } = assetReference.target
    return `export default import.meta.ROLLUP_FILE_URL_${rollupReferenceId};`
  }

  const shortenUrl = (url) => {
    return urlIsInsideOf(url, projectDirectoryUrl)
      ? urlToRelativeUrl(url, projectDirectoryUrl)
      : url
  }

  const showReferenceSourceLocation = (reference) => {
    const referenceUrl = reference.url
    const referenceSource = String(
      referenceUrl in targetMap ? targetMap[referenceUrl].source : loadReference(referenceUrl),
    )

    const message = `${urlToOriginalProjectUrl(referenceUrl)}:${reference.line}:${reference.column}`

    if (referenceSource) {
      return `${message}

${showSourceLocation(referenceSource, {
  line: reference.line,
  column: reference.column,
})}`
    }

    return `${message}`
  }

  const formatReferenceFound = (reference) => {
    const { target } = reference
    const targetUrl = shortenUrl(target.url)

    let message
    if (target.isInline && target.isAsset) {
      message = `found inline asset.`
    } else if (target.isInline) {
      message = `found inline js.`
    } else if (target.isAsset) {
      message = `found asset reference to ${targetUrl}.`
    } else {
      message = `found js reference to ${targetUrl}.`
    }

    message += `
${showReferenceSourceLocation(reference)}
`

    if (reference.target.isConnected()) {
      return message
    }
    return `${message} -> ignored because url is external`
  }

  return {
    prepareAssetEntry,
    resolveJsReferencesUsingRollupBundle,
    generateJavaScriptForAssetImport,

    showReferenceSourceLocation,
    inspect: () => {
      return {
        targetMap,
      }
    },
  }
}

const memoize = (fn) => {
  let called
  let previousCallReturnValue
  const memoized = (...args) => {
    if (called) return previousCallReturnValue
    previousCallReturnValue = fn(...args)
    called = true
    return previousCallReturnValue
  }
  memoized.forceMemoization = (value) => {
    called = true
    previousCallReturnValue = value
  }
  return memoized
}

const getCallerLocation = () => {
  const { prepareStackTrace } = Error
  Error.prepareStackTrace = (error, stack) => {
    Error.prepareStackTrace = prepareStackTrace
    return stack
  }

  const { stack } = new Error()
  const callerCallsite = stack[2]
  const fileName = callerCallsite.getFileName()
  return {
    url: fileName && isFileSystemPath(fileName) ? fileSystemPathToUrl(fileName) : fileName,
    line: callerCallsite.getLineNumber(),
    column: callerCallsite.getColumnNumber(),
  }
}
