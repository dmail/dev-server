import { jsenvCoreDirectoryUrl } from "internal/jsenvCoreDirectoryUrl.js"
import { testBabelPluginMap } from "../testBabelPluginMap.js"

export const START_EXPLORING_TEST_PARAMS = {
  logLevel: "warn",
  compileServerLogLevel: "warn",
  projectDirectoryPath: jsenvCoreDirectoryUrl,
  compileDirectoryClean: true,
  HTMLTemplateFileUrl: import.meta.resolve("./template.html"),
  babelPluginMap: testBabelPluginMap,
  keepProcessAlive: false,
}
