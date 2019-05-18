const { execute, launchNode } = require("@jsenv/core")
const { projectFolder } = require("../../jsenv.config.js")
const { getFromProcessArguments } = require("./getFromProcessArguments.js")

const filenameRelative = getFromProcessArguments("file").replace(/\\/g, "/")

execute({
  projectFolder,
  launch: launchNode,
  fileRelativePath: `/${filenameRelative}`,
  mirrorConsole: true,
})
