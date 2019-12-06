# Table of contents

- [Shared bundling parameters](#shared-bundling-parameters)
  - [bundleDirectoryRelativeUrl](#bundleDirectoryRelativeUrl)
  - [entryPointMap](#entryPointMap)
  - [minify](#minify)
  - [projectDirectoryUrl](#projectDirectoryUrl)
  - [babelPluginMap](#babelPluginMap)
  - [convertMap](#convertMap)
  - [importMapFileRelativeUrl](#importMapFileRelativeUrl)
  - [importDefaultExtension](#importDefaultExtension)
- [generateSystemJsBundle](#generateSystemJsBundle)
- [generateGlobalBundle](#generateglobalbundle)
  - [globalName](#globalName)
- [generateCommonJsBundle](#generateCommonJsBundle)
- [generateCommonJsBundleForNode](#generateCommonJsBundleForNode)
- [Balancing](#balancing)

## Shared bundling parameters

Some parameters are available to all function generating bundles.
These parameters documentation is shared in this section.

### bundleDirectoryRelativeUrl

> `bundleDirectoryRelativeUrl` is a string leading to a directory where bundle files are written.

This parameter is optional with a default value specific to each bundling function:

- Default for `generateGlobalBundle`:

  ```js
  "./dist/global/"
  ```

- Default for `generateCommonJsBundle` and `generateCommonJsBundleForNode`:

  ```js
  "./dist/commonjs/"
  ```

- Default for `generateSystemJsBundle`:

  ```js
  "./dist/systemjs/"
  ```

### entryPointMap

> `entryPointMap` is an object describing your project entry points. A dedicated bundle is generated for each entry.

This parameter is optional with a default value of:

```json
{
  "main": "./index.js"
}
```

The default value assumes you have only one entry point which is `index.js`.<br />

### minify

> `minify` is a boolean controlling if bundle content will be minified to save bytes.

This parameter is optional with a default value of

```js
false
```

### projectDirectoryUrl

— see [generic documentation for projectDirectoryUrl](../shared-parameters/shared-parameters.md#projectDirectoryUrl)

### babelPluginMap

— see [generic documentation for babelPluginMap](../shared-parameters/shared-parameters.md#babelPluginMap)

### convertMap

— see [generic documentation for convertMap](../shared-parameters/shared-parameters.md#convertMap)

### importMapFileRelativeUrl

— see [generic documentation for importMapFileRelativeUrl](../shared-parameters/shared-parameters.md#importMapFileRelativeUrl)

### importDefaultExtension

— see [generic documentation for importDefaultExtension](../shared-parameters/shared-parameters.md#importDefaultExtension)

## generateSystemJsBundle

> `generateSystemJsBundle` is a function generating a systemjs bundle for your project.

Implemented in [src/generateSystemJsBundle.js](../../src/generateSystemJsBundle.js), you can use it as shown below.

```js
const { generateSystemJsBundle } = require("@jsenv/core")

generateSystemJsBundle({
  projectDirectoryUrl: __dirname,
})
```

## generateGlobalBundle

> `generateGlobalBundle` is a function generating a global bundle for your project.

Implemented in [src/generateGlobalBundle.js](../../src/generateGlobalBundle.js), you can use it as shown below.

```js
const { generateGlobalBundle } = require("@jsenv/core")

generateGlobalBundle({
  projectDirectoryUrl: __dirname,
  globalName: "__whatever__",
})
```

### globalName

> `globalName` controls what global variable will contain your entry file exports.

This is a **required** parameter, a value could be:

```js
"__whatever__"
```

Passing `"__whatever__"` means generated bundle will write your exports under `window.__whatever__`.

## generateCommonJsBundle

> `generateCommonJsBundle` is a function generating a commonjs bundle for your project.

Implemented in [src/generateCommonJsBundle.js](../../src/generateCommonJsBundle.js), you can use it as shown below.

```js
const { generateCommonJsBundle } = require("@jsenv/core")

generateCommonJsBundle({
  projectDirectoryUrl: __dirname,
})
```

## generateCommonJsBundleForNode

> `generateCommonJsBundleForNode` is a function generating a commonjs bundle for your project assuming it will run in your current node version.

Implemented in [src/generateCommonJsBundleForNode.js](../../src/generateCommonJsBundleForNode.js), you can use it as shown below.

```js
const { generateCommonJsBundleForNode } = require("@jsenv/core")

generateCommonJsBundleForNode({
  projectDirectoryUrl: __dirname,
  nodeMinimumVersion: "8.0.0",
})
```

### nodeMinimumVersion

> `nodeMinimumVersion` is a string representing the minimum node version your bundle will work with.

This parameter is optional with a default value of:

```js
process.version.slice(1)
```

# Balancing

If you check source code you might see some code related to a balancing concept<br />
It is not documented nor ready to be used.<br />
It's likely never going to have a use case.
