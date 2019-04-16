import { resolve } from "path"
import { fileRead, fileStat } from "@dmail/helper"
import { createETag } from "../../createETag.js"
import { dateToSecondsPrecision } from "../../dateHelper.js"
import { getCompiledFilename, getAssetFilename } from "./locaters.js"

export const validateCache = async ({
  projectFolder,
  filenameRelative,
  cache,
  ifEtagMatch,
  ifModifiedSinceDate,
}) => {
  const compiledFileValidation = await validateCompiledFile({
    projectFolder,
    filenameRelative,
    ifEtagMatch,
    ifModifiedSinceDate,
  })
  if (!compiledFileValidation.valid) return compiledFileValidation

  const [sourcesValidations, assetValidations] = await Promise.all([
    validateSources({ projectFolder, cache }),
    validateAssets({ projectFolder, filenameRelative, cache }),
  ])

  const invalidSourceValidation = sourcesValidations.find(({ valid }) => !valid)
  if (invalidSourceValidation) return invalidSourceValidation

  const invalidAssetValidation = assetValidations.find(({ valid }) => !valid)
  if (invalidAssetValidation) return invalidAssetValidation

  const compiledSource = compiledFileValidation.compiledSource
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
  projectFolder,
  filenameRelative,
  ifEtagMatch,
  ifModifiedSinceDate,
}) => {
  const compiledFilename = getCompiledFilename({
    projectFolder,
    filenameRelative,
  })

  try {
    const compiledSource = await fileRead(compiledFilename)

    if (ifEtagMatch) {
      const compiledEtag = createETag(compiledSource)
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

const validateSources = ({ projectFolder, cache }) =>
  Promise.all(
    cache.sources.map((source, index) =>
      validateSource({
        projectFolder,
        source,
        eTag: cache.sourcesEtag[index],
      }),
    ),
  )

const validateSource = async ({ projectFolder, source, eTag }) => {
  const sourceFilename = resolve(projectFolder, source)
  const sourceContent = await fileRead(sourceFilename)
  const sourceETag = createETag(source)

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
}

const validateAssets = ({ projectFolder, filenameRelative, cache }) =>
  Promise.all(
    cache.assets.map((asset, index) =>
      validateAsset({
        projectFolder,
        filenameRelative,
        asset,
        eTag: cache.assetsEtag[index],
      }),
    ),
  )

const validateAsset = async ({ projectFolder, filenameRelative, asset, eTag }) => {
  const assetFilename = getAssetFilename({
    projectFolder,
    filenameRelative,
    asset,
  })

  try {
    const assetContent = await fileRead(assetFilename)
    const assetContentETag = createETag(assetContent)

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
