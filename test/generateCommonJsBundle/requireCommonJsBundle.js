import { resolveDirectoryUrl, resolveFileUrl, fileUrlToPath } from "../../src/urlHelpers.js"

export const requireCommonJsBundle = async ({
  projectDirectoryUrl,
  bundleDirectoryRelativePath,
  mainRelativePath,
}) => {
  const bundleDirectoryUrl = resolveDirectoryUrl(bundleDirectoryRelativePath, projectDirectoryUrl)
  const mainFileUrl = resolveFileUrl(mainRelativePath, bundleDirectoryUrl)
  const mainFilePath = fileUrlToPath(mainFileUrl)
  const namespace = import.meta.require(mainFilePath)
  return {
    namespace: normalizeNamespace(namespace),
  }
}

const normalizeNamespace = (namespace) => {
  if (typeof namespace !== "object") return namespace
  if (Array.isArray(namespace)) return namespace
  if (namespace instanceof Promise) return namespace
  const normalized = {}
  // remove "__esModule" from values
  Object.keys(namespace).forEach((key) => {
    normalized[key] = namespace[key]
  })
  return normalized
}
