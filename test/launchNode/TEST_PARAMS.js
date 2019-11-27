import { createLogger } from "@jsenv/logger"
import { jsenvCoreDirectoryUrl } from "../../src/internal/jsenvCoreDirectoryUrl.js"
import { testBabelPluginMap } from "../testBabelPluginMap.js"

export const START_COMPILE_SERVER_TEST_PARAMS = {
  projectDirectoryUrl: jsenvCoreDirectoryUrl,
  jsenvDirectoryClean: true,
  compileServerLogLevel: "off",
  babelPluginMap: testBabelPluginMap,
  compileGroupCount: 2,
}

export const EXECUTE_TEST_PARAMS = {
  launchLogger: createLogger({ logLevel: "info" }),
  executeLogger: createLogger({ logLevel: "info" }),
  collectNamespace: true,
  inheritCoverage: process.env.COVERAGE_ENABLED === "true",
}

export const LAUNCH_TEST_PARAMS = {
  projectDirectoryUrl: jsenvCoreDirectoryUrl,
}
