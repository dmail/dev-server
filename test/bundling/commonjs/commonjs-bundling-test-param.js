import { JSENV_PATH } from "../../../src/JSENV_PATH.js"
import { testBabelPluginMap } from "../../testBabelPluginMap.js"

export const COMMONJS_BUNDLING_TEST_GENERATE_PARAM = {
  projectPath: JSENV_PATH,
  babelPluginMap: testBabelPluginMap,
  balancerTemplateRelativePath: "/src/bundling/commonjs/commonjs-balancer-template.js",
  platformGroupResolverRelativePath: "/src/platform-group-resolver/index.js",
  globalThisHelperRelativePath: "/src/bundling/jsenv-rollup-plugin/global-this.js",
  logLevel: "off",
  throwUnhandled: false,
}

export const COMMONJS_BUNDLING_TEST_REQUIRE_PARAM = {
  projectPath: JSENV_PATH,
  mainRelativePath: "/main.js",
}
