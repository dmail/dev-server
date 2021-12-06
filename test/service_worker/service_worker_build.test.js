import { assert } from "@jsenv/assert"
import {
  resolveDirectoryUrl,
  urlToRelativeUrl,
  resolveUrl,
  urlToFileSystemPath,
} from "@jsenv/filesystem"

import { buildProject, jsenvServiceWorkerFinalizer } from "@jsenv/core"
import { jsenvCoreDirectoryUrl } from "@jsenv/core/src/internal/jsenvCoreDirectoryUrl.js"
import { require } from "@jsenv/core/src/internal/require.js"
import { GENERATE_ESMODULE_BUILD_TEST_PARAMS } from "@jsenv/core/test/TEST_PARAMS_BUILD_ESMODULE.js"

const testDirectoryUrl = resolveDirectoryUrl("./", import.meta.url)
const testDirectoryRelativeUrl = urlToRelativeUrl(
  testDirectoryUrl,
  jsenvCoreDirectoryUrl,
)
const jsenvDirectoryRelativeUrl = `${testDirectoryRelativeUrl}.jsenv/`
const buildDirectoryRelativeUrl = `${testDirectoryRelativeUrl}dist/esmodule/`
const mainFilename = `main.html`
const entryPointMap = {
  [`./${testDirectoryRelativeUrl}${mainFilename}`]: "./main.html",
}
const buildDirectoryUrl = resolveUrl(
  buildDirectoryRelativeUrl,
  jsenvCoreDirectoryUrl,
)

await buildProject({
  ...GENERATE_ESMODULE_BUILD_TEST_PARAMS,
  // logLevel: "info",
  jsenvDirectoryRelativeUrl,
  buildDirectoryRelativeUrl,
  entryPointMap,
  serviceWorkers: {
    [`${testDirectoryRelativeUrl}sw.js`]: "sw.cjs",
  },
  serviceWorkerFinalizer: jsenvServiceWorkerFinalizer,
})

const serviceWorkerBuildUrl = resolveUrl("sw.cjs", buildDirectoryUrl)
global.self = {}
// eslint-disable-next-line import/no-dynamic-require
require(urlToFileSystemPath(serviceWorkerBuildUrl))
const actual = {
  order: global.self.order,
  generatedUrlsConfig: global.self.generatedUrlsConfig,
}
const expected = {
  order: ["before-a", "before-b", "b", "after-b", "after-a"],
  generatedUrlsConfig: {
    "assets/style-b126d686.css": { versioned: true },
    "main.html": {
      versioned: false,
      // because when html file is modified, it's url is not
      // if you update only the html file, browser won't update the service worker.
      // To ensure worker is still updated, jsenv adds a jsenvStaticUrlsHash
      // to include a hash for the html file.
      // -> when html file changes -> hash changes -> worker updates
      version: "9baaa6c1",
    },
  },
}
assert({ actual, expected })
