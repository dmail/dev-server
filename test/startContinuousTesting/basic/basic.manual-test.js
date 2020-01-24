import { startContinuousTesting } from "../../../src/internal/testing/continuous-testing/startContinuousTesting.js"
import { resolveDirectoryUrl, urlToRelativeUrl } from "@jsenv/util"
import { jsenvCoreDirectoryUrl } from "../../../src/internal/jsenvCoreDirectoryUrl.js"
import { launchNode, launchChromium } from "../../../index.js"
import { CONTINUOUS_TESTING_TEST_PARAM } from "../TEST_PARAMS.js"

const testDirectoryUrl = resolveDirectoryUrl("./", import.meta.url)
const testDirectoryRelativeUrl = urlToRelativeUrl(testDirectoryUrl, jsenvCoreDirectoryUrl)
const jsenvDirectoryRelativeUrl = `${testDirectoryRelativeUrl}.jsenv/`

const testPlan = {
  [`${testDirectoryRelativeUrl}/*.spec.js`]: {
    node: {
      launch: launchNode,
    },
    chromium: {
      launch: launchChromium,
    },
  },
}

await startContinuousTesting({
  ...CONTINUOUS_TESTING_TEST_PARAM,
  jsenvDirectoryRelativeUrl,
  defaultAllocatedMsPerExecution: Infinity,
  testPlan,
})
