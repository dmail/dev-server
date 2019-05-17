import { fileRead, fileStat } from "@dmail/helper"
import { createETag } from "../createETag.js"
import { dateToSecondsPrecision } from "../dateHelper.js"
import { getCompiledFilename, getAssetFilename } from "./locaters.js"
import { pathnameToOperatingSystemFilename } from "../operating-system-filename.js"

export const validateCache = async ({
  projectPathname,
  compileRelativePath,
  cache,
  ifEtagMatch,
  ifModifiedSinceDate,
}) => {
  const compiledFileValidation = await validateCompiledFile({
    projectPathname,
    compileRelativePath,
    ifEtagMatch,
    ifModifiedSinceDate,
  })
  if (!compiledFileValidation.valid) return compiledFileValidation

  const [sourcesValidations, assetValidations] = await Promise.all([
    validateSources({ projectPathname, cache }),
    validateAssets({ projectPathname, compileRelativePath, cache }),
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
  compileRelativePath,
  ifEtagMatch,
  ifModifiedSinceDate,
}) => {
  const compiledFilename = getCompiledFilename({
    projectPathname,
    compileRelativePath,
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
  const sourceFilename = pathnameToOperatingSystemFilename(`${projectPathname}${source}`)

  try {
    const sourceContent = await fileRead(sourceFilename)
    const sourceETag = createETag(sourceContent)

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
      return {
        code: "SOURCE_NOT_FOUND",
        valid: false,
        data: { source, sourceFilename },
      }
    }
    throw e
  }
}

const validateAssets = ({ projectPathname, compileRelativePath, cache }) =>
  Promise.all(
    cache.assets.map((asset, index) =>
      validateAsset({
        projectPathname,
        compileRelativePath,
        asset,
        eTag: cache.assetsEtag[index],
      }),
    ),
  )

const validateAsset = async ({ projectPathname, compileRelativePath, asset, eTag }) => {
  const assetFilename = getAssetFilename({
    projectPathname,
    compileRelativePath,
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
