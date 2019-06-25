# coverage

This feature is provided by `@jsenv/core` which exports a function called `cover`.<br />

Before reading this documentation, be sure to read the [testing](../testing/testing.md) documentation because coverage relies on it.<br />
`cover` is capable to generate your project coverage in json format and a bit more.

![browsing coverage recording](./coverage-browsing-recording.gif)

This documentation explains how to use `cover` inside a project.

## How to use

`cover` is like `test` except it will collect coverage of your tests.<br />
— see [how to use test](../testing/testing.md#how-to-use)

### How to use `cover` to generate your project coverage

Once you have used `test` once, it becomes easy to use `cover`.

1. Create a script capable to generate your project coverage.<br />

`root/generate-coverage.js`

```js
const { launchChromium, launchNode, cover } = require("@jsenv/core")

cover({
  projectPath: __dirname,
  coverDescription: {
    "/src/**/*.js": true,
  },
  executeDescription: {
    "/test/*.test.js": {
      browser: {
        launch: launchChromium,
      },
      node: {
        launch: launchNode,
      },
    },
    "/test/*.test.browser.js": {
      browser: {
        launch: launchChromium,
      },
    },
    "/test/*.test.node.js": {
      node: {
        launch: launchNode,
      },
    },
  },
  writeCoverageHtmlFolder: true,
})
```

2. Run `root/generate-coverage.js` you just created

```shell
node ./generate-coverage.js
```

It will execute tests and generate `root/coverage/coverage-final.json`.

3. Open `root/coverage/index.html` in a browser

The gif on top of this document illustrates this part.<br />
`root/coverage/index.html` and associated files will be generated only if you pass `writeCoverageHtmlFolder` to true.<br />
As you can see in the gif, starting from `index.html` page you can explore your project coverage.

4. Do something with `root/coverage/coverage-final.json`.

At this point you have a `root/coverage/coverage-final.json` file. You can pass it to a code coverage tool and get valuable information from it.<br />

It's important to know that `coverage-final.json` format comes from `instanbul`.<br />
— see [istanbul on github](https://github.com/gotwarlost/istanbul)

The most valuable things to do with that file is to feed it to some code coverage tool during your continuous integration script.
I have documented one of them named `codecov.io` but you can integrate with pretty much anything else.<br />
— see [uploading coverage to codecov.io](./uploading-coverage-to-codecov.md)

## `cover` options

### coverDescription

Default value:

```json
{
  "/index.js": true,
  "/src/**/*.js": true,
  "/**/*.test.*": false,
  "/**/test/": false
}
```

coverDescription describes the file of your project that should be covered.<br />
By default, `cover` generates empty coverage for every file that must be covered but is actually never imported by a test file.<br />

default coverDescription means:

- `/index.js` must be covered
- any file inside `/src/` ending by `.js` must be covered.
- any file containing `.test.` does not have to be covered.
- any file inside a `/test/` does not have to be covered.

This option internally uses path matching provided by `dmail/project-structure`.<br />
— see [project structure on github](https://github.com/dmail/project-structure)

### writeCoverageFile

Default value:

```js
true
```

When true, `cover` will write a json file describing your project coverage.

### logCoverageFilePath

Default value:

```js
true
```

When true, if writeCoverageFile option is true as well, `cover` logs path of the coverage file after it is written.

### coverageRelativePath

Default value:

```js
"/coverage/coverage-final.json"
```

If writeCoverageFile option is true, `cover` write the file here.

### generateMissedCoverage

Default value:

```js
true
```

When true, `cover` will generate an empty coverage for every file present in coverDescription options but never imported by test files.

### executeDescription

— see [test documentation for executeDescription](../testing/testing.md#executedescription)

### defaultAllocatedMsPerExecution

— see [test documentation for defaultAllocatedMsPerExecution](../testing/testing.md#defaultallocatedmsperexecution)

### maxParallelExecution

— see [test documentation for maxParallelExecution](../testing/testing.md#maxparallelexecution)

### measureDuration

— see [test documentation for measureDuration](../testing/testing.md#measureduration)

### captureConsole

— see [test documentation for captureConsole](../testing/testing.md#captureconsole)

### projectPath

— see [generic documentation for projectPath](../shared-options/shared-options.md#projectpath)

### babelPluginMap

— see [generic documentation for babelPluginMap](../shared-options/shared-options.md#babelpluginmap)

### importMapRelativePath

— see [generic documentation for importMapRelativePath](../shared-options/shared-options.md#importmaprelativepath)

### compileIntoRelativePath

— see [generic documentation for compileIntoRelativePath](../shared-options/shared-options.md#compileintorelativepath)

# End

You've reached the end of this documentation, congrats for scrolling so far.<br />
Let me suggest you to:

- take a break, reading doc or scrolling can be exhausting :)
- [go back to readme](../../README.md#how-to-use)
- [go to next doc on bundling](../bundling/bundling.md)

If you noticed issue in this documentation, you're very welcome to open [an issue](https://github.com/jsenv/jsenv-core/issues). I would love you even more if you [create a pull request](https://github.com/jsenv/jsenv-core/pulls) to suggest an improvement.
