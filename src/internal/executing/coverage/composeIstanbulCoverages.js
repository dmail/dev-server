import { require } from "../../require.js"

const { createFileCoverage } = require("istanbul-lib-coverage")

// https://github.com/istanbuljs/istanbuljs/blob/5405550c3868712b14fd8bfe0cbd6f2e7ac42279/packages/istanbul-lib-coverage/lib/coverage-map.js#L43
export const composeIstanbulCoverages = (
  istanbulCoverages,
  { coverageV8MergeConflictIsExpected = false } = {},
) => {
  const coverageComposed = {}

  // we can't merge coverage coming from code instrumented by istanbul
  // with coverage coming from v8 and converted to istanbul, so we want to:
  // 1. Have istanbul and v8 as long as they don't cover the same file
  // 2. Choose istanbul or v8 depending which one cover the most
  // To do that we first merge all v8 together and istanbul together
  // To be able to know which one covers the most in case of merge conflict
  const coverageFromV8Conversion = {}
  const coverageFromIstanbul = {}
  istanbulCoverages.forEach((istanbulCoverage) => {
    Object.keys(istanbulCoverage).forEach((key) => {
      const istanbulFileCoverage = istanbulCoverage[key]
      if (istanbulFileCoverage.fromV8) {
        const existingCoverageForFile = coverageFromV8Conversion[key]
        if (existingCoverageForFile) {
          coverageFromV8Conversion[key] = merge(existingCoverageForFile, istanbulFileCoverage)
        } else {
          coverageFromV8Conversion[key] = istanbulFileCoverage
        }
      } else {
        const existingCoverageForFile = coverageFromIstanbul[key]
        if (existingCoverageForFile) {
          coverageFromIstanbul[key] = merge(existingCoverageForFile, istanbulFileCoverage)
        } else {
          coverageFromIstanbul[key] = istanbulFileCoverage
        }
      }
    })
  })

  Object.keys(coverageFromV8Conversion).forEach((key) => {
    const fileCoverageFromV8 = coverageFromV8Conversion[key]
    const fileCoverageFromIstanbul = coverageFromIstanbul[key]
    if (fileCoverageFromIstanbul) {
      const v8BranchCount = branchHitCountFromFileCoverage(fileCoverageFromV8)
      const istanbulBranchCount = branchHitCountFromFileCoverage(fileCoverageFromIstanbul)
      const coverageWithMostBranchCovered =
        v8BranchCount >= istanbulBranchCount ? fileCoverageFromV8 : fileCoverageFromIstanbul

      if (!coverageV8MergeConflictIsExpected) {
        // ideally when coverageV8MergeConflictIsExpected it would be a console.debug
        console.warn(
          formatMergeConflictBetweenV8AndIstanbulWarning({
            fileRelativeUrl: key,
            coverageKept: coverageWithMostBranchCovered,
          }),
        )
      }
      coverageComposed[key] = coverageWithMostBranchCovered
    } else {
      coverageComposed[key] = fileCoverageFromV8
    }
  })

  Object.keys(coverageFromIstanbul).forEach((key) => {
    const fileCoverageFromIstanbul = coverageFromIstanbul[key]
    const fileCoverageFromV8 = coverageFromV8Conversion[key]
    if (fileCoverageFromV8) {
      // already handled
    } else {
      coverageComposed[key] = fileCoverageFromIstanbul
    }
  })

  return coverageComposed
}

const branchHitCountFromFileCoverage = ({ b }) => {
  const branchHitCount = Object.keys(b).reduce((previous, key) => {
    return previous + b[key]
  }, 0)
  return branchHitCount
}

const merge = (istanbulFileCoverageA, istanbulFileCoverageB) => {
  const istanbulFileCoverageObject = createFileCoverage(istanbulFileCoverageA)
  istanbulFileCoverageObject.merge(istanbulFileCoverageB)
  return istanbulFileCoverageObject.toJSON()
}

const formatMergeConflictBetweenV8AndIstanbulWarning = ({ fileRelativeUrl, coverageKept }) => {
  return `Cannot merge file coverage coming from v8 and istanbul.
The one with most branch coverage will be kept and the other ignored.
--- file ---
${fileRelativeUrl}
--- coverage kept ---
${coverageKept.fromV8 ? "v8" : "istanbul"}`
}
