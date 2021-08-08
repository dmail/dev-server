import { scanBrowserRuntimeFeatures } from "../runtime/createBrowserRuntime/scanBrowserRuntimeFeatures.js"
import { fetchExploringJson } from "./fetchExploringJson.js"

const redirect = async () => {
  const [browserRuntimeFeaturesReport, { exploringHtmlFileRelativeUrl }] = await Promise.all([
    scanBrowserRuntimeFeatures({
      coverageInstrumentationRequired: false,
      failFastOnFeatureDetection: true,
    }),
    fetchExploringJson(),
  ])

  if (browserRuntimeFeaturesReport.canAvoidCompilation) {
    window.location.href = `/${exploringHtmlFileRelativeUrl}`
    return
  }

  const { outDirectoryRelativeUrl, compileId } = browserRuntimeFeaturesReport
  window.location.href = `/${outDirectoryRelativeUrl}${compileId}/${exploringHtmlFileRelativeUrl}`
}

redirect()
