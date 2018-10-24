import {
  pluginOptionMapToPluginMap,
  pluginMapToPluginsForPlatform,
} from "@dmail/project-structure-compile-babel"
import path from "path"

const { rollup } = require("rollup")
const babel = require("rollup-plugin-babel")
const nodeResolve = require("rollup-plugin-node-resolve")

const root = path.resolve(__dirname, "../../../")
const inputFile = `${root}/src/platform/type/browser/browserPlatform.js`
const pluginMap = pluginOptionMapToPluginMap({
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
  "transform-object-super": {},
  "transform-parameters": {},
  "transform-shorthand-properties": {},
  "transform-spread": {},
  "transform-sticky-regex": {},
  "transform-template-literals": {},
  "transform-typeof-symbol": {},
})

export const compileForBrowser = ({ name = "unknown", version = "0.0.0" } = {}) => {
  const plugins = pluginMapToPluginsForPlatform(pluginMap, name, version)

  const bundlePromise = rollup({
    input: inputFile,
    plugins: [
      nodeResolve({
        module: true,
      }),
      babel({
        babelrc: false,
        exclude: "node_modules/**",
        plugins,
      }),
    ],
    // skip rollup warnings
    onwarn: () => {},
  })

  return bundlePromise.then((bundle) => {
    return bundle.generate({
      format: "iife",
      name: "__browserPlatform__",
      sourcemap: true,
    })
  })
}
