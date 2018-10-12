import { fork } from "child_process"
import path from "path"
import { ensureSystem } from "./ensureSystem.js"
import "./global-fetch.js"
import { createSignal } from "@dmail/signal"
import { cancellableAction } from "../signalHelper.js"

export const openNodeClient = ({
  localRoot,
  remoteRoot,
  remoteCompileDestination,
  detached = false,
}) => {
  if (detached === false) {
    const execute = ({ file, setup = () => {}, teardown = () => {} }) => {
      const close = () => {}

      const remoteFile = `${remoteRoot}/${remoteCompileDestination}/${file}`

      const promise = Promise.resolve()
        .then(() => ensureSystem({ localRoot, remoteRoot }))
        .then((nodeSystem) => {
          return Promise.resolve()
            .then(setup)
            .then(() => nodeSystem.import(remoteFile))
            .then(teardown)
        })

      return Promise.resolve({ promise, close })
    }

    return Promise.resolve({ execute })
  }

  const clientFile = path.resolve(__dirname, "./client.js")
  let previousID

  const execute = ({
    file,
    setup = () => {},
    teardown = () => {},
    hotreload = false,
    autoClose = false,
    autoCloseOnError = false,
  }) => {
    const cancelled = createSignal()
    const cancel = () => {
      cancelled.emit()
    }

    const forkChild = () => {
      const promise = new Promise((resolve, reject) => {
        const id = previousID === undefined ? 1 : previousID + 1
        previousID = id

        const child = fork(clientFile, {
          execArgv: [
            // allow vscode to debug else you got port already used
            `--inspect-brk`,
          ],
        })

        const sendToChild = (type, data) => {
          child.send({
            id,
            type,
            data,
          })
        }

        const closed = createSignal()
        child.once("close", closed.emit)

        const executed = createSignal()
        const restartAsked = createSignal()
        child.on("message", (message) => {
          if (message.id !== id) {
            return
          }
          if (message.type === "execute-result") {
            executed.emit(message.data)
          }
          if (message.type === "restart") {
            restartAsked.emit()
          }
        })

        // kill the child when cancel called except if child has closed before
        cancellableAction(() => child.kill(child.pid, "SIGINT"), cancelled, closed)
        // throw or reject when child is closed except if child ask to restart before
        // (because in that case it will be handled by restart)
        cancellableAction(
          (code) => {
            if (code === 12) {
              throw new Error(
                `child exited with 12: forked child wanted to use a non available port for debug`,
              )
            }
            if (code !== 0) {
              reject(`exited with code ${code}`)
            }
          },
          closed,
          restartAsked,
        )
        // resolve or reject when child has sent execution result, except if child ask to restart before
        cancellableAction(
          ({ code, value }) => {
            if (code === 0) {
              resolve(value)
            } else {
              console.log("rejecting")
              reject(value)
            }
          },
          executed,
          restartAsked,
        )

        restartAsked.listenOnce(() => {
          // fork a new child when child is closed except if cancel was called
          cancellableAction(
            (code) => {
              if (code === 0) {
                forkChild()
              } else {
                throw new Error(`child exited with ${code} after asking to restart`)
              }
            },
            closed,
            cancelled,
          )

          // ask graceful shutdown to the child
          child.kill("SIGINT")
        })

        sendToChild("execute", {
          localRoot,
          remoteRoot,
          remoteCompileDestination,
          file,
          setupSource: `(${setup.toString()})`,
          teardownSource: `(${teardown.toString()})`,
          hotreload,
        })
      }).then(
        (value) => {
          if (autoClose) {
            close()
          }
          return value
        },
        (reason) => {
          if (autoCloseOnError) {
            close()
          }
          return Promise.reject(reason)
        },
      )

      return Promise.resolve({ promise, cancel })
    }

    return forkChild()
  }

  return Promise.resolve({ execute })
}
