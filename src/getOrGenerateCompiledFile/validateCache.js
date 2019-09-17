import { fileRead, fileStat } from "@dmail/helper"
import { pathnameToOperatingSystemPath } from "@jsenv/operating-system-path"
import { dateToSecondsPrecision } from "./dateToSecondsPrecision.js"
import { getCompiledFilePath, getAssetFilePath } from "./locaters.js"

const { bufferToEtag } = import.meta.require("@dmail/server")

export const validateCache = async ({
  projectPathname,
  compileCacheFolderRelativePath,
  compileRelativePath,
  cache,
  ifEtagMatch,
  ifModifiedSinceDate,
}) => {
  const compiledFileValidation = await validateCompiledFile({
    projectPathname,
    compileCacheFolderRelativePath,
    compileRelativePath,
    ifEtagMatch,
    ifModifiedSinceDate,
  })
  if (!compiledFileValidation.valid) return compiledFileValidation

  const [sourcesValidations, assetValidations] = await Promise.all([
    validateSources({ projectPathname, cache }),
    validateAssets({ projectPathname, compileCacheFolderRelativePath, compileRelativePath, cache }),
  ])

  const invalidSourceValidation = sourcesValidations.find(({ valid }) => !valid)
  if (invalidSourceValidation) return invalidSourceValidation

  const invalidAssetValidation = assetValidations.find(({ valid }) => !valid)
  if (invalidAssetValidation) return invalidAssetValidation

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

const validateCompiledFile = async ({
  projectPathname,
  compileCacheFolderRelativePath,
  compileRelativePath,
  ifEtagMatch,
  ifModifiedSinceDate,
}) => {
  const compiledFilename = getCompiledFilePath({
    projectPathname,
    compileCacheFolderRelativePath,
    compileRelativePath,
  })

  try {
    const compiledSource = await fileRead(compiledFilename)

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
      const compiledMtime = await fileStat(compiledFilename)
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
        data: { compiledFilename },
      }
    }
    return Promise.reject(error)
  }
}

const validateSources = ({ projectPathname, cache }) =>
  Promise.all(
    cache.sources.map((source, index) =>
      validateSource({
        projectPathname,
        source,
        eTag: cache.sourcesEtag[index],
      }),
    ),
  )

const validateSource = async ({ projectPathname, source, eTag }) => {
  const sourceFilename = pathnameToOperatingSystemPath(`${projectPathname}${source}`)

  try {
    const sourceContent = await fileRead(sourceFilename)
    const sourceETag = bufferToEtag(Buffer.from(sourceContent))

    if (sourceETag !== eTag) {
      return {
        code: "SOURCE_ETAG_MISMATCH",
        valid: false,
        data: { source, sourceFilename, sourceContent },
      }
    }

    return {
      valid: true,
      data: { sourceContent },
    }
  } catch (e) {
    if (e && e.code === "ENOENT") {
      // TODO: decide if it should invalidate cache or not
      // I think if the source cannot be found it does not invalidate the cache
      // it means something is missing to absolutely sure the cache is valid
      // but does not necessarily means the cache is invalid
      // but if we allow source file not found
      // it means we must remove sources from the list of sources
      // or at least consider as normal that it's missing
      // in that case, inside updateCache we must not search for sources that
      // are missing, nor put their etag
      // or we could return sourceContent: '', and the etag would be empty
      return {
        code: "SOURCE_NOT_FOUND",
        valid: true,
        data: { source, sourceFilename, sourceContent: "" },
      }
    }
    throw e
  }
}

const validateAssets = ({
  projectPathname,
  compileCacheFolderRelativePath,
  compileRelativePath,
  cache,
}) =>
  Promise.all(
    cache.assets.map((asset, index) =>
      validateAsset({
        projectPathname,
        compileCacheFolderRelativePath,
        compileRelativePath,
        asset,
        eTag: cache.assetsEtag[index],
      }),
    ),
  )

const validateAsset = async ({
  projectPathname,
  compileCacheFolderRelativePath,
  compileRelativePath,
  asset,
  eTag,
}) => {
  const assetFilename = getAssetFilePath({
    projectPathname,
    compileCacheFolderRelativePath,
    compileRelativePath,
    asset,
  })

  try {
    const assetContent = await fileRead(assetFilename)
    const assetContentETag = bufferToEtag(Buffer.from(assetContent))

    if (eTag !== assetContentETag) {
      return {
        code: "ASSET_ETAG_MISMATCH",
        valid: false,
        data: { asset, assetFilename, assetContent, assetContentETag },
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
        data: { asset, assetFilename },
      }
    }
    return Promise.reject(error)
  }
}
