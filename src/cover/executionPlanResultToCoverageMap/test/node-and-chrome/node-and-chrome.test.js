import { assert } from "@dmail/assert"
import { launchNode } from "../../../../node-launcher/index.js.js"
import { launchChromium } from "../../../../chromium-launcher/index.js.js.js"
import { executePlan } from "../../../../executePlan/index.js"
import { startCompileServer } from "../../../../compile-server/index.js"
import { executionPlanResultToCoverageMap } from "../../executionPlanResultToCoverageMap.js"

const { projectFolder } = import.meta.require("../../../../../jsenv.config.js")

const testFolder = `${projectFolder}/src/cover/executionPlanResultToCoverageMap/test/node-and-chrome`
const compileInto = ".dist"
const babelConfigMap = {}

;(async () => {
  const sourceOrigin = `file://${testFolder}`

  const { origin: compileServerOrigin } = await startCompileServer({
    projectFolder: testFolder,
    compileInto,
    babelConfigMap,
    protocol: "http",
    ip: "127.0.0.1",
    port: 0,
    verbose: false,
  })

  const nodeLaunch = (options) =>
    launchNode({ ...options, sourceOrigin, compileServerOrigin, compileInto })

  const chromiumLaunch = (options) =>
    launchChromium({ ...options, sourceOrigin, compileServerOrigin, compileInto })

  const executionPlan = {
    "node-and-chrome.js": {
      node: {
        launch: nodeLaunch,
      },
      chromium: {
        launch: chromiumLaunch,
      },
    },
  }

  const executionPlanResult = await executePlan(executionPlan, {
    cover: true,
  })

  const coverageMap = await executionPlanResultToCoverageMap(executionPlanResult, {
    projectFolder,
    arrayOfFilenameRelativeToCover: [],
  })

  assert({
    actual: coverageMap,
    expected: {},
  })
})()
