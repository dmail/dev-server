import { JSENV_PATH } from "../../src/JSENV_PATH.js"
import { testBabelPluginMap } from "../testBabelPluginMap.js"

export const EXPLORING_SERVER_TEST_PARAM = {
  projectPath: JSENV_PATH,
  babelPluginMap: testBabelPluginMap,
  browserClientRelativePath: "/src/browser-client",
  browserGroupResolverPath: "/src/browser-group-resolver/index.js",
  logLevel: "off",
  compileServerLogLevel: "off",
  keepProcessAlive: false,
}
