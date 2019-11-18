import { assert } from "@jsenv/assert"
import { resolveDirectoryUrl, urlToRelativePath } from "src/internal/urlUtils.js"
import { jsenvCoreDirectoryUrl } from "src/internal/jsenvCoreDirectoryUrl.js"
import { executeTestPlan, launchNode } from "../../../index.js"
import { EXECUTE_TEST_PARAMS } from "../TEST_PARAMS.js"

const testDirectoryUrl = resolveDirectoryUrl("./", import.meta.url)
const testDirectoryRelativePath = urlToRelativePath(testDirectoryUrl, jsenvCoreDirectoryUrl)
const compileDirectoryRelativeUrl = `${testDirectoryRelativePath}.dist/`
const fileRelativeUrl = `${testDirectoryRelativePath}use-file.js`
const testPlan = {
  [fileRelativeUrl]: {
    node: {
      launch: launchNode,
    },
    node2: {
      launch: launchNode,
    },
  },
}

const { coverageMap } = await executeTestPlan({
  ...EXECUTE_TEST_PARAMS,
  compileDirectoryRelativeUrl,
  testPlan,
  coverage: true,
  coverageConfig: {
    [`${testDirectoryRelativePath}file.js`]: true,
  },
})
const actual = coverageMap
const expected = {
  [`${testDirectoryRelativePath}file.js`]: {
    ...coverageMap[`${testDirectoryRelativePath}file.js`],
    path: `${testDirectoryRelativePath}file.js`,
    s: { 0: 2, 1: 0, 2: 2, 3: 2, 4: 0 },
  },
}
assert({ actual, expected })
