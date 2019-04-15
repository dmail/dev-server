const { bundleBrowser } = require("@jsenv/core")
const { projectFolder } = require("../../jsenv.config.js")
const { fileCopy } = require("@dmail/helper")

const SYSTEMJS_RELATIVE_PATH = "src/systemjs/s.js"

bundleBrowser({
  projectFolder,
  into: "dist/browser-client",
  entryPointMap: {
    browserClient: "src/platform/browser/browserPlatform.js",
  },
  verbose: false,
  minify: false,
})

fileCopy(
  `${projectFolder}/${SYSTEMJS_RELATIVE_PATH}`,
  `${projectFolder}/dist/browser-client/system.js`,
).then(
  () => console.log(`-> ${projectFolder}/dist/browser-client/system.js`),
  (e) =>
    setTimeout(() => {
      throw e
    }),
)
