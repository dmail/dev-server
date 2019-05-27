import { assert } from "@dmail/assert"
import {
  operatingSystemPathToPathname,
  pathnameToOperatingSystemPath,
} from "@jsenv/operating-system-path"
import { JSENV_PATH } from "../../../src/JSENV_PATH.js"
import { importMetaURLToFolderJsenvRelativePath } from "../../../src/import-meta-url-to-folder-jsenv-relative-path.js"
import { startCompileServer, launchAndExecute, launchChromium } from "../../../index.js"
import { assignNonEnumerableProperties } from "/test/node-launcher/assignNonEnumerableProperties.js"

const projectPath = JSENV_PATH
const folderJsenvRelativePath = importMetaURLToFolderJsenvRelativePath(import.meta.url)
const compileIntoRelativePath = `${folderJsenvRelativePath}/.dist`
const compileId = "otherwise"
const fileRelativePath = `${folderJsenvRelativePath}/syntax-error.js`

const { origin: compileServerOrigin } = await startCompileServer({
  projectPath,
  compileIntoRelativePath,
  logLevel: "off",
  cleanCompileInto: true,
})

const actual = await launchAndExecute({
  launch: (options) =>
    launchChromium({
      ...options,
      compileServerOrigin,
      projectPath,
      compileIntoRelativePath,
    }),
  stopOnceExecuted: true,
  fileRelativePath,
})
const projectPathname = operatingSystemPathToPathname(projectPath)
const expected = {
  status: "errored",
  error: assignNonEnumerableProperties(
    new Error(`error while parsing module.
href: file://${projectPathname}${compileIntoRelativePath}/${compileId}${fileRelativePath}
importerHref: undefined
parseErrorMessage: ${actual.error.parseError.message}`),
    {
      href: `${compileServerOrigin}${compileIntoRelativePath}/${compileId}${fileRelativePath}`,
      importerHref: undefined,
      parseError: {
        message: actual.error.parseError.message,
        messageHTML: actual.error.parseError.messageHTML,
        filename: pathnameToOperatingSystemPath(`${projectPathname}${fileRelativePath}`),
        lineNumber: 1,
        columnNumber: 17,
      },
      code: "MODULE_PARSE_ERROR",
    },
  ),
}
assert({ actual, expected })
