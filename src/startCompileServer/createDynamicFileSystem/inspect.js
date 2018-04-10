import { locate, JSON_FILE } from "./cache.js"
import { all, passed } from "@dmail/action"
import { resolvePath, readFileAsString, isFileNotFoundError, createETag } from "./helpers.js"
import { list } from "./list"

export const inspect = ({ rootLocation, cacheFolderRelativeLocation }) => {
  const cacheFolderLocation = resolvePath(rootLocation, cacheFolderRelativeLocation)

  return list({ rootLocation, cacheFolderRelativeLocation }).then((folders) => {
    return all(
      folders.map((folder) => {
        return readFileAsString({ location: resolvePath(cacheFolderLocation, folder, JSON_FILE) })
          .then(JSON.parse)
          .then((cache) => {
            const inputLocation = locate(cache.inputRelativeLocation, rootLocation)
            return readFileAsString({
              location: inputLocation,
              errorHandler: isFileNotFoundError,
            }).then(
              (content) => {
                const actual = createETag(content)
                const expected = cache.inputETag
                if (actual !== expected) {
                  return "input-file-modified"
                }
                return "valid"
              },
              () => passed("input-file-missing"),
            )
          })
      }),
    ).then((foldersStatus) => {
      return foldersStatus.map((status, index) => {
        return { folder: folders[index], status }
      })
    })
  })
}
