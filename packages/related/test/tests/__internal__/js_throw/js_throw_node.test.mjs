import { assert } from "@jsenv/assert";
import { execute, nodeChildProcess } from "@jsenv/test";

const test = async (params) => {
  const { errors } = await execute({
    // logLevel: "debug"
    rootDirectoryUrl: new URL("./client/", import.meta.url),
    fileRelativeUrl: `./main.js`,
    // keepRunning: true,
    mirrorConsole: false,
    collectConsole: true,
    ignoreError: true,
    ...params,
  });
  return errors;
};

const [error] = await test({
  runtime: nodeChildProcess(),
});
const clientDirectoryUrl = new URL("./client", import.meta.url).href;

const actual = {
  isException: error.isException,
  name: error.name,
  message: error.message,
  stack: error.stack,
  site: error.site,
};
const expected = {
  isException: true,
  name: "Error",
  message: "SPECIAL_STRING_UNLIKELY_TO_COLLIDE",
  stack: assert.startsWith(`Error: SPECIAL_STRING_UNLIKELY_TO_COLLIDE
  at triggerError (${clientDirectoryUrl}/trigger_error.js:2:9)
  at ${clientDirectoryUrl}/main.js:3:1`),
  site: {
    url: `${clientDirectoryUrl}/trigger_error.js`,
    line: 2,
    column: 8,
  },
};
assert({ actual, expected });
