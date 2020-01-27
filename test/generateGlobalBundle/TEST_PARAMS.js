import { jsenvCoreDirectoryUrl } from "../../src/internal/jsenvCoreDirectoryUrl.js"
import { testBabelPluginMap } from "../testBabelPluginMap.js"

export const GENERATE_GLOBAL_BUNDLE_TEST_PARAMS = {
  projectDirectoryUrl: jsenvCoreDirectoryUrl,
  jsenvCoreDirectoryClean: true,
  bundleDirectoryClean: true,
  logLevel: "warn",
  babelPluginMap: testBabelPluginMap,
  globalName: "__namespace__",
}

export const SCRIPT_LOAD_GLOBAL_BUNDLE_TEST_PARAMS = {
  projectDirectoryUrl: jsenvCoreDirectoryUrl,
  mainRelativeUrl: "./main.js",
  globalName: "__namespace__",
}

export const REQUIRE_GLOBAL_BUNDLE_TEST_PARAMS = {
  projectDirectoryUrl: jsenvCoreDirectoryUrl,
  mainRelativeUrl: "./main.js",
  globalName: "__namespace__",
}
