# Table of contents

- [projectDirectoryUrl](#projectDirectoryUrl)
- [importDefaultExtension](#importDefaultExtension)
- [babelPluginMap](#babelPluginMap)
- [customCompilers](#customCompilers)
- [compileServerLogLevel](#compileServerLogLevel)
- [compileServerProtocol](#compileServerProtocol)
- [compileServerPrivateKey](#compileServerPrivateKey)
- [compileServerCertificate](#compileServerCertificate)
- [compileServerIp](#compileServerIp)
- [compileServerPort](#compileServerPort)
- [jsenvDirectoryRelativeUrl](#jsenvDirectoryRelativeUrl)

# projectDirectoryUrl

`projectDirectoryUrl` parameter is a string leading to your project directory. This parameter is **required**, an example value could be `"file:///Users/you/project"`. All parameter containing `relativeUrl` in their name are resolved against `projectDirectoryUrl`. An URL string, URL object, windows file path, linux/mac file path can be used as `projectDirectoryUrl` value.

<!-- prettier-ignore -->
```js
"file:///Users/you/project" // URL string
new URL("file:///Users/you/project") // URL object
"/Users/you/project" // linux/mac file path
"C:\\Users\\you\\project" // windows file path
```

If your node version is 13+ and your `package.json` contains `"type": "module"` it's preferrable to use [import.meta.url](https://nodejs.org/docs/latest-v13.x/api/esm.html#esm_import_meta) and url resolution to compute `projectDirectoryUrl`.

```js
const projectDirectoryUrl = new URL("./", import.meta.url)
```

Otherwise use [\_\_dirname](https://nodejs.org/docs/latest/api/modules.html#modules_dirname) and path resolution to compute `projectDirectoryUrl`.

```js
const { resolve } = require("path")

const projectDirectoryUrl = resolve("../", __dirname)
```

Please note you can put a trailing slash in `projectDirectoryUrl` value if you want.

# importDefaultExtension

_importDefaultExtension_ is a boolean or string parameter controlling if an extension is added to import without any. This parameter is optional and disabled by default.

| Value           | Effect                                                    |
| --------------- | --------------------------------------------------------- |
| false (default) | Import without extension behaves normally                 |
| true            | Import without extension inherits extension from the file |
| a string        | The string is appended to import without extension        |

Expecting a tool to add an extension introduces complexity and makes your code dependent on magic extensions configuration.
This parameter only adds an extension on extensionless import, it cannot try different extension and choose the right one.

# babelPluginMap

`babelPluginMap` parameter is an object describing all babel plugin used by your project. This parameter is optionnal with a default value enabling standard babel plugins. See [src/jsenvBabelPluginMap.js](../src/jsenvBabelPluginMap.js). If you want to make jsenv compatible with non standard syntaxes you can use your own `babelPluginMap`. For instance, the following code makes jsenv compatible with `jsx`.

```js
const { jsenvBabelPluginMap } = require("@jsenv/core")
const transformReactJSX = require("@babel/plugin-transform-react-jsx")

const babelPluginMap = {
  ...jsenvBabelPluginMap,
  "transform-react-jsx": [transformReactJSX, { pragma: "dom" }],
}
```

Please note that if you have a `.babelrc` file, jsenv will not read it. jsenv needs to know the list of babel plugin you want to use in an explicit way.

# customCompilers

`customCompilers` parameter is an object describing how file should be compiled. This parameter is optionnal with a default value of `{}`. The default value means all your project files uses standard files and nothing needs to be compiled.

But if your code or some of your dependencies use an other format you need to convert it using this parameter. For instance, the following code makes jsenv compatible with `react`.

```js
import { commonJsToJavaScriptModule } from "@jsenv/core"

const customCompilers = {
  "./node_modules/react/index.js": commonJsToJavaScriptModule,
}
```

# compileServerLogLevel

`compileServerLogLevel` parameter is a string controlling verbosity of the compile server. This parameter is optional with a default value of `"info"`. For more information check https://github.com/jsenv/jsenv-server/tree/362b3aded656525569c9a3dbb50d8c43647d7a1b#loglevel.

# compileServerProtocol

`compileServerProtocol` parameter is a string controlling the protocol used by jsenv compile server. This parameters is optional with a default value of `"https"`. For more information check https://github.com/jsenv/jsenv-server/tree/362b3aded656525569c9a3dbb50d8c43647d7a1b#protocol.

# compileServerPrivateKey

`compileServerPrivateKey` parameter is a string containing a privateKey that will be used for https encryption. This parameter is optional. For more information check https://github.com/jsenv/jsenv-server/tree/362b3aded656525569c9a3dbb50d8c43647d7a1b#privatekey.

# compileServerCertificate

`compileServerCertificate` parameter is a string containing a certificate that will be used for https encryption. This parameter is optional. For more information check https://github.com/jsenv/jsenv-server/tree/362b3aded656525569c9a3dbb50d8c43647d7a1b#certificate.

# compileServerIp

`compileServerIp` parameter is a string controlling the ip jsenv compile server will listen to. This parameter is optional with a default value of `"0.0.0.0"`. For more information check https://github.com/jsenv/jsenv-server/tree/362b3aded656525569c9a3dbb50d8c43647d7a1b#ip.

# compileServerPort

`compileServerPort` parameter is a number controlling the port jsenv compile server will listen to. This parameter is optional with a default value of `0` meaning a random available port will be used. For more information check https://github.com/jsenv/jsenv-server/tree/362b3aded656525569c9a3dbb50d8c43647d7a1b#port.

# jsenvDirectoryRelativeUrl

`jsenvDirectoryRelativeUrl` parameter is a string leading to a directory used by jsenv to write compiled version of your files. This parameter is optional with a default value of `"./.jsenv/"`. Every time a file is compiled, the compiled version of the file is written into that directory. Alongside with the compiled file, some metadata on the source used to generate the compiled version is written. These metadata are used later to know if the compiled version is still valid. This directory should be added to your `.gitignore`.
