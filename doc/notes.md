To be tested:

- create an other project not using jsenv and using
  @jsenv/sample-project-client
  it must be able to use the node or browser bundle

- move dev-server to jsenv/jsenv-core
  the npm package will be named @jsenv/core

- test how dev-server behaves if you import a dependency
  written in commonjs

- travis work as expected

- consider creating a repo like jsenv/standard-babel-plugin-description
  instead of depending on project-structure-compile-babel
  it would do this mostly:

  ```js
  const proposalAsyncGeneratorFunction = require("@babel/proposal-async-generator-functions")
  const standardBabelPluginDescription = {
    "proposal-async-generator-functions": [proposalAsyncGeneratorFunction, {}],
  }
  exports.standardBabelPluginDescription = standardBabelPluginDescription
  ```

- having to require the importMap.json everywhere is kinda annoying
  and having to run generate-import-map after any npm i could be annoying too. It's also error prone.
  The thing is that you should be able to trust what you pass
  and not automagically generate importMap for node_modules.
  Also jsenv-eslint-import-resolver is watching importMap.json
  it needs it.
  Moreover later you may want to generate more stuff inside importMap.json from a webpack config or whatever.
