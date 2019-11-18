import { metaMapToSpecifierMetaMap, normalizeSpecifierMetaMap, urlToMeta } from "@jsenv/url-meta"
import { generateFileExecutionSteps } from "internal/executing/generateFileExecutionSteps.js"

export const relativePathToExecutionSteps = ({ projectDirectoryUrl, relativePath, plan }) => {
  const specifierMetaMapForExecution = normalizeSpecifierMetaMap(
    metaMapToSpecifierMetaMap({
      filePlan: plan,
    }),
    projectDirectoryUrl,
  )

  const meta = urlToMeta({
    url: `${projectDirectoryUrl}${relativePath}`,
    specifierMetaMap: specifierMetaMapForExecution,
  })
  if (meta.filePlan) {
    return generateFileExecutionSteps({
      fileRelativeUrl: relativePath,
      filePlan: meta.filePlan,
    })
  }

  return []
}
