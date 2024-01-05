import { writeFileSync } from "@jsenv/filesystem";
import {
  renderTerminalSvg,
  startTerminalVideoRecording,
} from "@jsenv/terminal-snapshot";
import { takeFileSnapshot } from "@jsenv/snapshot";
import { UNICODE, ANSI } from "@jsenv/log";
import { startDevServer } from "@jsenv/core";

import {
  executeTestPlan,
  chromium,
  firefox,
  webkit,
  reporterList,
} from "@jsenv/test";

const terminalVideoRecording =
  process.execArgv.includes("--conditions=development") &&
  !process.env.CI &&
  !process.env.JSENV;
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

const test = async (filename, params) => {
  await executeTestPlan({
    listReporter: false,
    fileReporter: false,
    reporters: [
      reporterList({
        dynamic: false,
        mockFluctuatingValues: true,
        spy: () => {
          const terminalSnapshotFileUrl = new URL(
            `./snapshots/browsers/${filename}.svg`,
            import.meta.url,
          );
          const terminalFileSnapshot = takeFileSnapshot(
            terminalSnapshotFileUrl,
          );
          let stdout = "";
          return {
            write: (log) => {
              stdout += log;
            },
            end: async () => {
              const svg = await renderTerminalSvg(stdout);
              writeFileSync(terminalSnapshotFileUrl, svg);
              terminalFileSnapshot.compare();
            },
          };
        },
      }),
      ...(terminalVideoRecording
        ? [
            reporterList({
              dynamic: true,
              spy: async () => {
                const terminalVideoRecorder = await startTerminalVideoRecording(
                  {
                    columns: 120,
                    rows: 30,
                  },
                );
                return {
                  write: async (log) => {
                    await terminalVideoRecorder.write(log);
                  },
                  end: async () => {
                    const terminalVideo = await terminalVideoRecorder.stop();
                    const terminalVideoMp4 = await terminalVideo.mp4();
                    writeFileSync(
                      new URL(
                        `./snapshots/browsers/${filename}.mp4`,
                        import.meta.url,
                      ),
                      terminalVideoMp4,
                    );
                  },
                };
              },
            }),
          ]
        : []),
    ],
    rootDirectoryUrl: new URL("./client/", import.meta.url),
    testPlan: {
      [filename]: {
        chromium: {
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
    githubCheck: false,
    webServer: {
      origin: devServer.origin,
    },
    ...params,
  });
};

await test("console.spec.html");
await test("empty.spec.html");
await test("error_in_script.spec.html");
await test("error_in_script_module.spec.html");
await test("error_in_js_module.spec.html");
await test("error_in_js_classic.spec.html");
await test("error_jsenv_assert_in_script_module.spec.html");
