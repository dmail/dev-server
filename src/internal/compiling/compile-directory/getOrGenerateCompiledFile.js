import { urlToFileSystemPath } from "@jsenv/filesystem"
import { createDetailedMessage } from "@jsenv/logger"
import { timeStart, timeFunction } from "@jsenv/server"
import { readFileContent } from "./fs-optimized-for-cache.js"
import { validateCache } from "./validateCache.js"
import { updateMeta } from "./updateMeta.js"
import { getMetaJsonFileUrl } from "./compile-asset.js"
import { createLockRegistry } from "./createLockRegistry.js"

const { lockForRessource } = createLockRegistry()

export const getOrGenerateCompiledFile = async ({
  logger,

  projectDirectoryUrl,
  originalFileUrl,
  compiledFileUrl = originalFileUrl,
  writeOnFilesystem,
  useFilesystemAsCache,
  compileCacheSourcesValidation,
  compileCacheAssetsValidation,
  fileContentFallback,
  ifEtagMatch,
  ifModifiedSinceDate,
  compile,
}) => {
  if (typeof projectDirectoryUrl !== "string") {
    throw new TypeError(
      `projectDirectoryUrl must be a string, got ${projectDirectoryUrl}`,
    )
  }
  if (typeof originalFileUrl !== "string") {
    throw new TypeError(
      `originalFileUrl must be a string, got ${originalFileUrl}`,
    )
  }
  if (!originalFileUrl.startsWith(projectDirectoryUrl)) {
    throw new Error(
      createDetailedMessage(`origin file must be inside project`, {
        ["original file url"]: originalFileUrl,
        ["project directory url"]: projectDirectoryUrl,
      }),
    )
  }
  if (typeof compiledFileUrl !== "string") {
    throw new TypeError(
      `compiledFileUrl must be a string, got ${compiledFileUrl}`,
    )
  }
  if (!compiledFileUrl.startsWith(projectDirectoryUrl)) {
    throw new Error(
      createDetailedMessage(`compiled file must be inside project`, {
        ["compiled file url"]: compiledFileUrl,
        ["project directory url"]: projectDirectoryUrl,
      }),
    )
  }
  if (typeof compile !== "function") {
    throw new TypeError(`compile must be a function, got ${compile}`)
  }

  const lockTimeEnd = timeStart("lock")
  return startAsap(
    async () => {
      const lockTiming = lockTimeEnd()
      const { meta, compileResult, compileResultStatus, timing } =
        await computeCompileReport({
          originalFileUrl,
          compiledFileUrl,
          compile,
          fileContentFallback,
          ifEtagMatch,
          ifModifiedSinceDate,
          useFilesystemAsCache,
          compileCacheSourcesValidation,
          compileCacheAssetsValidation,
          logger,
        })

      let cacheWriteTiming = {}
      if (
        (compileResultStatus === "created" ||
          compileResultStatus === "updated") &&
        writeOnFilesystem
      ) {
        const result = await timeFunction("cache write", () =>
          updateMeta({
            logger,
            meta,
            compileResult,
            compileResultStatus,
            compiledFileUrl,
            // originalFileUrl,
          }),
        )
        cacheWriteTiming = result[0]
      }

      return {
        meta,
        compileResult,
        compileResultStatus,
        timing: {
          ...lockTiming,
          ...timing,
          ...cacheWriteTiming,
        },
      }
    },
    {
      compiledFileUrl,
      logger,
    },
  )
}

