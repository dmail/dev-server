import { resolveDirectoryUrl, urlToRelativeUrl } from "internal/urlUtils.js"
import { jsenvCoreDirectoryUrl } from "internal/jsenvCoreDirectoryUrl.js"
import { startExploring } from "../../index.js"
import { START_EXPLORING_TEST_PARAMS } from "./TEST_PARAMS.js"

const testDirectoryUrl = resolveDirectoryUrl("./", import.meta.url)
const testDirectoryRelativeUrl = urlToRelativeUrl(testDirectoryUrl, jsenvCoreDirectoryUrl)
const compileDirectoryRelativeUrl = `${testDirectoryRelativeUrl}.dist/`

startExploring({
  ...START_EXPLORING_TEST_PARAMS,
  logLevel: "info",
  compileServerLogLevel: "info",
  compileDirectoryRelativeUrl,
  explorableConfig: {
    [`./${testDirectoryRelativeUrl}**/*.main.js`]: true,
    [`./${testDirectoryRelativeUrl}**/.dist/**`]: false,
  },
  protocol: "https",
  port: 3400,
  forcePort: true,
  livereloading: true,
  keepProcessAlive: true,
})
