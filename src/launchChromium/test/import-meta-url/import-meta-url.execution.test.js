import { assert } from "@dmail/assert"
import { localRoot } from "../../../localRoot.js"
import { launchAndExecute } from "../../../launchAndExecute/index.js"
import { startCompileServer } from "../../../server-compile/index.js"
import { launchChromium } from "../../launchChromium.js"

const file = `src/launchChromium/test/import-meta-url/import-meta-url.js`
const compileInto = "build"
const pluginMap = {}

;(async () => {
  const { origin: remoteRoot } = await startCompileServer({
    localRoot,
    compileInto,
    pluginMap,
  })

  const actual = await launchAndExecute({
    laynch: (options) => launchChromium({ ...options, localRoot, remoteRoot, compileInto }),
    stopOnceExecuted: true,
    platformTypeForLog: "chromium process",
    verbose: true,
    mirrorConsole: true,
    collectNamespace: true,
    file,
  })
  const expected = {
    status: "completed",
    namespace: {
      default: `${remoteRoot}/${compileInto}/best/${file}`,
    },
  }
  assert({ actual, expected })
})()
