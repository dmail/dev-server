# projectPath

This option is always required.<br />
It must lead to a folder that will be considered as the root of your project. All relative path will be relative to this projectPath option.

## projectPath example

```js
const projectPath = "/Users/dmail/project"
```

Note: on windows you would pass `C:\Users\dmail\project`, jsenv is compatible with that.

# babelPluginMap

Default value:

```js
const { jsenvBabelPluginMap } = require("@jsenv/babel-plugin-map")
```

The default value comes from https://github.com/jsenv/jsenv-babel-plugin-map.<br />
`babelPluginMap` is an object describing all babel plugin required by your project.<br />
jsenv does not work with babel config files like `.babelrc` because it needs to know the list of babel plugin you want to use.

## babelPluginMap example

jsenv is meant to run regular JavaScript. `babelPluginMap` can be extended to make it compatible with `jsx` for instance.

```js
const { jsenvBabelPluginMap } = require("@jsenv/babel-plugin-map")
const transformReactJSX = require("@babel/plugin-transform-react-jsx")

const babelPluginMap = {
  ...jsenvBabelPluginMap,
  "transform-react-jsx": [transformReactJSX, { pragma: "dom" }],
}
```

# importMapRelativePath

Default value:

```js
"/importMap.json"
```

`importMap.json` files are used to remap your import. The presence of this file is optionnal.<br />

You should read documentation on importMap to understand how jsenv uses this file. It is important because `importMap.json` is mandatory as soon as your project relies on node module resolution to find a file.<br />
— see [importMap documentation](../import-map/import-map.md)

# compileIntoRelativePath

Default value:

```js
"/.dist"
```

This folder is used to cache the compiled files. Every time a file is compiled, the compiled version of the file is written into that folder alongside with some metadata to be able to invalidate the cache.
