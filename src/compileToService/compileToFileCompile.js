/* eslint-disable import/max-dependencies */
import cuid from "cuid"
import { createETag, isFileNotFoundError, removeFolderDeep } from "./helpers.js"
import { locateFile } from "./locateFile.js"
import { readFile } from "./readFile.js"
import { lockForRessource } from "./ressourceRegistry.js"
import { writeFileFromString } from "@dmail/project-structure-compile-babel"
import {
  getCacheDataLocation,
  getOutputRelativeLocation,
  getBranchLocation,
  getOutputLocation,
  getOutputAssetLocation,
  getSourceAbstractLocation,
} from "./locaters.js"

const readBranchMain = ({
  root,
  cacheFolder,
  compileFolder,
  file,
  inputLocation,
  inputETagClient,
  cache,
  branch,
}) => {
  return readFile({ location: inputLocation }).then(({ content }) => {
    const inputETag = createETag(content)

    return Promise.resolve()
      .then(() => {
        // faudra pouvoir désactiver ce check lorsqu'on veut juste connaitre l'état du cache
        if (inputETagClient) {
          if (inputETag !== inputETagClient) {
            return {
              status: `eTag modified on ${inputLocation} since it was cached by client`,
              inputETagClient,
            }
          }
          return { status: "valid" }
        }

        const inputETagCached = cache.inputETag
        if (inputETag !== inputETagCached) {
          return {
            status: `eTag modified on ${inputLocation} since it was cached on filesystem`,
            inputETagCached,
          }
        }

        const outputLocation = getOutputLocation({
          root,
          cacheFolder,
          compileFolder,
          file,
          branch,
        })
        return readFile({
          location: outputLocation,
          errorHandler: isFileNotFoundError,
        }).then(({ content, error }) => {
          if (error) {
            return {
              status: `cache not found at ${outputLocation}`,
            }
          }
          return { status: "valid", output: content }
        })
      })
      .then((moreData) => {
        return {
          input: content,
          inputETag,
          ...moreData,
        }
      })
  })
}

const readBranchAsset = ({ root, cacheFolder, compileFolder, file, cache, branch, asset }) => {
  const outputAssetLocation = getOutputAssetLocation({
    root,
    cacheFolder,
    compileFolder,
    file,
    branch,
    asset,
  })
  const name = asset.name

  return readFile({
    location: outputAssetLocation,
    errorHandler: isFileNotFoundError,
  }).then(({ content, error }) => {
    if (error) {
      return {
        status: `asset file not found ${outputAssetLocation}`,
        name,
      }
    }

    const actual = createETag(content)
    const expected = asset.eTag
    if (actual !== expected) {
      return {
        status: `unexpected ${asset.name} asset for ${cache.file}: unexpected eTag`,
        name,
        content,
      }
    }
    return {
      status: "valid",
      name,
      content,
    }
  })
}

const readBranch = ({
  root,
  cacheFolder,
  compileFolder,
  file,
  inputLocation,
  inputETagClient,
  cache,
  branch,
}) => {
  return Promise.all([
    readBranchMain({
      root,
      cacheFolder,
      compileFolder,
      file,
      inputLocation,
      inputETagClient,
      cache,
      branch,
    }),
    ...branch.outputAssets.map((outputAsset) => {
      return readBranchAsset({
        root,
        cacheFolder,
        compileFolder,
        file,
        cache,
        branch,
        asset: outputAsset,
      })
    }),
  ]).then(([mainData, ...assetsData]) => {
    const { status, input, inputETag, output } = mainData

    let computedStatus
    if (status === "valid") {
      const invalidAsset = assetsData.find((assetData) => assetData.status !== "valid")
      computedStatus = invalidAsset ? invalidAsset.status : "valid"
    } else {
      computedStatus = status
    }

    return {
      status: computedStatus,
      input,
      inputETag,
      output,
      outputAssets: assetsData,
    }
  })
}

const createCacheCorruptionError = (message) => {
  const error = new Error(message)
  error.code = "CACHE_CORRUPTION_ERROR"
  return error
}

