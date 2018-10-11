import { openCompileServer } from "../openCompileServer/openCompileServer.js"
import { openNodeClient } from "../openNodeClient/openNodeClient.js"
import { openChromiumClient } from "../openChromiumClient/openChromiumClient.js"

export const run = ({
  root = process.cwd(),
  file,
  port = 0,
  platform = "node",
  headless = false,
  // when watching, if we control how the code runs we need the sse service
  // in case an external client connects to our server
  // but we mainly need node to listen for file change
  // so that we can reexecute code inside chromium or nodejs
  // from here
  // for nodejs we would kill the child and restart an other one
  // for chromium we kill it too and restart a new one to execute our code inside it
  watch = false,
  instrument = false,
}) => {
  const relativeFile = file

  const openServer = () => {
    return openCompileServer({
      root,
      into: "build",
      url: `http://127.0.0.1:0${port}`, // avoid https for now because certificates are self signed
      instrument,
      watch,
    })
  }

  const createClient = (server) => {
    if (platform === "node") {
      return openNodeClient({
        compileURL: server.compileURL,
        localRoot: root,
        detached: true,
        // remoteRoot: "http://127.0.0.1:3001",
      })
    }
    if (platform === "chromium") {
      return openChromiumClient({
        url: `http://127.0.0.1:0${port}`, // force http for now
        server,
        compileURL: server.compileURL,
        headless,
        mirrorConsole: true,
      })
    }
  }

  return openServer().then((server) => {
    console.log(`server listening at ${server.url}`)
    return createClient(server)
      .then((client) => {
        return client.execute({
          file: relativeFile,
          collectCoverage: instrument,
        })
      })
      .then(() => {
        if (watch === false) {
          // server.close()
        }
      })
  })
}
