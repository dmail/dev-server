/*
 * to enable/disable color process.env.FORCE_COLOR is used.
 * It is documented in https://nodejs.org/api/tty.html#tty_writestream_getcolordepth_env
 */

import { assert } from "@jsenv/assert"

import { execute, nodeProcess } from "@jsenv/core"

const getLogs = async () => {
  const result = await execute({
    logLevel: "warn",
    rootDirectoryUrl: new URL("./", import.meta.url),
    runtime: nodeProcess,
    fileRelativeUrl: "./project/execute_test_plan.js",
    collectConsole: true,
    mirrorConsole: false,
  })
  const logs = result.consoleCalls.reduce((previous, { type, text }) => {
    if (type !== "log") {
      return previous
    }
    return `${previous}${text}`
  }, "")
  return logs
}

if (process.platform !== "win32") {
  // execution with colors disabled
  {
    process.env.FORCE_COLOR = "false"
    const output = await getLogs()
    const expected = `
✔ execution 1 of 1 completed (all completed)
file: file.js
runtime: node/${process.version.slice(1)}`
    const actual = output.slice(0, expected.length)
    assert({ actual, expected })
  }

  // execution with colors enabled
  {
    process.env.FORCE_COLOR = "true"
    const output = await getLogs()
    const expected = `
[32m✔ execution 1 of 1 completed[0m (all [32mcompleted[0m)
file: file.js
runtime: node/${process.version.slice(1)}`
    const actual = output.slice(0, expected.length)
    assert({ actual, expected })
  }
}
