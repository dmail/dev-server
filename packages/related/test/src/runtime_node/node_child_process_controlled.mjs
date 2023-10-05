import { executeUsingDynamicImport } from "./execute_using_dynamic_import.js";

const ACTIONS_AVAILABLE = {
  "execute-using-dynamic-import": executeUsingDynamicImport,
  "execute-using-require": async ({ fileUrl }) => {
    const { createRequire } = await import("node:module");
    const { fileURLToPath } = await import("node:url");
    const filePath = fileURLToPath(fileUrl);
    const require = createRequire(fileUrl);
    // eslint-disable-next-line import/no-dynamic-require
    const namespace = require(filePath);
    const namespaceResolved = {};
    await Promise.all(
      Object.keys(namespace).map(async (key) => {
        const value = await namespace[key];
        namespaceResolved[key] = value;
      }),
    );
    return namespaceResolved;
  },
};
const ACTION_REQUEST_EVENT_NAME = "action";
const ACTION_RESPONSE_EVENT_NAME = "action-result";
const ACTION_RESPONSE_STATUS_FAILED = "action-failed";
const ACTION_RESPONSE_STATUS_COMPLETED = "action-completed";

const sendActionFailed = (error) => {
  const { prepareStackTrace } = Error;
  let stackObject;
  let stackTrace;
  Error.prepareStackTrace = (e, secondArg) => {
    Error.prepareStackTrace = prepareStackTrace;
    stackObject = secondArg;
    const name = error.name || "Error";
    const message = error.message || "";
    const stackString = secondArg
      .map((callSite) => `  at ${callSite}`)
      .join("\n");
    stackTrace = stackString;
    return `${name}: ${message}\n  ${stackString}`;
  };
  // eslint-disable-next-line no-unused-expressions
  const stackString = error.stack;
  const [firstCallSite] = stackObject;

  const exception = {
    isException: true,
    isError: true,
    name: error.name,
    message: `${error.name}: ${error.message}`,
    stack: stackString,
    stackTrace,
    site: getSite(firstCallSite),
  };

  sendToParent(
    ACTION_RESPONSE_EVENT_NAME,
    JSON.stringify({
      status: ACTION_RESPONSE_STATUS_FAILED,
      value: exception,
    }),
  );
};

// const getErrorStackWithoutErrorMessage = (error) => {
//   let stack = error.stack;
//   if (!stack) return "";
//   const messageInStack = `${error.name}: ${error.message}`;
//   if (stack.startsWith(messageInStack)) {
//     stack = stack.slice(messageInStack.length);
//   }
//   const nextLineIndex = stack.indexOf("\n");
//   if (nextLineIndex > -1) {
//     stack = stack.slice(nextLineIndex + 1);
//   }
//   return stack;
// };
const getSite = (firstCallSite) => {
  const source =
    firstCallSite.getFileName() || firstCallSite.getScriptNameOrSourceURL();
  if (source) {
    const line = firstCallSite.getLineNumber();
    const column = firstCallSite.getColumnNumber() - 1;
    return {
      source,
      line,
      column,
    };
  }
  // Code called using eval() needs special handling
  if (firstCallSite.isEval()) {
    const origin = firstCallSite.getEvalOrigin();
    if (origin) {
      return getEvalSite(origin);
    }
    return {};
  }
  return {};
};
const getEvalSite = (origin) => {
  // Most eval() calls are in this format
  const topLevelEvalMatch = /^eval at ([^(]+) \((.+):(\d+):(\d+)\)$/.exec(
    origin,
  );
  if (topLevelEvalMatch) {
    const source = topLevelEvalMatch[2];
    const line = Number(topLevelEvalMatch[3]);
    const column = topLevelEvalMatch[4] - 1;
    return {
      source,
      line,
      column,
    };
  }

  // Parse nested eval() calls using recursion
  const nestedEvalMatch = /^eval at ([^(]+) \((.+)\)$/.exec(origin);
  if (nestedEvalMatch) {
    return getEvalSite(nestedEvalMatch[2]);
  }
  return {};
};

const sendActionCompleted = (value) => {
  sendToParent(
    ACTION_RESPONSE_EVENT_NAME,
    // here we use JSON.stringify because we should not
    // have non enumerable value (unlike there is on Error objects)
    // otherwise uneval is quite slow to turn a giant object
    // into a string (and value can be giant when using coverage)
    JSON.stringify({
      status: ACTION_RESPONSE_STATUS_COMPLETED,
      value,
    }),
  );
};

const sendToParent = (type, data) => {
  // https://nodejs.org/api/process.html#process_process_connected
  // not connected anymore, cannot communicate with parent
  if (!process.connected) {
    return;
  }
  // this can keep process alive longer than expected
  // when source is a long string.
  // It means node process may stay alive longer than expected
  // the time to send the data to the parent.
  process.send({
    jsenv: true,
    type,
    data,
  });
};

const onceParentMessage = (type, callback) => {
  const listener = (message) => {
    if (message && message.jsenv && message.type === type) {
      removeListener(); // commenting this line keep this process alive
      callback(message.data);
    }
  };
  const removeListener = () => {
    process.removeListener("message", listener);
  };
  process.on("message", listener);
  return removeListener;
};

const removeActionRequestListener = onceParentMessage(
  ACTION_REQUEST_EVENT_NAME,
  async ({ actionType, actionParams }) => {
    const action = ACTIONS_AVAILABLE[actionType];
    if (!action) {
      sendActionFailed(new Error(`unknown action ${actionType}`));
      return;
    }

    let value;
    let failed = false;
    try {
      value = await action(actionParams);
    } catch (e) {
      failed = true;
      value = e;
    }

    // setTimeout(() => {}, 100)

    if (failed) {
      sendActionFailed(value);
    } else {
      sendActionCompleted(value);
    }

    // removeActionRequestListener()
    if (actionParams.exitAfterAction) {
      removeActionRequestListener();
      // for some reason this fixes v8 coverage directory sometimes empty on Ubuntu
      // process.exit()
    }
  },
);

// remove listener to process.on('message')
// which is sufficient to let child process die
// assuming nothing else keeps it alive
// process.once("SIGTERM", removeActionRequestListener)
// process.once("SIGINT", removeActionRequestListener)

setTimeout(() => {
  sendToParent("ready");
});