const getFileBranch = ({ compile, root, cacheFolder, compileFolder, file, ...rest }) => {
  const cacheDataLocation = getCacheDataLocation({
    root,
    cacheFolder,
    compileFolder,
    file,
  })

  return Promise.all([
    locateFile(file, root),
    readFile({
      location: cacheDataLocation,
      errorHandler: isFileNotFoundError,
    }).then(({ content, error }) => {
      if (error) {
        return {
          branches: [],
        }
      }
      const cache = JSON.parse(content)
      if (cache.file !== file) {
        throw createCacheCorruptionError(
          `${cacheDataLocation} corrupted: cache.file should be ${file}, got ${cache.file}s`,
        )
      }
      return cache
    }),
  ])
    .then(([inputLocation, cache]) => {
      return {
        inputLocation,
        cache,
      }
    })
    .then(({ inputLocation, cache }) => {
      // here, if readFile returns ENOENT we could/should check is there is something in cache for that file
      // and take that chance to remove the cached version of that file
      // but it's not supposed to happen
      return readFile({
        location: inputLocation,
      }).then(({ content }) => {
        return compile({
          root,
          inputName: file,
          inputSource: content,
          ...rest,
        }).then(({ options, generate }) => {
          const branchIsValid = (branch) => {
            return JSON.stringify(branch.outputMeta) === JSON.stringify(options)
          }

          const cachedBranch = cache.branches.find((branch) => branchIsValid(branch))

          return {
            inputLocation,
            cache,
            options,
            generate,
            input: content,
            branch: cachedBranch,
          }
        })
      })
    })
}

const getFileReport = ({
  compile,
  root,
  cacheFolder,
  compileFolder,
  file,
  inputETagClient = null,
  ...rest
}) => {
  return getFileBranch({
    compile,
    root,
    cacheFolder,
    compileFolder,
    file,
    ...rest,
  }).then(({ inputLocation, cache, options, generate, input, branch }) => {
    if (!branch) {
      return {
        inputLocation,
        status: "missing",
        cache,
        options,
        generate,
        branch: {
          name: cuid(),
        },
        input,
      }
    }

    return readBranch({
      root,
      cacheFolder,
      compileFolder,
      file,
      inputLocation,
      inputETagClient,
      cache,
      branch,
    }).then(({ status, input, inputETag, output, outputAssets }) => {
      return {
        inputLocation,
        status,
        cache,
        options,
        generate,
        branch,
        input,
        inputETag,
        output,
        outputAssets,
      }
    })
  })
}

const compareBranch = (branchA, branchB) => {
  const lastMatchDiff = branchA.lastMatchMs - branchB.lastMatchMs

  if (lastMatchDiff === 0) {
    return branchA.matchCount - branchB.matchCount
  }
  return lastMatchDiff
}

const updateBranch = ({
  root,
  cacheFolder,
  compileFolder,
  file,
  inputLocation,
  status,
  cache,
  options,
  branch,
  inputETag,
  output,
  outputAssets,
  cacheTrackHit,
}) => {
  const { branches } = cache
  const isCached = status === "cached"
  const isNew = status === "created"
  const isUpdated = status === "updated"

  const promises = []

  if (isNew || isUpdated) {
    const mainLocation = getOutputLocation({
      root,
      cacheFolder,
      compileFolder,
      file,
      branch,
    })

    promises.push(
      writeFileFromString(mainLocation, output),
      ...outputAssets.map((asset) => {
        const assetLocation = getOutputAssetLocation({
          root,
          cacheFolder,
          compileFolder,
          file,
          branch,
          asset,
        })

        return writeFileFromString(assetLocation, asset.content)
      }),
    )
  }

  if (isNew || isUpdated || (isCached && cacheTrackHit)) {
    if (inputETag !== cache.inputETag) {
      const branchesToRemove = branches.slice()
      // do not remove the updated branch
      const index = branchesToRemove.indexOf(branch)
      branchesToRemove.splice(index, 1)

      branchesToRemove.forEach((branch) => {
        const branchLocation = getBranchLocation({
          root,
          cacheFolder,
          compileFolder,
          file,
          branch,
        })
        console.log(`file changed, remove ${branchLocation}`)
        // the line below is async but non blocking
        removeFolderDeep(branchLocation)
      })
      branches.length = 0
      // do not remove updated branch
      if (isUpdated) {
        branches.push(branch)
      }
    }

    if (isNew) {
      branches.push(branch)
    }

    const updatedBranches = branches
      .map((branchToUpdate) => {
        if (branchToUpdate.name !== branch.name) {
          return { ...branchToUpdate }
        }
        if (isCached) {
          return {
            ...branchToUpdate,
            matchCount: branch.matchCount + 1,
            lastMatchMs: Number(Date.now()),
          }
        }
        if (isUpdated) {
          return {
            ...branchToUpdate,
            matchCount: branch.matchCount + 1,
            lastMatchMs: Number(Date.now()),
            lastModifiedMs: Number(Date.now()),
            outputAssets: outputAssets.map(({ name, content }) => {
              return { name, eTag: createETag(content) }
            }),
          }
        }
        // new branch
        return {
          name: branch.name,
          matchCount: 1,
          createdMs: Number(Date.now()),
          lastModifiedMs: Number(Date.now()),
          lastMatchMs: Number(Date.now()),
          outputMeta: options,
          outputAssets: outputAssets.map(({ name, content }) => {
            return { name, eTag: createETag(content) }
          }),
        }
      })
      .sort(compareBranch)

    const updatedCache = {
      file,
      inputETag: isCached ? cache.inputETag : inputETag,
      inputLocation:
        inputLocation === getSourceAbstractLocation({ root, file }) ? undefined : inputLocation,
      branches: updatedBranches,
    }

    const cacheDataLocation = getCacheDataLocation({
      root,
      cacheFolder,
      compileFolder,
      file,
    })

    promises.push(writeFileFromString(cacheDataLocation, JSON.stringify(updatedCache, null, "  ")))
  }

  return Promise.all(promises)
}

