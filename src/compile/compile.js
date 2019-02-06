import { patternGroupToMetaMap, forEachRessourceMatching } from "@dmail/project-structure"
import { fileCopy, fileWrite } from "@dmail/helper"
import { startCompileServer } from "../server-compile/index.js"
import { fetchUsingHttp } from "../platform/node/fetchUsingHttp.js"
import {
  catchAsyncFunctionCancellation,
  createProcessInterruptionCancellationToken,
} from "../cancellationHelper.js"

export const compile = async ({
  main = "index.js",
  localRoot,
  compileInto,
  pluginMap = {},
  compileGroupCount = 1,
  pluginCompatMap,
  platformUsageMap,
  compilePatternMapping,
}) =>
  catchAsyncFunctionCancellation(async () => {
    if (typeof localRoot !== "string")
      throw new TypeError(`localRoot must be a string, got ${localRoot}`)
    if (typeof compileInto !== "string")
      throw new TypeError(`compileInto must be a string, got ${compileInto}`)
    if (typeof main !== "string") throw new TypeError(`main must be a string, got ${main}`)

    const cancellationToken = createProcessInterruptionCancellationToken()

    const metaMap = patternGroupToMetaMap({
      compile: compilePatternMapping,
    })

    const [ressourceAndCompileMetaArray, server] = await Promise.all([
      forEachRessourceMatching({
        cancellationToken,
        localRoot,
        metaMap,
        predicate: (meta) => meta.compile,
        callback: (ressource, meta) => {
          return { ressource, compileMeta: meta.compile }
        },
      }),
      startCompileServer({
        localRoot,
        compileInto,
        compileGroupCount,
        pluginMap,
        pluginCompatMap,
        platformUsageMap,
      }),
    ])

    const remoteRoot = server.origin
    const compileMapResponse = await fetchUsingHttp(`${remoteRoot}/${compileInto}/compileMap.json`)
    const compileMap = JSON.parse(compileMapResponse.body)

    await Promise.all(
      Object.keys(compileMap).map((compileId) => {
        return compileGroup({
          cancellationToken,
          ressourceAndCompileMetaArray,
          remoteRoot,
          localRoot,
          compileInto,
          compileId,
        })
      }),
    )

    server.stop()

    await fileWrite(
      `${localRoot}/${compileInto}/node-main.js`,
      generateNodeMainSource({
        compileInto,
        main,
      }),
    )
  })

const compileGroup = async ({
  // cancellationToken,
  ressourceAndCompileMetaArray,
  remoteRoot,
  localRoot,
  compileInto,
  compileId,
}) => {
  await Promise.all(
    ressourceAndCompileMetaArray.map(async ({ ressource, compileMeta }) => {
      if (compileMeta === "copy") {
        await fileCopy(
          `${localRoot}/${ressource}`,
          `${localRoot}/${compileInto}/${compileId}/${ressource}`,
        )
        return
      }

      const remoteURL = `${remoteRoot}/${compileInto}/${compileId}/${ressource}`
      // if fetch using http supported cancellation we could give it cancellationToken
      await fetchUsingHttp(remoteURL)
      return
    }),
  )
}

// importCompiledFile is not exported by @dmail/dev-server
// we need that export if we do what is below
const generateNodeMainSource = ({ compileInto, main }) => `
const path = require("path")
const { importCompiledFile } = require("@dmail/dev-server")

const compileFolder = __dirname
const rootDirname = compileFolder.slice(0, -"${compileInto}".length - 1)
const namespacePromise = importCompiledFile({
  localRoot: \`file://\${rootDirname}\`,
  remoteRoot: \`file://\${compileFolder}/\`,
  compileInto: "${compileInto}",
  file: "${main}"
})
module.exports = namespacePromise`

// we'll do browser compiled file later
// const generateBrowserMainSource = ({ globalName }) => {
//   return ``
// }
