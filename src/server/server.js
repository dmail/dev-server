/* eslint-disable import/max-dependencies */
import { createServer as createNodeServer, STATUS_CODES } from "http"
import { createServer as createNodeSecureServer, Agent as SecureAgent } from "https"
import { URL } from "url"
import { memoizeOnce } from "/node_modules/@dmail/helper/index.js"
import {
  createCancellationToken,
  createOperation,
  createStoppableOperation,
} from "/node_modules/@dmail/cancellation/index.js"
import {
  registerProcessInterruptCallback,
  registerUnadvisedProcessCrashCallback,
  registerUngaranteedProcessTeardown,
} from "../process-signal/index.js"
import { trackConnections, trackClients, trackRequestHandlers } from "./trackers.js"
import { nodeRequestToRequest } from "./nodeRequestToRequest.js"
import { populateNodeResponse } from "./populateNodeResponse.js"
import { colorizeResponseStatus } from "./colorizeResponseStatus.js"

const killPort = import.meta.require("kill-port")

const REASON_NOT_SPECIFIED = "not specified"
const REASON_INTERNAL_ERROR = "internal error"

export const originAsString = ({ protocol, ip, port }) => {
  const url = new URL("https://127.0.0.1:80")
  url.protocol = protocol
  url.hostname = ip
  url.port = port
  return url.origin
}

export const startServer = async ({
  cancellationToken = createCancellationToken(),
  protocol = "http",
  ip = "127.0.0.1",
  port = 0, // aasign a random available port
  forcePort = false,
  // when port is https you must provide { privateKey, certificate } under signature
  signature,
  stopOnSIGINT = true,
  // auto close the server when the process exits
  stopOnExit = true,
  // auto close when server respond with a 500
  stopOnError = true,
  // auto close the server when an uncaughtException happens
  stopOnCrash = false,
  requestToResponse = () => null,
  verbose = true,
  startedMessage = ({ origin }) => `server started at ${origin}`,
  stoppedMessage = (reason) => `server stopped because ${reason}`,
} = {}) => {
  if (port === 0 && forcePort) throw new Error(`no need to pass forcePort when port is 0`)
  if (protocol !== "http" && protocol !== "https")
    throw new Error(`protocol must be http or https, got ${protocol}`)
  // https://github.com/nodejs/node/issues/14900
  if (ip === "0.0.0.0" && process.platform === "win32")
    throw new Error(`listening ${ip} not available on window`)

  const log = (...args) => {
    if (verbose) {
      console.log(...args)
    }
  }

  if (forcePort) {
    await createOperation({
      cancellationToken,
      start: () => killPort(port),
    })
  }

  const { nodeServer, agent } = getNodeServerAndAgent({ protocol, signature })

  let status = "starting"

  const { registerCleanupCallback, cleanup } = createTracker()

  const connectionTracker = trackConnections(nodeServer)
  // opened connection must be shutdown before the close event is emitted
  registerCleanupCallback(connectionTracker.stop)

  const clientTracker = trackClients(nodeServer)
  registerCleanupCallback((reason) => {
    let responseStatus
    if (reasonIsInternalError(reason)) {
      responseStatus = 500
      // reason = 'shutdown because error'
    } else {
      responseStatus = 503
      // reason = 'unavailable because closing'
    }
    clientTracker.stop({ status: responseStatus, reason })
  })

  const requestHandlerTracker = trackRequestHandlers(nodeServer)
  // ensure we don't try to handle request while server is closing
  registerCleanupCallback(requestHandlerTracker.stop)

  let stoppedResolve
  const stopped = new Promise((resolve) => {
    stoppedResolve = resolve
  })
  const stop = memoizeOnce(async (reason = REASON_NOT_SPECIFIED) => {
    status = "closing"
    log(stoppedMessage(reason))

    await cleanup(reason)
    await listenStop(nodeServer)
    status = "stopped"
    stoppedResolve()
  })
  const startOperation = createStoppableOperation({
    cancellationToken,
    start: () => listen({ cancellationToken, server: nodeServer, port, ip }),
    stop: (_, reason) => stop(reason),
  })

  if (stopOnCrash) {
    const unregister = registerUnadvisedProcessCrashCallback((reason) => {
      stop(reason.value)
    })
    registerCleanupCallback(unregister)
  }

  if (stopOnError) {
    const unregister = requestHandlerTracker.add((nodeRequest, nodeResponse) => {
      if (nodeResponse.statusCode === 500 && reasonIsInternalError(nodeResponse.statusMessage)) {
        stop(REASON_INTERNAL_ERROR)
      }
    })
    registerCleanupCallback(unregister)
  }

  if (stopOnExit) {
    const unregister = registerUngaranteedProcessTeardown((reason) => {
      stop(`process ${reason}`)
    })
    registerCleanupCallback(unregister)
  }

  if (stopOnSIGINT) {
    const unregister = registerProcessInterruptCallback(() => {
      stop("process sigint")
    })
    registerCleanupCallback(unregister)
  }

  port = await startOperation
  status = "opened"
  const origin = originAsString({ protocol, ip, port })
  log(startedMessage({ origin }))

  // nodeServer.on("upgrade", (request, socket, head) => {
  //   // when being requested using a websocket
  //   // we could also answr to the request ?
  //   // socket.end([data][, encoding])

  //   console.log("upgrade", { head, request })
  //   console.log("socket", { connecting: socket.connecting, destroyed: socket.destroyed })
  // })

  requestHandlerTracker.add(async (nodeRequest, nodeResponse) => {
    const request = nodeRequestToRequest(nodeRequest, origin)

    nodeRequest.on("error", (error) => {
      log("error on", request.ressource, error)
    })

    let response
    try {
      const {
        status = 501,
        statusText = statusToStatusText(status),
        headers = {},
        body = "",
      } = await requestToResponse(request)
      response = Object.freeze({ status, statusText, headers, body })

      if (
        request.method !== "HEAD" &&
        response.headers["content-length"] > 0 &&
        response.body === ""
      ) {
        throw createContentLengthMismatchError(
          `content-length header is ${response.headers["content-length"]} but body is empty`,
        )
      }
    } catch (error) {
      response = Object.freeze({
        status: 500,
        statusText: REASON_INTERNAL_ERROR,
        headers: {},
        body: error && error.stack ? error.stack : error,
      })
    }

    log(`${request.method} ${request.origin}${request.ressource}`)
    log(`${colorizeResponseStatus(response.status)} ${response.statusText}`)
    populateNodeResponse(nodeResponse, response, {
      ignoreBody: request.method === "HEAD",
    })
  })

  return {
    getStatus: () => status,
    origin,
    nodeServer,
    agent,
    stop,
    stopped, // should be renamed stoppedPromise
  }
}

