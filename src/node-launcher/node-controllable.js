const { createCancellationSource } = require("@dmail/cancellation")
const { uneval } = require("@dmail/uneval")

const EVALUATION_STATUS_OK = "evaluation-ok"
const EVALUATION_STATUS_ERROR = "evaluation-error"

const registerProcessInterruptCallback = (callback) => {
  process.once("SIGINT", callback)
  return () => {
    process.removeListener("SIGINT", callback)
  }
}

const listenParentOnce = (type, callback) => {
  const listener = (event) => {
    if (event.type === type) {
      // commenting line below keep this process alive
      removeListener()
      callback(eval(`(${event.data})`))
    }
  }

  const removeListener = () => {
    process.removeListener("message", listener)
  }

  process.on("message", listener)
  return removeListener
}

const { token, cancel } = createCancellationSource()
token.register(
  registerProcessInterruptCallback(() => {
    // cancel will remove listener to process.on('message')
    // which is sufficient to let child process die
    // assuming nothing else keeps it alive
    cancel("process interrupt")

    // if something keeps it alive the process won't die
    // but this is the responsability of the code
    // to properly cancel stuff on 'SIGINT'
    // If code does not do that, a process forced exit
    // like process.exit() or child.kill() from parent
    // will ensure process dies
  }),
)
token.register(
  listenParentOnce("evaluate", async (expressionString) => {
    try {
      const value = await eval(`${expressionString}
${"//#"} sourceURL=__node-evaluation-script__.js`)
      sendToParent("evaluate-result", {
        status: EVALUATION_STATUS_OK,
        value,
      })
    } catch (e) {
      sendToParent("evaluate-result", {
        status: EVALUATION_STATUS_ERROR,
        value: e,
      })
    }
  }),
)

const sendToParent = (type, data) => {
  // https://nodejs.org/api/process.html#process_process_connected
  // not connected anymore, cannot communicate with parent
  if (!process.connected) return

  // process.send algorithm does not send non enumerable values
  // because it works with JSON.stringify I guess so use uneval
  const source = uneval(data)

  // this can keep process alive longer than expected
  // when source is a long string.
  // It means node process may stay alive longer than expected
  // the time to send the data to the parent.
  process.send({
    type,
    data: source,
  })
}
