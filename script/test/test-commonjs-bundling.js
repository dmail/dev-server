const { test } = require("@jsenv/testing")
const { launchNode } = require("@jsenv/node-launcher")
const { projectPath } = require("../../jsenv.config.js")

test({
  projectPath,
  executeDescription: {
    "/test/generateCommonJsBundle/**/*.test.js": {
      node: {
        launch: launchNode,
      },
    },
    "/test/generateCommonJsBundleForNode/**/*.test.js": {
      node: {
        launch: launchNode,
      },
    },
  },
})
