import readline from "readline"
import { memoize } from "@jsenv/util"
import { require } from "../require.js"

const stringWidth = require("string-width")

export const writeLog = (string, { stream = process.stdout } = {}) => {
  stream.write(`${string}
`)

  const consoleModified = spyConsoleModification()

  const remove = memoize(() => {
    const { columns = 80 } = stream
    const logLines = string.split(/\r\n|\r|\n/)
    let visualLineCount = 0
    logLines.forEach((logLine) => {
      const width = stringWidth(logLine)
      visualLineCount += width === 0 ? 1 : Math.ceil(width / columns)
    })

    while (visualLineCount--) {
      readline.cursorTo(stream, 0)
      readline.clearLine(stream, 0)
      readline.moveCursor(stream, 0, -1)
    }
  })

  let updated = false
  const update = (newString) => {
    if (updated) {
      throw new Error(`cannot update twice`)
    }
    updated = true

    if (!consoleModified()) {
      remove()
    }
    return writeLog(newString, { stream })
  }

  return {
    remove,
    update,
  }
}

// maybe https://github.com/gajus/output-interceptor/tree/v3.0.0 ?
// the problem with listening data on stdout
// is that node.js will later throw error if stream gets closed
// while something listening data on it
const spyConsoleModification = () => {
  const modified = false

  // const dataListener = () => {
  //   modified = true
  // }
  // process.stdout.once("data", dataListener)
  // process.stdout.on("error", (error) => {
  //   if (error.code === "ENOTCONN") {
  //     return
  //   }
  //   throw error
  // })
  // process.stderr.once("data", dataListener)
  // process.stderr.on("error", (error) => {
  //   if (error.code === "ENOTCONN") {
  //     return
  //   }
  //   throw error
  // })

  return () => {
    // process.stdout.removeListener("data", dataListener)
    // process.stderr.removeListener("data", dataListener)
    return modified
  }
}
