import { assert } from "@jsenv/assert"
import {
  resolveDirectoryUrl,
  urlToRelativeUrl,
  resolveUrl,
  writeFile,
} from "@jsenv/filesystem"

import { buildProject } from "@jsenv/core"
import { jsenvCoreDirectoryUrl } from "@jsenv/core/src/internal/jsenvCoreDirectoryUrl.js"
import {
  GENERATE_ESMODULE_BUILD_TEST_PARAMS,
  BROWSER_IMPORT_BUILD_TEST_PARAMS,
} from "@jsenv/core/test/TEST_PARAMS_BUILD_ESMODULE.js"
import { browserImportEsModuleBuild } from "@jsenv/core/test/browserImportEsModuleBuild.js"

const testDirectoryUrl = resolveDirectoryUrl("./", import.meta.url)
const testDirectoryRelativeUrl = urlToRelativeUrl(
  testDirectoryUrl,
  jsenvCoreDirectoryUrl,
)
const jsenvDirectoryRelativeUrl = `${testDirectoryRelativeUrl}.jsenv/`
const mainFilename = `main.html`
const entryPointMap = {
  [`./${testDirectoryRelativeUrl}${mainFilename}`]: "./main.prod.html",
}
const buildDirectoryRelativeUrl = `${testDirectoryRelativeUrl}dist/esmodule/`
const test = async (params) => {
  const { buildMappings, buildInlineFileContents } = await buildProject({
    ...GENERATE_ESMODULE_BUILD_TEST_PARAMS,
    jsenvDirectoryRelativeUrl,
    buildDirectoryRelativeUrl,
    entryPointMap,
    ...params,
  })
  const buildDirectoryUrl = resolveUrl(
    buildDirectoryRelativeUrl,
    jsenvCoreDirectoryUrl,
  )
  const jsFileBuildRelativeUrl = "main.10.js"
  const jsFileBuildUrl = resolveUrl(jsFileBuildRelativeUrl, buildDirectoryUrl)
  await writeFile(
    jsFileBuildUrl,
    buildInlineFileContents[jsFileBuildRelativeUrl],
  )
  return { buildMappings, jsFileBuildRelativeUrl }
}

// {
//   const { buildMappings, jsFileBuildRelativeUrl } = await test({
//     jsConcatenation: true,
//   })
//   const { namespace } = await browserImportEsModuleBuild({
//     ...BROWSER_IMPORT_BUILD_TEST_PARAMS,
//     testDirectoryRelativeUrl,
//     jsFileRelativeUrl: `./${jsFileBuildRelativeUrl}`,
//   })
//   const jsFileBuildUrl = resolveUrl(jsFileBuildRelativeUrl, buildDirectoryUrl)
//   const jsFileContent = await readFile(jsFileBuildUrl)
//   const jsFileContainsImgBuildRelativeUrl = jsFileContent.includes(
//     buildMappings[`${testDirectoryRelativeUrl}src/jsenv.png`],
//   )

//   const actual = {
//     jsFileContainsImgBuildRelativeUrl,
//     buildMappings,
//     namespace,
//   }
//   const expected = {
//     jsFileContainsImgBuildRelativeUrl: true,
//     buildMappings: {
//       [`${testDirectoryRelativeUrl}src/jsenv.png`]: assert.any(String),
//       [`${testDirectoryRelativeUrl}main.html`]: assert.any(String),
//     },
//     namespace: {
//       backgroundBodyColor: "rgb(255, 0, 0)",
//     },
//   }
//   assert({ actual, expected })
// }

// no concatenation + runtime support enough
{
  const { buildMappings, jsFileBuildRelativeUrl } = await test({
    jsConcatenation: false,
    runtimeSupport: { chrome: "96" },
  })
  const { namespace, serverOrigin } = await browserImportEsModuleBuild({
    ...BROWSER_IMPORT_BUILD_TEST_PARAMS,
    testDirectoryRelativeUrl,
    jsFileRelativeUrl: `./${jsFileBuildRelativeUrl}`,
  })
  const imgBuildRelativeUrl =
    buildMappings[`${testDirectoryRelativeUrl}src/jsenv.png`]

  const actual = {
    buildMappings,
    namespace,
  }
  const expected = {
    buildMappings: {
      [`${testDirectoryRelativeUrl}src/jsenv.png`]: assert.any(String),
      [`${testDirectoryRelativeUrl}main.html`]: assert.any(String),
    },
    namespace: {
      bodyBackgroundColor: "rgb(255, 0, 0)",
      bodyBackgroundImage: `url("${serverOrigin}/dist/esmodule/${imgBuildRelativeUrl}")`,
    },
  }
  assert({ actual, expected })
}
