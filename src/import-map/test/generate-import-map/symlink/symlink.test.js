import { assert } from "/node_modules/@dmail/assert/index.js"
import { projectFolder } from "../../../../../projectFolder.js"
import { generateImportMapForProjectNodeModules } from "../../../generateImportMapForProjectNodeModules.js"

const testFolder = `${projectFolder}/src/import-map/test/symlink/project`

;(async () => {
  const actual = await generateImportMapForProjectNodeModules({
    projectFolder: testFolder,
    remapMain: true,
    remapFolder: true,
  })
  const expected = {
    imports: {
      foo: "/node_modules/foo/index.js",
      "foo/": "/node_modules/foo/",
    },
    scopes: {},
  }
  assert({
    actual,
    expected,
  })
})()
