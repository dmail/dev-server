import { assert } from "@jsenv/assert"
import { launchChromium } from "@jsenv/chromium-launcher"
import { resolveDirectoryUrl, urlToRelativePath } from "src/internal/urlUtils.js"
import { jsenvCoreDirectoryUrl } from "src/internal/jsenvCoreDirectoryUrl.js"
import { execute, convertCommonJsWithRollup } from "../../../index.js"
import { EXECUTE_TEST_PARAMS } from "../TEST_PARAMS.js"

const testDirectoryUrl = resolveDirectoryUrl("./", import.meta.url)
const testDirectoryRelativePath = urlToRelativePath(testDirectoryUrl, jsenvCoreDirectoryUrl)
const compileDirectoryRelativeUrl = `${testDirectoryRelativePath}.dist/`
const fileRelativeUrl = `${compileDirectoryRelativeUrl}file.js`

const actual = await execute({
  ...EXECUTE_TEST_PARAMS,
  compileDirectoryRelativeUrl,
  convertMap: {
    "./node_modules/react/index.js": (options) =>
      convertCommonJsWithRollup({ ...options, processEnvNodeEnv: "production" }),
  },
  launch: launchChromium,
  stopPlatformAfterExecute: true,
  fileRelativeUrl,
  collectNamespace: true,
})
const expected = {
  status: "completed",
  namespace: {
    default: "object",
  },
}
assert({ actual, expected })
