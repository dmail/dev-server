import { assert } from "@dmail/assert"
import { importMetaURLToFolderJsenvRelativePath } from "../../../src/import-meta-url-to-folder-jsenv-relative-path.js"
import { JSENV_PATH } from "../../../src/JSENV_PATH.js"
import { startCompileServer, launchAndExecute, launchChromium } from "../../../index.js"
import { createInstrumentPlugin } from "../../../src/cover/createInstrumentPlugin.js"
import { removeFolder } from "../removeFolder.js"

const projectFolder = JSENV_PATH
const folderJsenvRelativePath = importMetaURLToFolderJsenvRelativePath(import.meta.url)
const compileIntoRelativePath = `${folderJsenvRelativePath}/.dist`
const fileRelativePath = `${folderJsenvRelativePath}/origin-relative.js`
const babelConfigMap = {
  "transform-instrument": [
    createInstrumentPlugin({
      predicate: (relativePath) => relativePath === `${folderJsenvRelativePath}/file.js`,
    }),
  ],
}

await removeFolder(`${projectFolder}${compileIntoRelativePath}`)

const { origin: compileServerOrigin } = await startCompileServer({
  projectFolder,
  compileIntoRelativePath,
  babelConfigMap,
  logLevel: "off",
})

const actual = await launchAndExecute({
  launch: (options) =>
    launchChromium({
      ...options,
      compileServerOrigin,
      projectFolder,
      compileIntoRelativePath,
    }),
  stopOnceExecuted: true,
  fileRelativePath,
  collectNamespace: true,
  collectCoverage: true,
})
const expected = {
  status: "completed",
  namespace: {
    default: 42,
  },
  coverageMap: {
    [`${folderJsenvRelativePath.slice(1)}/file.js`]: actual.coverageMap[
      `${folderJsenvRelativePath.slice(1)}/file.js`
    ],
  },
}
assert({
  actual,
  expected,
})
