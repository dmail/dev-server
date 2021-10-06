/*
 * This file is used to configure a list of babel plugins as documented in
 * https://babeljs.io/docs/en/presets
 *
 * This list of babel plugins is meant to be used in project using jsenv.
 *
 * Jsenv decides to use a subset of babel plugins with the following logic:
 * - During dev babel plugins natively supported by browsers and Node.js are not used.
 * - During build:
 *   - When "runtimeSupport" is configured, babel plugins already supported by these runtime won't be used
 *     See https://github.com/jsenv/jsenv-template-pwa/blob/main/jsenv.config.mjs#L12
 *   - Otherwise all babel plugins are used
 */

module.exports = (
  api,
  {
    // pass false if your codebase never uses generators
    generators = true,
    // pass false if your codebase never uses async generators
    asyncGenerators = true,
  } = {},
) => {
  const plugins = []

  // The default list of babel plugins MUST be in compatMap
  // https://github.com/jsenv/jsenv-core/blob/master/src/internal/generateGroupMap/jsenvBabelPluginCompatMap.js#L11
  // Otherwise it means there is no runtime supporting the babel plugins
  // and the compilation is always required
  plugins.push(
    require("@babel/plugin-proposal-numeric-separator"),
    require("@babel/plugin-proposal-json-strings"),
    require("@babel/plugin-proposal-object-rest-spread"),
    require("@babel/plugin-proposal-optional-catch-binding"),
    require("@babel/plugin-proposal-optional-chaining"),
    require("@babel/plugin-proposal-unicode-property-regex"),
    (...args) => {
      // enforce babel-plugin-transform-async-to-promises to return a name
      // so that when jsenv uses loadOptionsFromFile it can know which babel plugin
      // we are talking about
      const transformAsyncToPromisesFactory = require("babel-plugin-transform-async-to-promises")
      const transformAsyncToPromises = transformAsyncToPromisesFactory(...args)
      return {
        name: "transform-async-to-promises",
        ...transformAsyncToPromises,
      }
    },
    require("@babel/plugin-transform-arrow-functions"),
    require("@babel/plugin-transform-block-scoped-functions"),
    require("@babel/plugin-transform-block-scoping"),
    require("@babel/plugin-transform-classes"),
    require("@babel/plugin-transform-computed-properties"),
    require("@babel/plugin-transform-destructuring"),
    require("@babel/plugin-transform-dotall-regex"),
    require("@babel/plugin-transform-duplicate-keys"),
    require("@babel/plugin-transform-exponentiation-operator"),
    require("@babel/plugin-transform-for-of"),
    require("@babel/plugin-transform-function-name"),
    require("@babel/plugin-transform-literals"),
    require("@babel/plugin-transform-new-target"),
    require("@babel/plugin-transform-object-super"),
    require("@babel/plugin-transform-parameters"),
  )

  if (generators || asyncGenerators) {
    plugins.push([
      require("@babel/plugin-transform-regenerator"),
      {
        asyncGenerators,
        generators,
        async: false,
      },
    ])
  }

  plugins.push(
    require("@babel/plugin-transform-shorthand-properties"),
    require("@babel/plugin-transform-spread"),
    require("@babel/plugin-transform-sticky-regex"),
    require("@babel/plugin-transform-template-literals"),
    require("@babel/plugin-transform-typeof-symbol"),
    require("@babel/plugin-transform-unicode-regex"),
  )

  return { plugins }
}
