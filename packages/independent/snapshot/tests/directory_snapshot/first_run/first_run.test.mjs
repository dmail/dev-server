import { assert } from "@jsenv/assert";
import { removeEntry } from "@jsenv/filesystem";

import { takeDirectorySnapshot, readDirectoryContent } from "@jsenv/snapshot";

const sourceDirectoryUrl = new URL("./source/", import.meta.url);
const snapshotsDirectoryUrl = new URL("./snapshots/", import.meta.url);

removeEntry(snapshotsDirectoryUrl, { recursive: true, allowUseless: true });
try {
  takeDirectorySnapshot(sourceDirectoryUrl, snapshotsDirectoryUrl);
  const snapshotDirectoryContent = readDirectoryContent(
    new URL("./snapshots/", import.meta.url),
  );
  const actual = snapshotDirectoryContent;
  const expected = {
    "a.js": `console.log("a");\n`,
    "b.js": `console.log("b");\n`,
    "file.txt": "hello",
  };
  assert({ actual, expected });
} finally {
  removeEntry(snapshotsDirectoryUrl, { recursive: true });
}