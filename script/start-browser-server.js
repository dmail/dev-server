const { forEachRessourceMatching } = require("@dmail/project-structure")
const { pluginOptionMapToPluginMap } = require("@dmail/project-structure-compile-babel")
const { createCancellationSource } = require("@dmail/cancellation")
const { startBrowserServer } = require("../dist/src/server-browser/index.js")
const { localRoot } = require("../dist/src/localRoot.js")

const pluginMap = pluginOptionMapToPluginMap({
  "transform-modules-systemjs": {},
})
const compileInto = "build"

const exec = async ({ cancellationToken }) => {
  const executableFiles = await forEachRessourceMatching({
    localRoot,
    metaMap: {
      "index.js": { js: true },
      "src/**/*.js": { js: true },
    },
    predicate: ({ js }) => js,
  })

  return startBrowserServer({
    cancellationToken,
    localRoot,
    compileInto,
    pluginMap,
    executableFiles,
  })
}

const { cancel, token } = createCancellationSource()
exec({ cancellationToken: token })
process.on("SIGINT", () => {
  cancel("process interrupt").then(() => process.exit(0))
})
