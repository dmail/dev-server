const { configToMetaMap } = require("@dmail/project-structure")
const {
  pluginOptionMapToPluginMap,
  pluginMapToPluginsForPlatform,
} = require("@dmail/project-structure-compile-babel")
const structureConfig = require("./structure.config.js")

const pluginMap = pluginOptionMapToPluginMap({
  "transform-modules-commonjs": {},

  "proposal-json-strings": {},
  "proposal-object-rest-spread": {},
  "proposal-optional-catch-binding": {},
  "proposal-unicode-property-regex": {},
  "transform-arrow-functions": {},
  "transform-block-scoped-functions": {},
  "transform-block-scoping": {},
  "transform-computed-properties": {},
  "transform-destructuring": {},
  "transform-dotall-regex": {},
  "transform-duplicate-keys": {},
  "transform-exponentiation-operator": {},
  "transform-function-name": {},
  "transform-literals": {},
  "transform-parameters": {},
  "transform-shorthand-properties": {},
  "transform-spread": {},
  "transform-template-literals": {},
  "transform-typeof-symbol": {},
})

const plugins = pluginMapToPluginsForPlatform(pluginMap, "node", "8.0.0")
const metaMap = configToMetaMap(structureConfig)

module.exports = {
  localRoot: __dirname,
  metaMap,
  pluginMap,
  plugins,
}