const computeCompileReport = async ({
  originalFileUrl,
  compiledFileUrl,
  compile,
  fileContentFallback,
  ifEtagMatch,
  ifModifiedSinceDate,
  useFilesystemAsCache,
  compileCacheSourcesValidation,
  compileCacheAssetsValidation,
  logger,
}) => {
  const [readCacheTiming, cacheValidity] = await timeFunction(
    "read cache",
    () => {
      if (!useFilesystemAsCache) {
        return {
          isValid: false,
          code: "META_FILE_NOT_FOUND",
          meta: {
            isValid: false,
            code: "META_FILE_NOT_FOUND",
          },
        }
      }
      return validateCache({
        logger,
        useFilesystemAsCache,
        compiledFileUrl,
        ifEtagMatch,
        ifModifiedSinceDate,
        compileCacheSourcesValidation,
        compileCacheAssetsValidation,
      })
    },
  )

  if (!cacheValidity.isValid) {
    if (cacheValidity.code === "SOURCES_EMPTY") {
      logger.warn(`WARNING: meta.sources is empty for ${compiledFileUrl}`)
    }

    const metaIsValid = cacheValidity.meta.isValid

    const [compileTiming, compileResult] = await timeFunction("compile", () =>
      callCompile({
        logger,
        originalFileUrl,
        fileContentFallback,
        compile,
      }),
    )

    return {
      meta: metaIsValid ? cacheValidity.meta.data : null,
      compileResult,
      compileResultStatus: metaIsValid ? "updated" : "created",
      timing: {
        ...readCacheTiming,
        ...compileTiming,
      },
    }
  }

  const meta = cacheValidity.meta.data
  const { contentType, sources, assets } = meta
  return {
    meta,
    compileResult: {
      compiledEtag: cacheValidity.compiledFile.data.compiledEtag,
      compiledMtime: cacheValidity.compiledFile.data.compiledMtime,
      contentType,
      sources,
      assets,
    },
    compileResultStatus: "cached",
    timing: {
      ...readCacheTiming,
    },
  }
}

const callCompile = async ({
  logger,
  originalFileUrl,
  fileContentFallback,
  compile,
}) => {
  logger.debug(`compile ${originalFileUrl}`)

  const codeBeforeCompile =
    compile.length === 0
      ? ""
      : await getCodeToCompile({ originalFileUrl, fileContentFallback })

  const compileReturnValue = await compile({
    code: codeBeforeCompile,
    map: undefined,
  })
  if (typeof compileReturnValue !== "object" || compileReturnValue === null) {
    throw new TypeError(
      `compile must return an object, got ${compileReturnValue}`,
    )
  }
  const {
    contentType,
    compiledSource,
    sources = [],
    sourcesContent = [],
    assets = [],
    assetsContent = [],
  } = compileReturnValue
  if (typeof contentType !== "string") {
    throw new TypeError(
      `compile must return a contentType string, got ${contentType}`,
    )
  }
  if (typeof compiledSource !== "string") {
    throw new TypeError(
      `compile must return a compiledSource string, got ${compiledSource}`,
    )
  }

  return {
    contentType,
    compiledSource,
    sources,
    sourcesContent,
    assets,
    assetsContent,
  }
}

const getCodeToCompile = async ({ originalFileUrl, fileContentFallback }) => {
  let fileContent
  if (fileContentFallback) {
    try {
      fileContent = await readFileContent(originalFileUrl)
    } catch (e) {
      if (e.code === "ENOENT") {
        fileContent = await fileContentFallback()
      } else {
        throw e
      }
    }
  } else {
    fileContent = await readFileContent(originalFileUrl)
  }
  return fileContent
}

const startAsap = async (fn, { logger, compiledFileUrl }) => {
  const metaJsonFileUrl = getMetaJsonFileUrl(compiledFileUrl)
  const metaJsonFilePath = urlToFileSystemPath(metaJsonFileUrl)

  logger.debug(`lock ${metaJsonFilePath}`)
  // in case this process try to concurrently access meta we wait for previous to be done
  const unlockLocal = await lockForRessource(metaJsonFilePath)

  let unlockInterProcessLock = () => {}

  try {
    return await fn()
  } finally {
    // we want to unlock in case of error too
    logger.debug(`unlock ${metaJsonFilePath}`)
    unlockLocal()
    unlockInterProcessLock()
  }
}
