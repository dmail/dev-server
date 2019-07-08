import { isNativeBrowserModuleBareSpecifier } from "@jsenv/module-resolution/src/isNativeBrowserModuleBareSpecifier.js"
import { isNativeNodeModuleBareSpecifier } from "@jsenv/module-resolution/src/isNativeNodeModuleBareSpecifier.js"
import { browserScoreMap, nodeVersionScoreMap } from "../group-map/index.js"

const { jsenvBabelPluginMap } = import.meta.require("@jsenv/babel-plugin-map")

export const DEFAULT_ENTRY_POINT_MAP = {
  main: "index.js",
}

export const DEFAULT_NATIVE_MODULE_PREDICATE = (id) =>
  isNativeBrowserModuleBareSpecifier(id) || isNativeNodeModuleBareSpecifier(id)

export const DEFAULT_BABEL_PLUGIN_MAP = jsenvBabelPluginMap

export const DEFAULT_PLATFORM_GROUP_RESOLVER_RELATIVE_PATH =
  "/node_modules/@jsenv/core/src/platform-group-resolver/index.js"

export const DEFAULT_PLATFORM_SCORE_MAP = {
  ...browserScoreMap,
  node: nodeVersionScoreMap,
}
