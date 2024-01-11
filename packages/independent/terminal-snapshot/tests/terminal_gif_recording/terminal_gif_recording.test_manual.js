import { writeFileSync, readFileSync } from "node:fs";
import { startTerminalRecording } from "@jsenv/terminal-snapshot";

const outputLines = readFileSync(
  new URL("./output.txt", import.meta.url),
  "utf8",
).split(/\n/g);

const terminalRecorder = await startTerminalRecording({
  gif: true,
});
for (const line of outputLines) {
  terminalRecorder.write(`${line}\n`);
  await new Promise((resolve) => {
    setTimeout(resolve, 100);
  });
}
const terminalRecords = await terminalRecorder.stop();
const terminalGif = await terminalRecords.gif();
writeFileSync(new URL("./terminal.gif", import.meta.url), terminalGif);