const createTracker = () => {
  const callbackArray = []

  const registerCleanupCallback = (callback) => {
    if (typeof callback !== "function")
      throw new TypeError(`callback must be a function
callback: ${callback}`)
    callbackArray.push(callback)
  }

  const cleanup = async (reason) => {
    const localCallbackArray = callbackArray.slice()
    await Promise.all(localCallbackArray.map((callback) => callback(reason)))
  }

  return { registerCleanupCallback, cleanup }
}

const statusToStatusText = (status) => STATUS_CODES[status] || "not specified"

export const listen = ({ cancellationToken, server, port, ip }) => {
  return createStoppableOperation({
    cancellationToken,
    start: () => listenStart(server, port, ip),
    stop: () => listenStop(server),
  })
}

const listenStart = (server, port, ip) =>
  new Promise((resolve, reject) => {
    server.on("error", reject)
    server.on("listening", () => {
      // in case port is 0 (randomly assign an available port)
      // https://nodejs.org/api/net.html#net_server_listen_port_host_backlog_callback
      resolve(server.address().port)
    })
    server.listen(port, ip)
  })

const listenStop = (server) =>
  new Promise((resolve, reject) => {
    server.on("error", reject)
    server.on("close", resolve)
    server.close()
  })

const reasonIsInternalError = (reason) => reason === REASON_INTERNAL_ERROR

const getNodeServerAndAgent = ({ protocol, signature = {} }) => {
  if (protocol === "http") {
    return {
      nodeServer: createNodeServer(),
      agent: global.Agent,
    }
  }

  if (protocol === "https") {
    const { privateKey, certificate } = signature
    if (!privateKey || !certificate) {
      throw new Error(`missing signature for https server`)
    }

    return {
      nodeServer: createNodeSecureServer({
        key: privateKey,
        cert: certificate,
      }),
      agent: new SecureAgent({
        rejectUnauthorized: false, // allow self signed certificate
      }),
    }
  }

  throw new Error(`unsupported protocol ${protocol}`)
}

const createContentLengthMismatchError = (message) => {
  const error = new Error(message)
  error.code = "CONTENT_LENGTH_MISMATCH"
  error.name = error.code
  return error
}
