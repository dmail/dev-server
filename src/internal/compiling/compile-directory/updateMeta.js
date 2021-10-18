import {
  urlToRelativeUrl,
  urlToFileSystemPath,
  bufferToEtag,
} from "@jsenv/filesystem"
import { createDetailedMessage } from "@jsenv/logger"

import { setFileIdleCallback } from "./file_idle.js"
import { writeFileContent, testFilePresence } from "./fs-optimized-for-cache.js"
import { getMetaJsonFileUrl } from "./compile-asset.js"

export const updateMeta = ({
  logger,
  meta,
  compiledFileUrl,
  cacheHitTracking,
  compileResult,
  compileResultStatus,
}) => {
  setFileIdleCallback(compiledFileUrl, async () => {
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
      // ensure source that does not leads to concrete files are not capable to invalidate the cache
      const sourcesToRemove = []
      sources.forEach((sourceFileUrl) => {
        const sourceFileExists = testFilePresence(sourceFileUrl)
        if (sourceFileExists) {
          return
        }

        sourcesToRemove.push(sourceFileUrl)
      })
      const sourceNotFoundCount = sourcesToRemove.length
      if (sourceNotFoundCount > 0) {
        logger.warn(
          createDetailedMessage(
            `SOURCE_META_NOT_FOUND: ${sourceNotFoundCount} source file(s) not found`,
            {
              "consequence": `cache will be reused even if one of the source file is modified`,
              "source files not found": sourcesToRemove.join(`\n`),
            },
          ),
        )
        sourcesToRemove.forEach((url) => {
          const sourceIndex = sources.indexOf(url)
          if (sourceIndex) {
            sources.splice(sourceIndex, 1)
            sourcesContent.splice(sourceIndex, 1)
          }
        })
      }

      const { writeCompiledSourceFile = true, writeAssetsFile = true } =
        compileResult

      if (writeCompiledSourceFile) {
        logger.debug(
          `write compiled file at ${urlToFileSystemPath(compiledFileUrl)}`,
        )
        promises.push(
          writeFileContent(compiledFileUrl, compiledSource, {
            fileLikelyNotFound: isNew,
          }),
        )
      }

      if (writeAssetsFile) {
        promises.push(
          ...assets.map((assetFileUrl, index) => {
            logger.debug(
              `write compiled file asset at ${urlToFileSystemPath(
                assetFileUrl,
              )}`,
            )
            return writeFileContent(assetFileUrl, assetsContent[index], {
              fileLikelyNotFound: isNew,
            })
          }),
        )
      }
    }

    const metaJsonFileUrl = getMetaJsonFileUrl(compiledFileUrl)

    if (isNew || isUpdated || (isCached && cacheHitTracking)) {
      let latestMeta

      const sourceAndAssetProps = {
        sources: sources.map((source) =>
          urlToRelativeUrl(source, metaJsonFileUrl),
        ),
        sourcesEtag: sourcesContent.map((sourceContent) =>
          bufferToEtag(Buffer.from(sourceContent)),
        ),
        assets: assets.map((asset) => urlToRelativeUrl(asset, metaJsonFileUrl)),
        assetsEtag: assetsContent.map((assetContent) =>
          bufferToEtag(Buffer.from(assetContent)),
        ),
      }

      if (isNew) {
        latestMeta = {
          contentType,
          ...sourceAndAssetProps,
          createdMs: Number(Date.now()),
          lastModifiedMs: Number(Date.now()),
        }
      } else if (isUpdated) {
        latestMeta = {
          ...meta,
          ...sourceAndAssetProps,
          lastModifiedMs: Number(Date.now()),
        }
      } else {
        latestMeta = {
          ...meta,
        }
      }

      if (cacheHitTracking) {
        latestMeta = {
          ...latestMeta,
          matchCount: 1,
          lastMatchMs: Number(Date.now()),
        }
      }

      logger.debug(
        `write compiled file meta at ${urlToFileSystemPath(metaJsonFileUrl)}`,
      )
      promises.push(
        writeFileContent(
          metaJsonFileUrl,
          JSON.stringify(latestMeta, null, "  "),
          {
            fileLikelyNotFound: isNew,
          },
        ),
      )
    }

    await Promise.all(promises)
  })
}
