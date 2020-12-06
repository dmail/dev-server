import { assert } from "@jsenv/assert"
import { resolveDirectoryUrl, urlToRelativeUrl } from "@jsenv/util"
import { jsenvCoreDirectoryUrl } from "@jsenv/core/src/internal/jsenvCoreDirectoryUrl.js"
import { executeTestPlan, launchNode } from "@jsenv/core"
import { EXECUTE_TEST_PARAMS } from "../TEST_PARAMS.js"

const testDirectoryUrl = resolveDirectoryUrl("./", import.meta.url)
const testDirectoryRelativeUrl = urlToRelativeUrl(testDirectoryUrl, jsenvCoreDirectoryUrl)
const jsenvDirectoryRelativeUrl = `${testDirectoryRelativeUrl}.jsenv/`
const fileRelativeUrl = `${testDirectoryRelativeUrl}file.spec.js`
const testPlan = {
  [fileRelativeUrl]: {
    node: {
      launch: launchNode,
      captureConsole: true,
    },
  },
}
const actual = await executeTestPlan({
  ...EXECUTE_TEST_PARAMS,
  jsenvDirectoryRelativeUrl,
  testPlan,
  executionLogLevel: "off",
})
const expected = {
  summary: {
    executionCount: 1,
    disconnectedCount: 0,
    timedoutCount: 0,
    erroredCount: 1,
    completedCount: 0,
    startMs: actual.summary.startMs,
    endMs: actual.summary.endMs,
  },
  report: {
    [fileRelativeUrl]: {
      node: {
        status: "errored",
        error: Object.assign(new Error(`ask() should return 42, got 40`), {
          filename: actual.report[fileRelativeUrl].node.error.filename,
          lineno: actual.report[fileRelativeUrl].node.error.lineno,
          columnno: actual.report[fileRelativeUrl].node.error.columnno,
        }),
        consoleCalls: actual.report[fileRelativeUrl].node.consoleCalls,
        runtimeName: "node",
        runtimeVersion: actual.report[fileRelativeUrl].node.runtimeVersion,
      },
    },
  },
}
assert({ actual, expected })

{
  // error should not be in logs
  const actual = actual.report[fileRelativeUrl].node.consoleCalls.some(({ text }) =>
    text.includes(`should return 42`),
  )
  const expected = false
  assert({ actual, expected })
}
