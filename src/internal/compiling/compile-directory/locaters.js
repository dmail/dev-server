import { resolveUrl } from "internal/urlUtils.js"

export const resolveAssetFileUrl = ({ asset, compiledFileUrl }) =>
  resolveUrl(asset, `${compiledFileUrl}__asset__/`)

export const resolveMetaJsonFileUrl = ({ compiledFileUrl }) =>
  resolveAssetFileUrl({ compiledFileUrl, asset: "meta.json" })

export const resolveSourceFileUrl = ({ source, compiledFileUrl }) =>
  resolveUrl(source, resolveMetaJsonFileUrl({ compiledFileUrl }))
