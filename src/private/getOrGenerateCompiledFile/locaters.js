import { resolveFileUrl, fileUrlToPath, resolveDirectoryUrl } from "../urlUtils.js"

export const getPathForAssetFile = ({ compileDirectoryUrl, compiledFileRelativePath, asset }) => {
  const assetDirectoryUrl = resolveDirectoryUrl(
    `${compiledFileRelativePath}__asset__/`,
    compileDirectoryUrl,
  )
  const assetFileUrl = resolveFileUrl(asset, assetDirectoryUrl)
  return fileUrlToPath(assetFileUrl)
}

export const getPathForMetaJsonFile = ({ compileDirectoryUrl, compiledFileRelativePath }) =>
  getPathForAssetFile({ compileDirectoryUrl, compiledFileRelativePath, asset: "meta.json" })

export const getPathForCompiledFile = ({ projectDirectoryUrl, compiledFileRelativePath }) =>
  fileUrlToPath(resolveFileUrl(compiledFileRelativePath, projectDirectoryUrl))

export const getPathForOriginalFile = ({ projectDirectoryUrl, originalFileRelativePath }) =>
  fileUrlToPath(resolveFileUrl(originalFileRelativePath, projectDirectoryUrl))

export const getPathForSourceFile = ({ projectDirectoryUrl, source }) =>
  fileUrlToPath(resolveFileUrl(source, projectDirectoryUrl))
