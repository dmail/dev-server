const { test } = require("@jsenv/testing")
const { launchNode } = require("@jsenv/node-launcher")
const { projectPath } = require("../../jsenv.config.js")

test({
  projectPath,
  executeDescription: {
    "/test/generateSystemJsBundle/**/*.test.js": {
      node: {
        launch: launchNode,
      },
    },
  },
})
