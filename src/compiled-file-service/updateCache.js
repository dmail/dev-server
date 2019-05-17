import { fileWrite } from "@dmail/helper"
import { createETag } from "../createETag.js"
import { getCacheFilename, getAssetFilename, getCompiledFilename } from "./locaters.js"

export const updateCache = ({
  projectPathname,
  sourceRelativePath,
  compileRelativePath,
  cacheHitTracking,
  cache,
  compileResult,
  compileResultStatus,
}) => {
  const isNew = compileResultStatus === "created"
  const isUpdated = compileResultStatus === "updated"
  const isCached = compileResultStatus === "cached"
  const {
    compiledSource,
    contentType,
    sources,
    sourcesContent,
    assets,
    assetsContent,
  } = compileResult
  const promises = []

  if (isNew || isUpdated) {
    const { writeCompiledSourceFile = true, writeAssetsFile = true } = compileResult
    const compiledFilename = getCompiledFilename({
      projectPathname,
      compileRelativePath,
    })

    if (writeCompiledSourceFile) {
      promises.push(fileWrite(compiledFilename, compiledSource))
    }

    if (writeAssetsFile) {
      promises.push(
        ...assets.map((asset, index) => {
          const assetFilename = getAssetFilename({
            projectPathname,
            compileRelativePath,
            asset,
          })

          return fileWrite(assetFilename, assetsContent[index])
        }),
      )
    }
  }

  if (isNew || isUpdated || (isCached && cacheHitTracking)) {
    if (isNew) {
      cache = {
        sourceRelativePath,
        contentType,
        sources,
        sourcesEtag: sourcesContent.map((sourceContent) => createETag(sourceContent)),
        assets,
        assetsEtag: assetsContent.map((assetContent) => createETag(assetContent)),
        createdMs: Number(Date.now()),
        lastModifiedMs: Number(Date.now()),
        ...(cacheHitTracking
          ? {
              matchCount: 1,
              lastMatchMs: Number(Date.now()),
            }
          : {}),
      }
    } else if (isUpdated) {
      cache = {
        ...cache,
        sources,
        sourcesEtag: sourcesContent.map((sourceContent) => createETag(sourceContent)),
        assets,
        assetsEtag: assetsContent.map((assetContent) => createETag(assetContent)),
        lastModifiedMs: Number(Date.now()),
        ...(cacheHitTracking
          ? {
              matchCount: cache.matchCount + 1,
              lastMatchMs: Number(Date.now()),
            }
          : {}),
      }
    } else {
      cache = {
        ...cache,
        ...(cacheHitTracking
          ? {
              matchCount: cache.matchCount + 1,
              lastMatchMs: Number(Date.now()),
            }
          : {}),
      }
    }

    const cacheFilename = getCacheFilename({
      projectPathname,
      compileRelativePath,
    })

    promises.push(fileWrite(cacheFilename, JSON.stringify(cache, null, "  ")))
  }

  return Promise.all(promises)
}
