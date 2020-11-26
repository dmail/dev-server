// test disabled until https://github.com/rollup/rollup/issues/3882

import { basename } from "path"
import { assert } from "@jsenv/assert"
import { resolveUrl, urlToRelativeUrl } from "@jsenv/util"
import { jsenvCoreDirectoryUrl } from "@jsenv/core/src/internal/jsenvCoreDirectoryUrl.js"
import { buildProject } from "@jsenv/core/index.js"
import {
  GENERATE_ESMODULE_BUILD_TEST_PARAMS,
  BROWSER_IMPORT_BUILD_TEST_PARAMS,
} from "../TEST_PARAMS.js"
import { browserImportBuild } from "../browserImportBuild.js"

const testDirectoryUrl = resolveUrl("./", import.meta.url)
const testDirectoryRelativeUrl = urlToRelativeUrl(testDirectoryUrl, jsenvCoreDirectoryUrl)
const testDirectoryname = basename(testDirectoryRelativeUrl)
const jsenvDirectoryRelativeUrl = `${testDirectoryRelativeUrl}.jsenv/`
const buildDirectoryRelativeUrl = `${testDirectoryRelativeUrl}dist/esmodule/`
const mainFilename = `${testDirectoryname}.js`

const { buildMappings } = await buildProject({
  ...GENERATE_ESMODULE_BUILD_TEST_PARAMS,
  jsenvDirectoryRelativeUrl,
  buildDirectoryRelativeUrl,
  entryPointMap: {
    [`./${testDirectoryRelativeUrl}${mainFilename}`]: "./main.js",
  },
  jsConcatenation: false,
})

const getBuildRelativeUrl = (urlRelativeToTestDirectory) => {
  const relativeUrl = `${testDirectoryRelativeUrl}${urlRelativeToTestDirectory}`
  const buildRelativeUrl = buildMappings[relativeUrl]
  return buildRelativeUrl
}

const indexRelativeUrl = getBuildRelativeUrl("index.js")

{
  const { value: actual } = await browserImportBuild({
    ...BROWSER_IMPORT_BUILD_TEST_PARAMS,
    buildDirectoryRelativeUrl,
    mainRelativeUrl: `./${indexRelativeUrl}`,
    headless: false,
    stopAfterImport: false,
  })
  const expected = 42
  assert({ actual, expected })
}
