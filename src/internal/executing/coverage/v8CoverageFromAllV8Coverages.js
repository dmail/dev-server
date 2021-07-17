import { resolveUrl, normalizeStructuredMetaMap, urlToMeta } from "@jsenv/util"

import { composeV8Coverages } from "./composeV8Coverages.js"

export const v8CoverageFromAllV8Coverages = (
  allV8Coverages,
  { projectDirectoryUrl, coverageConfig },
) => {
  const v8Coverages = filterCoverageReports(allV8Coverages, {
    projectDirectoryUrl,
    coverageConfig,
  })

  const v8Coverage = composeV8Coverages(v8Coverages)
  return v8Coverage
}

const filterCoverageReports = (coverageReports, { projectDirectoryUrl, coverageConfig }) => {
  const structuredMetaMapForCover = normalizeStructuredMetaMap(
    {
      cover: coverageConfig,
    },
    projectDirectoryUrl,
  )
  const shouldIgnoreCoverage = (url) => {
    return !urlToMeta({
      url: resolveUrl(url, projectDirectoryUrl),
      structuredMetaMap: structuredMetaMapForCover,
    }).cover
  }

  return coverageReports.map((coverageReport) => {
    return {
      ...coverageReport,
      result: coverageReport.result.filter((fileReport) => {
        return !shouldIgnoreCoverage(fileReport.url)
      }),
    }
  })
}
