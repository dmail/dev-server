const { bundleNode } = require("@jsenv/core")
const { projectFolder } = require("../../jsenv.config.js")

bundleNode({
  projectFolder,
  babelConfigMap: {},
  compileGroupCount: 1,
})
