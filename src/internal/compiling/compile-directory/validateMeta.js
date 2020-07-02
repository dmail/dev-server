import {
  urlToFileSystemPath,
  readFile,
  readFileSystemNodeModificationTime,
  bufferToEtag,
} from "@jsenv/util"
import { resolveAssetFileUrl, resolveSourceFileUrl } from "./locaters.js"

export const validateMeta = async ({
  logger,
  meta,
  compiledFileUrl,
  ifEtagMatch,
  ifModifiedSinceDate,
  compileCacheSourcesValidation = true,
  compileCacheAssetsValidation = true,
}) => {
  const compiledFileValidation = await validateCompiledFile({
    compiledFileUrl,
    ifEtagMatch,
    ifModifiedSinceDate,
  })
  if (!compiledFileValidation.valid) {
    logger.debug(
      `${urlToFileSystemPath(compiledFileUrl)} modified (${compiledFileValidation.code})`,
    )
    return compiledFileValidation
  }
  logger.debug(`${urlToFileSystemPath(compiledFileUrl)} not modified`)

  if (meta.sources.length === 0) {
    logger.warn(`meta.sources is empty, cache considered as invalid by precaution`)
    return {
      code: "SOURCES_EMPTY",
      valid: false,
    }
  }

  const [sourcesValidations, assetValidations] = await Promise.all([
    compileCacheSourcesValidation
      ? validateSources({
          meta,
          compiledFileUrl,
        })
      : [],
    compileCacheAssetsValidation
      ? validateAssets({
          meta,
          compiledFileUrl,
        })
      : [],
  ])
  const invalidSourceValidation = sourcesValidations.find(({ valid }) => !valid)
  if (invalidSourceValidation) {
    logger.debug(
      `${urlToFileSystemPath(invalidSourceValidation.data.sourceFileUrl)} source modified (${
        invalidSourceValidation.code
      })`,
    )
    return invalidSourceValidation
  }
  const invalidAssetValidation = assetValidations.find(({ valid }) => !valid)
  if (invalidAssetValidation) {
    logger.debug(
      `${urlToFileSystemPath(invalidAssetValidation.data.assetFileUrl)} asset modified (${
        invalidAssetValidation.code
      })`,
    )
    return invalidAssetValidation
  }
  logger.debug(`${urlToFileSystemPath(compiledFileUrl)} cache is valid`)

  const compiledSource = compiledFileValidation.data.compiledSource
  const sourcesContent = sourcesValidations.map(({ data }) => data.sourceContent)
  const assetsContent = assetValidations.find(({ data }) => data.assetContent)

  return {
    valid: true,
    data: {
      compiledSource,
      sourcesContent,
      assetsContent,
    },
  }
}

const validateCompiledFile = async ({ compiledFileUrl, ifEtagMatch, ifModifiedSinceDate }) => {
  try {
    const compiledSource = await readFile(compiledFileUrl)

    if (ifEtagMatch) {
      const compiledEtag = bufferToEtag(Buffer.from(compiledSource))
      if (ifEtagMatch !== compiledEtag) {
        return {
          code: "COMPILED_FILE_ETAG_MISMATCH",
          valid: false,
          data: { compiledSource, compiledEtag },
        }
      }
    }

    if (ifModifiedSinceDate) {
      const compiledMtime = await readFileSystemNodeModificationTime(compiledFileUrl)
      if (ifModifiedSinceDate < dateToSecondsPrecision(compiledMtime)) {
        return {
          code: "COMPILED_FILE_MTIME_OUTDATED",
          valid: false,
          data: { compiledSource, compiledMtime },
        }
      }
    }

    return {
      valid: true,
      data: { compiledSource },
    }
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return {
        code: "COMPILED_FILE_NOT_FOUND",
        valid: false,
        data: { compiledFileUrl },
      }
    }
    return Promise.reject(error)
  }
}

const validateSources = ({ meta, compiledFileUrl }) => {
  return Promise.all(
    meta.sources.map((source, index) =>
      validateSource({
        compiledFileUrl,
        source,
        eTag: meta.sourcesEtag[index],
      }),
    ),
  )
}

const validateSource = async ({ compiledFileUrl, source, eTag }) => {
  const sourceFileUrl = resolveSourceFileUrl({
    source,
    compiledFileUrl,
  })

  try {
    const sourceContent = await readFile(sourceFileUrl)
    const sourceETag = bufferToEtag(Buffer.from(sourceContent))

    if (sourceETag !== eTag) {
      return {
        code: "SOURCE_ETAG_MISMATCH",
        valid: false,
        data: {
          source,
          sourceFileUrl,
          sourceContent,
        },
      }
    }

    return {
      valid: true,
      data: { sourceContent },
    }
  } catch (e) {
    if (e && e.code === "ENOENT") {
      // missing source invalidates the cache because
      // we cannot check its validity
      // HOWEVER inside writeMeta we will check if a source can be found
      // when it cannot we will not put it as a dependency
      // to invalidate the cache.
      // It is important because some files are constructed on other files
      // which are not truly on the filesystem
      // (IN theory the above happens only for convertCommonJsWithRollup because jsenv
      // always have a concrete file especially to avoid that kind of thing)
      return {
        code: "SOURCE_NOT_FOUND",
        valid: false,
        data: {
          source,
          sourceFileUrl,
          sourceContent: "",
        },
      }
    }
    throw e
  }
}

const validateAssets = ({ compiledFileUrl, meta }) =>
  Promise.all(
    meta.assets.map((asset, index) =>
      validateAsset({
        asset,
        compiledFileUrl,
        eTag: meta.assetsEtag[index],
      }),
    ),
  )

const validateAsset = async ({ asset, compiledFileUrl, eTag }) => {
  const assetFileUrl = resolveAssetFileUrl({
    compiledFileUrl,
    asset,
  })

  try {
    const assetContent = await readFile(assetFileUrl)
    const assetContentETag = bufferToEtag(Buffer.from(assetContent))

    if (eTag !== assetContentETag) {
      return {
        code: "ASSET_ETAG_MISMATCH",
        valid: false,
        data: { asset, assetFileUrl, assetContent, assetContentETag },
      }
    }

    return {
      valid: true,
      data: { assetContent, assetContentETag },
    }
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return {
        code: "ASSET_FILE_NOT_FOUND",
        valid: false,
        data: { asset, assetFileUrl },
      }
    }
    return Promise.reject(error)
  }
}

const dateToSecondsPrecision = (date) => {
  const dateWithSecondsPrecision = new Date(date)
  dateWithSecondsPrecision.setMilliseconds(0)
  return dateWithSecondsPrecision
}
