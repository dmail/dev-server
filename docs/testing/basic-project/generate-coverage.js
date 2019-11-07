const { cover } = require("@jsenv/testing")
const { launchNode } = require("@jsenv/node-launcher")
const { launchChromium } = require("@jsenv/chromium-launcher")

cover({
  projectPath: __dirname,
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
  coverDescription: {
    "/src/**/*.js": true,
  },
  coverageHtmlReport: true,
})
