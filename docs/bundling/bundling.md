# bundling

This feature is provided by `@jsenv/core` which exports three functions called `generateGlobalBundle`, `generateCommonJsBundle` and `generateSystemJsBundle`<br />

These function will transform your files to allow different environment to run your code.

This documentation explains how to use these three bundling functions inside a project.

## How to use

Using a basic project setup we'll see how to use every bundling function to generate different bundles.

### Basic project setup

1. Create a file structure like this one

```
root/
  index.js
  package.json
```

`root/index.js`

```js
export default 42
```

`root/package.json`

```json
{
  "name": "whatever"
}
```

2. Install `@jsenv/core`

```shell
npm install --save-dev @jsenv/core
```

3. Generate `root/importMap.json`

```shell
npm install --save-dev @jsenv/node-module-import-map
node -e "require('@jsenv/node-module-import-map').generateImportMapForProjectNodeModules({ projectPath: process.cwd() });"
```

## Generate global bundle for that basic project

1. Create a script generating a global bundle

`root/generate-global-bundle.js`

```js
const { generateGlobalBundle } = require("@jsenv/core")

generateGlobalBundle({
  projectPath: __dirname,
  globalName: "__whatever__",
})
```

2. Run `root/generate-global-bundle.js` you just created

```shell
node ./generate-global-bundle.js
```

Once done, terminal will contain a log with the path to the generated bundle.<br />
`/root/dist/global/main.js` content would look like this:

```js
var __whatever__ = (function() {
  return 42
})()
//# sourceMappingURL=./main.js.map
```

## Generate commonjs bundle for that basic project

1. Create a script generating a commonjs bundle

`root/generate-commonjs-bundle.js`

```js
const { generateCommonJsBundle } = require("@jsenv/core")

generateCommonJsBundle({
  projectPath: __dirname,
})
```

2. Run `root/generate-commonjs-bundle.js` you just created

```shell
node ./generate-commonjs-bundle.js
```

Once done, terminal will contain a log with the path to the generated bundle.<br />
`/root/dist/commonjs/main.js` content would look like this:

```js
module.exports = 42
//# sourceMappingURL=main.js.map
```

## Generate systemjs bundle for that basic project

1. Create a script generating a systemjs bundle

`root/generate-systemjs-bundle.js`

```js
const { generateSystemJsBundle } = require("@jsenv/core")

generateSystemJsBundle({
  projectPath: __dirname,
})
```

2. Run `root/generate-systemjs-bundle.js` you just created

```shell
node ./generate-systemjs-bundle.js
```

Once done, terminal will contain a log with the path to the generated bundle.<br />
`/root/dist/systemjs/main.js` content would look like this:

```js
System.register([], function(exports) {
  return {
    execute: function() {
      exports("default", 42)
    },
  }
})
//# sourceMappingURL=main.js.map
```

### Bundling functions options

The following options are shared by `generateGlobalBundle`, `generateCommonJsBundle` and `generateSystemJsBundle`.

### entryPointMap

```js
const { generateSystemJsBundle } = require("@jsenv/core")

generateSystemJsBundle({
  projectPath: "/Users/you/folder",
  entryPointMap: {
    main: "index.js",
    private: "/src/privateIndex.js",
  },
})
```

It is an object describing your project entry points.<br />
Example above shows a project having two entry point.

If you don't pass this option, the default value will be:

```json
{
  "main": "index.js"
}
```

The default value assumes you have only one entry point which is `index.js`.

### minify

```js
const { generateSystemJsBundle } = require("@jsenv/core")

generateSystemJsBundle({
  projectPath: "/Users/you/folder",
  minify: true,
})
```

When true, generated bundle files content are minified.

If you don't pass this option, the default value will be:

```js
false
```

### bundleIntoRelativePath

```js
const { generateSystemJsBundle } = require("@jsenv/core")

generateSystemJsBundle({
  projectPath: "/Users/you/folder",
  bundleIntoRelativePath: "/whatever/systemjs",
})
```

It is a relative path to a folder where the bundle files will be written.

- `generateGlobalBundle` default value:

```js
"/dist/global"
```

- `generateCommonJsBundle` default value:

```js
"/dist/commonjs"
```

- `generateSystemJsBundle` default value:

```js
"/dist/systemjs"
```

### projectPath

— see [generic documentation for projectPath](../shared-options/shared-options.md#projectpath)

### babelPluginMap

— see [generic documentation for babelPluginMap](../shared-options/shared-options.md#babelpluginmap)

### importMapRelativePath

— see [generic documentation for importMapRelativePath](../shared-options/shared-options.md#importmaprelativepath)

## `generateGlobalBundle` options

`generateGlobalBundle` got one specific option called `globalName`.<br />

### globalName

This option is required, it is the globalName that will contain your exports.<br />
Passing `"__whatever__"` means generated bundle will write your exports under `window.__whatever__`.

# End

You've reached the end of this documentation, congrats for scrolling so far.<br />
Let me suggest you to:

- take a break, reading doc or scrolling can be exhausting :)
- [go back to readme](../../README.md#how-to-use)

If you noticed issue in this documentation, you're very welcome to open [an issue](https://github.com/jsenv/jsenv-core/issues). I would love you even more if you [create a pull request](https://github.com/jsenv/jsenv-core/pulls) to suggest an improvement.
