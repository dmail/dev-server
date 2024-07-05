import stripAnsi from "strip-ansi";
import { takeFileSnapshot } from "@jsenv/snapshot";
import { startTerminalRecording } from "@jsenv/terminal-recorder";
import { clearDirectorySync, writeFileSync } from "@jsenv/filesystem";
import { ANSI } from "@jsenv/humanize";

import { parseFunction } from "@jsenv/assert/src/utils/function_parser.js";

const generateMarkdown =
  process.execArgv.includes("--conditions=development") && !process.env.CI;

export const startSnapshotTesting = async (name, scenarios) => {
  let fileContent = "";
  let markdown = "";
  const snapshotsDirectoryUrl = new URL("../snapshots/", import.meta.url);
  const snapshotFileUrl = new URL(
    `./${name}/${name}.txt`,
    snapshotsDirectoryUrl,
  );
  const markdownFileUrl = new URL(`./${name}.md`, snapshotsDirectoryUrl);
  const fileSnapshot = takeFileSnapshot(snapshotFileUrl);
  if (generateMarkdown) {
    clearDirectorySync(new URL(`./${name}/`, snapshotsDirectoryUrl));
  }

  if (typeof scenarios === "function") {
    const scenarioMap = new Map();
    const onlyScenarioMap = new Map();
    const test = (name, callback) => {
      if (scenarioMap.has(name)) {
        console.warn(`a test with "${name} already exists`);
      }
      scenarioMap.set(name, callback);
    };
    test.ONLY = (name, callback) => {
      ANSI.supported = false;
      onlyScenarioMap.set(name, callback);
    };
    test.TODO = () => {};
    scenarios({
      test,
    });
    if (onlyScenarioMap.size) {
      scenarios = Object.fromEntries(onlyScenarioMap);
    } else {
      scenarios = Object.fromEntries(scenarioMap);
    }
  }

  for (const key of Object.keys(scenarios)) {
    const scenarioCallback = scenarios[key];
    try {
      // console.log(`run ${key}`);
      await scenarioCallback();
    } catch (e) {
      fileContent += `# ${key}\n`;
      let errorSource;
      if (typeof e === "string") {
        fileContent += `${stripAnsi(e.trim())}\n\n`;
        errorSource = e;
      } else if (e.constructor.name === "AssertionError") {
        fileContent += `AssertionError: ${stripAnsi(e.message)}\n\n`;
        errorSource = `AssertionError: ${e.message}`;
      } else {
        fileContent += `${e.stack}\n\n`;
        errorSource = `${e.stack}\n\n`;
      }

      if (generateMarkdown) {
        markdown += `# ${key}\n`;
        markdown += "\n";
        markdown += "```js\n";
        markdown += parseFunction(scenarioCallback).body;
        markdown += "\n```";
        const terminalRecorder = await startTerminalRecording({
          svg: {
            title: "Terminal",
          },
        });
        await terminalRecorder.write(errorSource);
        const result = await terminalRecorder.stop();
        const svg = await result.svg();
        const keyAsFilename = keyAsValidFilename(key);
        const svgFileUrl = new URL(
          `./${name}/${keyAsFilename}.svg`,
          snapshotsDirectoryUrl,
        );
        writeFileSync(svgFileUrl, svg);

        markdown += `\n\n`;
        markdown += `![img](<./${name}/${keyAsFilename}.svg>)`;
        markdown += `\n\n`;
      }
    }
  }
  writeFileSync(snapshotFileUrl, fileContent);
  if (generateMarkdown) {
    writeFileSync(markdownFileUrl, markdown);
  }
  if (!generateMarkdown) {
    fileSnapshot.compare();
  }
};

// see https://github.com/parshap/node-sanitize-filename/blob/master/index.js
const keyAsValidFilename = (key) => {
  return key
    .trim()
    .toLowerCase()
    .replace(/[ ,\.]/g, "_")
    .replace(/["\/\?<>\\:\*\|]/g, "");
};
