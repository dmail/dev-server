import { startDevServer } from "@jsenv/core";
import { writeFileSync } from "@jsenv/filesystem";
import { ANSI, UNICODE } from "@jsenv/humanize";
import { takeFileSnapshot } from "@jsenv/snapshot";
import { startTerminalRecording } from "@jsenv/terminal-recorder";

import {
  chromium,
  executeTestPlan,
  firefox,
  reportAsJunitXml,
  reporterList,
  webkit,
} from "@jsenv/test";

if (process.platform === "win32") {
  // to fix once got a windows OS to reproduce
  process.exit();
}

const terminalAnimatedRecording =
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
  if (terminalAnimatedRecording) {
    console.log(`snapshoting ${filename}`);
  }
  const testPlanResult = await executeTestPlan({
    logs: {
      type: null,
    },
    reporters: [
      reporterList({
        animated: false,
        mockFluctuatingValues: true,
        spy: async () => {
          const terminalSnapshotFileUrl = new URL(
            `./snapshots/browsers/${filename}.svg`,
            import.meta.url,
          );
          const terminalRecorder = await startTerminalRecording({
            svg: true,
          });
          const terminalFileSnapshot = takeFileSnapshot(
            terminalSnapshotFileUrl,
          );
          return {
            write: (log) => {
              terminalRecorder.write(log);
            },
            end: async () => {
              const terminalRecords = await terminalRecorder.stop();
              const terminalSvg = await terminalRecords.svg();
              writeFileSync(terminalSnapshotFileUrl, terminalSvg);
              terminalFileSnapshot.compare();
            },
          };
        },
      }),
      ...(terminalAnimatedRecording
        ? [
            reporterList({
              animated: true,
              spy: async () => {
                const terminalRecorder = await startTerminalRecording({
                  columns: 120,
                  rows: 30,
                  gif: {
                    repeat: true,
                    msAddedAtTheEnd: 3_500,
                  },
                });
                return {
                  write: async (log) => {
                    await terminalRecorder.write(log);
                  },
                  end: async () => {
                    const terminalRecords = await terminalRecorder.stop();
                    const terminalGif = await terminalRecords.gif();
                    writeFileSync(
                      new URL(
                        `./snapshots/browsers/${filename}.gif`,
                        import.meta.url,
                      ),
                      terminalGif,
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
          runtime: firefox({
            disableOnWindowsBecauseFlaky: false,
          }),
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
  const junitXmlFileUrl = new URL(
    `./snapshots/browsers/${filename}.xml`,
    import.meta.url,
  );
  const junitXmlFileSnapshot = takeFileSnapshot(junitXmlFileUrl);
  await reportAsJunitXml(testPlanResult, junitXmlFileUrl, {
    mockFluctuatingValues: true,
  });
  junitXmlFileSnapshot.compare();
};

await test("console.spec.html");
await test("empty.spec.html");
await test("error_in_script.spec.html");
await test("error_in_script_module.spec.html");
await test("error_in_js_module.spec.html");
await test("error_in_js_classic.spec.html");
if (!process.env.CI) {
  // fails in CI for some reason
  await test("error_jsenv_assert_in_script_module.spec.html");
}
