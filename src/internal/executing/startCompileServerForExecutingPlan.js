import { startCompileServer } from "../compiling/startCompileServer.js"
import { fetchUrl } from "../fetchUrl.js"

export const startCompileServerForExecutingPlan = async ({
  // false because don't know if user is going
  // to use both node and browser
  browserPlatformAnticipatedGeneration = false,
  nodePlatformAnticipatedGeneration = false,
  ...rest
}) => {
  const compileServer = await startCompileServer(rest)

  const promises = []
  if (browserPlatformAnticipatedGeneration) {
    promises.push(
      fetchUrl(
        `${compileServer.origin}/${compileServer.outDirectoryRelativeUrl}otherwise-global-bundle/src/browserPlatform.js`,
        { ignoreHttpsError: true },
      ),
    )
  }
  if (nodePlatformAnticipatedGeneration) {
    promises.push(
      fetchUrl(
        `${compileServer.origin}/${compileServer.outDirectoryRelativeUrl}otherwise-commonjs-bundle/src/nodePlatform.js`,
        { ignoreHttpsError: true },
      ),
    )
  }

  await Promise.all(promises)

  return compileServer
}
