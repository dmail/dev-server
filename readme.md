# core

Execute JavaScript on multiple environments for testing.

[![github package](https://img.shields.io/github/package-json/v/jsenv/jsenv-core.svg?logo=github&label=package)](https://github.com/jsenv/jsenv-core/packages)
[![npm package](https://img.shields.io/npm/v/@jsenv/core.svg?logo=npm&label=package)](https://www.npmjs.com/package/@jsenv/core)
[![github ci](https://github.com/jsenv/jsenv-core/workflows/ci/badge.svg)](https://github.com/jsenv/jsenv-core/actions?workflow=ci)
[![codecov coverage](https://codecov.io/gh/jsenv/jsenv-core/branch/master/graph/badge.svg)](https://codecov.io/gh/jsenv/jsenv-core)

# Table of contents

- [Presentation](#Presentation)
- [Example](#Example)
- [Installation](#Installation)
- [Configuration](#Configuration)
  - [jsenv.config.js](#jsenvconfigjs)
  - [CommonJS](#CommonJS)
  - [React](#React)
  - [TypeScript](#TypeScript)
- [Advanced features](#Advanced-features)

# Presentation

`@jsenv/core` is a test runner.

![test execution terminal screenshot](./docs/testing/main-example-terminal-screenshot.png)

It focuses on executing many JavaSripts files in parallel and report how it goes.

It's main strength are:

- Rely on standard JavaScript
- Can execute file in browsers (chromium, firefox, webkit)
- Can execute file in Node.js
- Can be configured to run jsx, typescript and more
- Can generate coverage from all file executions
- Rely on top level await to test asynchronous code

# Example

> In reality you would never test `Math.max`, the code below is testing it to show an example unrelated to a specific codebase.

`Math.max.test.js`

```js
const actual = Math.max(2, 4)
const expected = 4
if (actual !== expected) {
  throw new Error(`Math.max(2, 4) should return ${expected}, got ${actual}`)
}
```

`execute-test-plan.js`

```js
import { executeTestPlan, launchNode, launchChromiumTab } from "@jsenv/core"

executeTestPlan({
  projectDirectoryUrl: new URL("./", import.meta.url),
  testPlan: {
    "./**/*.test.js": {
      chromium: {
        launch: launchChromiumTab,
      },
      node: {
        launch: launchNode,
      },
    },
  },
})
```

```console
node ./execute-test-plan.js
```

![test execution terminal screenshot](./docs/testing/main-example-terminal-screenshot.png)

See [testing](./docs/testing/readme.md) documentation for more.

# Installation

```console
npm install --save-dev @jsenv/core
```

`@jsenv/core` is tested on Mac, Windows, Linux on Node.js 13.12.0. Other operating systems and Node.js versions are not tested.

> Jsenv should be compatible with node 12.8 and above but it's no longer guaranteed.

# Configuration

Jsenv can execute standard JavaScript without additional configuration. It means Jsenv support [JavaScript Modules](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Modules), destructuring, optional chaining and so on by default.

Jsenv can be configured to be compatible with non-standard JavaScript. For instance using [CommonJS modules](https://code-trotter.com/web/understand-the-different-javascript-modules-formats/#commonjs-cjs), [JSX](https://reactjs.org/docs/introducing-jsx.html) or [TypeScript](https://www.typescriptlang.org).

> Keep in mind one of your dependency may use non-standard JavaScript.

## jsenv.config.js

We recommend to regroup Jsenv configuration in a `jsenv.config.js` file at the root of your working directory.

To get a better idea see [jsenv.config.js](./jsenv.config.js). The file is imported by [script/test/test.js](./script/test/test.js). This technic uses simple and standard import export. It helps to see jsenv custom configuration quickly and share it between files.

That being said it's only a recommendation. Jsenv do not enforce any specific file structure.

## CommonJS

CommonJS module format is not standard JavaScript. Using it requires some configuration. The following `jsenv.config.js` makes Jsenv compatible with a package written in CommonJS (`module.exports` and `require`).

```js
import { jsenvBabelPluginMap, convertCommonJsWithRollup } from "@jsenv/core"

export const convertMap = {
  "./node_modules/whatever/index.js": convertCommonJsWithRollup,
}
```

## React

React is written in CommonJS and comes with JSX. If you use them it requires some configuration. The following `jsenv.config.js` enables react and JSX.

```js
import { createRequire } from "module"
import { jsenvBabelPluginMap, convertCommonJsWithRollup } from "@jsenv/core"

const require = createRequire(import.meta.url)
const transformReactJSX = require("@babel/plugin-transform-react-jsx")

export const babelPluginMap = {
  ...jsenvBabelPluginMap,
  "transform-react-jsx": [
    transformReactJSX,
    { pragma: "React.createElement", pragmaFrag: "React.Fragment" },
  ],
}

export const convertMap = {
  "./node_modules/react/index.js": convertCommonJsWithRollup,
  "./node_modules/react-dom/index.js": (options) => {
    return convertCommonJsWithRollup({ ...options, external: ["react"] })
  },
}
```

See also

- [babelPluginMap](./docs/shared-parameters.md#babelPluginMap)
- [convertMap](./docs/shared-parameters.md#convertMap)
- [transform-react-jsx on babel](https://babeljs.io/docs/en/next/babel-plugin-transform-react-jsx.html)

## TypeScript

TypeScript is a subset of JavaScript, it requires some configuration if you use it. The following `jsenv.config.js` enable TypeScript.

```js
import { createRequire } from "module"
import { jsenvBabelPluginMap } from "@jsenv/core"

const require = createRequire(import.meta.url)
const transformTypeScript = require("@babel/plugin-transform-typescript")

export const babelPluginMap = {
  ...jsenvBabelPluginMap,
  "transform-typescript": [transformTypeScript, { allowNamespaces: true }],
}
```

See also

- [babelPluginMap](./docs/shared-parameters.md#babelPluginMap)
- [transform-typescript on babel](https://babeljs.io/docs/en/next/babel-plugin-transform-typescript.html)

# Advanced features

`@jsenv/core` can execute standard JavaScript and be configured to run non-standard JavaScript. This can be reused for more than executing test files:

- [Exploring](./docs/exploring/readme.md):
  Start a development server to execute any file, comes with livereloading without configuration.

- [Executing](./docs/executing/readme.md):
  Execute one JavaScript file in a browser or Node.js, can be used to debug within VS Code.

- [Bundling](./docs/bundling/readme.md):
  Generate bundles compatible with browsers and Node.js.
