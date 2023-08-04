import { fileURLToPath } from "node:url";
import { assert } from "@jsenv/assert";
import { createTeardown } from "@jsenv/test/src/helpers/teardown.js";
import { pingServer } from "@jsenv/test/src/helpers/ping_server.js";

import { ensureWebServerIsStarted } from "@jsenv/test/src/execution/web_server_param.js";

// the module does not exists
{
  const webServer = {
    origin: "http://localhost:3460",
    moduleUrl: new URL("./404.mjs", import.meta.url),
  };
  try {
    const teardown = createTeardown();
    await ensureWebServerIsStarted(webServer, {
      signal: new AbortController().signal,
      logger: { debug: () => {}, info: () => {} },
      teardown,
      allocatedMs: 500,
    });
    throw new Error("should throw");
  } catch (e) {
    const actual = e;
    const expected = new Error(
      `"${webServer.moduleUrl}" does not lead to a file`,
    );
    assert({ actual, expected });
  }
}

// the module execution fails
{
  const webServer = {
    origin: "http://localhost:3460",
    moduleUrl: new URL("./error.mjs", import.meta.url).href,
  };
  try {
    const teardown = createTeardown();
    await ensureWebServerIsStarted(webServer, {
      signal: new AbortController().signal,
      logger: { debug: () => {}, info: () => {} },
      teardown,
      allocatedMs: 500,
    });
    throw new Error("should throw");
  } catch (e) {
    const actual = e.message;
    const expected = `"node ${fileURLToPath(
      webServer.moduleUrl,
    )}" command did not start a server in less than 500ms`;
    assert({ actual, expected });
  }
}

// the module does not start a server (or not fast enough)
{
  const webServer = {
    origin: "http://localhost:3460",
    moduleUrl: new URL("./do_nothing.mjs", import.meta.url),
  };
  try {
    const teardown = createTeardown();
    await ensureWebServerIsStarted(webServer, {
      signal: new AbortController().signal,
      logger: { debug: () => {}, info: () => {} },
      teardown,
      allocatedMs: 500,
    });
    throw new Error("should throw");
  } catch (e) {
    const actual = e;
    const expected = new Error(
      `"node ${fileURLToPath(
        webServer.moduleUrl,
      )}" command did not start a server in less than 500ms`,
    );
    assert({ actual, expected });
  }
}

// the module starts a server
{
  const teardown = createTeardown();
  const webServer = {
    origin: "http://localhost:3460",
    moduleUrl: new URL("./start_server.mjs", import.meta.url),
  };
  await ensureWebServerIsStarted(webServer, {
    signal: new AbortController().signal,
    logger: { debug: () => {}, info: () => {} },
    teardown,
  });
  const serverUp = await pingServer(webServer.origin);
  await teardown.trigger();
  await new Promise((resolve) => setTimeout(resolve, 1_000));
  const serverUpAfterTeardown = await pingServer(webServer.origin);
  const actual = {
    serverUp,
    serverUpAfterTeardown,
  };
  const expected = {
    serverUp: true,
    serverUpAfterTeardown: false,
  };
  assert({ actual, expected });
}
