import { babelCompatMap } from "../group-map/babelCompatMap.js"
import { browserScoreMap } from "../group-map/browserScoreMap.js"
import { nodeVersionScoreMap } from "../group-map/nodeVersionScoreMap.js"

const { babelConfigMap } = import.meta.require("@jsenv/babel-config-map")

export const DEFAULT_IMPORT_MAP_FILENAME_RELATIVE = "importMap.json"

export const DEFAULT_BROWSER_GROUP_RESOLVER_FILENAME_RELATIVE =
  "src/browser-group-resolver/index.js"

export const DEFAULT_NODE_GROUP_RESOLVER_FILENAME_RELATIVE = "src/node-group-resolver/index.js"

export const DEFAULT_COMPILE_INTO = ".dist"

export const DEFAULT_BABEL_CONFIG_MAP = babelConfigMap

export const DEFAULT_BABEL_COMPAT_MAP = babelCompatMap

export const DEFAULT_BROWSER_SCORE_MAP = browserScoreMap

export const DEFAULT_NODE_VERSION_SCORE_MAP = nodeVersionScoreMap
