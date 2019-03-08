import { assert } from "@dmail/assert"
import { pathnameToFileHref } from "@jsenv/module-resolution"
import { projectFolder } from "../../../projectFolder.js"
import { launchAndExecute } from "../../../launchAndExecute/index.js"
import { startCompileServer } from "../../../server-compile/index.js"
import { launchNode } from "../../launchNode.js"

const filenameRelative = `src/launchNode/test/scoped-node-module/scoped-node-module.js`
const compileInto = "build"
const babelPluginDescription = {}

;(async () => {
  const sourceOrigin = pathnameToFileHref(projectFolder)

  // here we'll have to use genereateImportMapForProjectNodeModules
  // and pass it to startCompileServer
  // so that client knows where to find node module

  const { origin: compileServerOrigin } = await startCompileServer({
    projectFolder,
    compileInto,
    babelPluginDescription,
  })

  const actual = await launchAndExecute({
    launch: (options) => launchNode({ ...options, compileInto, sourceOrigin, compileServerOrigin }),
    collectNamespace: true,
    filenameRelative,
    verbose: true,
    platformTypeForLog: "node process",
  })
  const expected = {
    status: "completed",
    namespace: {
      foo: "scoped-foo",
    },
  }
  assert({ actual, expected })
})()
