import { writeFileSync } from "@jsenv/filesystem";
import { renderTerminalSvg } from "@jsenv/terminal-snapshot";
import { takeFileSnapshot } from "@jsenv/snapshot";
import { UNICODE, ANSI } from "@jsenv/log";
import { startDevServer } from "@jsenv/core";

import {
  executeTestPlan,
  nodeWorkerThread,
  nodeChildProcess,
  chromium,
  firefox,
  webkit,
} from "@jsenv/test";

// force unicode and color support on windows
// to make snapshot predictible on windows (otherwise "✔" would be "√" for instance)
UNICODE.supported = true;
ANSI.supported = true;

const devServer = await startDevServer({
  logLevel: "warn",
  sourceDirectoryUrl: new URL("./client/", import.meta.url),
  keepProcessAlive: false,
  port: 0,
});
const test = async (name, params) => {
  const terminalSnapshotFileUrl = new URL(
    `./snapshots/mixed/${name}.svg`,
    import.meta.url,
  );
  const terminalFileSnapshot = takeFileSnapshot(terminalSnapshotFileUrl);
  {
    let stdout = "";
    const { write } = process.stdout;
    process.stdout.write = (...args) => {
      stdout += args;
    };
    await executeTestPlan({
      logs: {
        dynamic: false,
        mockFluctuatingValues: true,
      },
      rootDirectoryUrl: new URL("./", import.meta.url),
      webServer: {
        origin: devServer.origin,
      },
      githubCheck: false,
      ...params,
    });
    process.stdout.write = write;
    writeFileSync(terminalSnapshotFileUrl, await renderTerminalSvg(stdout));
  }
  terminalFileSnapshot.compare();
};

await test("empty.txt", {
  testPlan: {
    "./node_client/empty.spec.js": {
      node: {
        runtime: nodeWorkerThread(),
      },
      node_2: {
        runtime: nodeChildProcess(),
      },
    },
    "./client/empty.spec.html": {
      chrome: {
        runtime: chromium(),
      },
      firefox: {
        runtime: firefox(),
      },
      webkit: {
        runtime: webkit(),
      },
    },
  },
});
