import { assert } from "@dmail/assert"
import { root } from "../../../root.js"
import { launchAndExecute } from "../../../launchAndExecute/index.js"
import { startCompileServer } from "../../../server-compile/index.js"
import { launchNode } from "../../launchNode.js"

const file = `src/launchNode/test/import-meta-url/import-meta-url.js`
const compileInto = "build"
const babelPluginDescription = {}

;(async () => {
  const { origin: remoteRoot } = await startCompileServer({
    root,
    compileInto,
    babelPluginDescription,
  })

  const actual = await launchAndExecute({
    launch: (options) => launchNode({ ...options, root, compileInto, remoteRoot }),
    mirrorConsole: true,
    collectNamespace: true,
    file,
    verbose: true,
  })
  const expected = {
    status: "completed",
    namespace: {
      default: `${remoteRoot}/${compileInto}/best/${file}`,
    },
  }
  assert({ actual, expected })
})()
