import { require } from "internal/require.js"
import { resolveDirectoryUrl, urlToFileSystemPath } from "@jsenv/util"

const libReport = require("istanbul-lib-report")
const reports = require("istanbul-reports")
const { createCoverageMap } = require("istanbul-lib-coverage")

export const generateCoverageHtmlDirectory = ({
  projectDirectoryUrl,
  coverageHtmlDirectoryRelativeUrl,
  coverageHtmlDirectoryIndexLog,
  coverageMap,
}) => {
  const htmlDirectoryUrl = resolveDirectoryUrl(
    coverageHtmlDirectoryRelativeUrl,
    projectDirectoryUrl,
  )
  const htmlDirectoryPath = urlToFileSystemPath(htmlDirectoryUrl)
  const context = libReport.createContext({
    dir: htmlDirectoryPath,
    coverageMap: createCoverageMap(coverageMap),
  })

  const report = reports.create("html", {
    skipEmpty: true,
    skipFull: true,
  })
  report.execute(context)

  if (coverageHtmlDirectoryIndexLog) {
    const htmlCoverageDirectoryIndexFileUrl = `${htmlDirectoryUrl}index.html`
    const htmlCoverageDirectoryIndexFilePath = urlToFileSystemPath(
      htmlCoverageDirectoryIndexFileUrl,
    )
    console.log(`-> ${htmlCoverageDirectoryIndexFilePath}`)
  }
}