export const compileToFileCompile = (
  compile,
  {
    root,
    cacheFolder = "build",
    compileFolder = "compiled",
    cacheIgnore = false,
    cacheTrackHit = false,
  },
) => {
  return ({ file, eTag, ...rest }) => {
    const inputETagClient = eTag

    const fileLock = lockForRessource(
      getCacheDataLocation({
        root,
        cacheFolder,
        compileFolder,
        file,
      }),
    )

    return fileLock.chain(() => {
      return getFileReport({
        compile,
        root,
        cacheFolder,
        compileFolder,
        file,
        inputETagClient,
        ...rest,
      })
        .then(
          ({
            inputLocation,
            status,
            cache,
            options,
            generate,
            branch,
            input,
            inputETag,
            output,
            outputAssets,
          }) => {
            const outputRelativeLocation = getOutputRelativeLocation({
              cacheFolder,
              compileFolder,
              file,
              branch,
            })

            if (!cacheIgnore && status === "valid") {
              return {
                inputLocation,
                status: "cached",
                cache,
                options,
                branch,
                input,
                inputETag,
                outputRelativeLocation,
                output,
                outputAssets,
              }
            }

            return Promise.resolve(generate({ outputRelativeLocation, ...rest })).then(
              ({ output, outputAssets }) => {
                return {
                  inputLocation,
                  status: status === "missing" ? "created" : "updated",
                  cache,
                  options,
                  branch,
                  input,
                  inputETag: createETag(input),
                  outputRelativeLocation,
                  output,
                  outputAssets,
                }
              },
            )
          },
        )
        .then(
          ({
            inputLocation,
            status,
            cache,
            options,
            branch,
            input,
            inputETag,
            outputRelativeLocation,
            output,
            outputAssets,
          }) => {
            return updateBranch({
              root,
              cacheFolder,
              compileFolder,
              file,
              inputLocation,
              status,
              cache,
              options,
              branch,
              input,
              inputETag,
              output,
              outputAssets,
              cacheTrackHit,
            }).then(() => {
              return {
                status,
                inputETag,
                output,
                outputRelativeLocation,
                cacheIgnore,
              }
            })
          },
        )
    })
  }
}

// deprecated
export const compileToFileLocateAsset = ({
  compile,
  root,
  cacheFolder = "build",
  compileFolder = "compiled",
}) => {
  return ({ file, asset, ...rest }) => {
    return getFileBranch({
      compile,
      root,
      cacheFolder,
      compileFolder,
      file,
      ...rest,
    }).then(({ branch }) => {
      if (!branch) {
        return ""
      }

      const branchLocation = getBranchLocation({
        root,
        cacheFolder,
        compileFolder,
        branch,
      })

      return `file:///${branchLocation}${asset}`
    })
  }
}
