import { assert } from "@jsenv/assert";
import { removeEntry } from "@jsenv/filesystem";

import {
  takeDirectorySnapshot,
  readSnapshotsFromDirectory,
} from "@jsenv/snapshots";

const sourceDirectoryUrl = new URL("./source/", import.meta.url);
const snapshotsDirectoryUrl = new URL("./snapshots/", import.meta.url);

removeEntry(snapshotsDirectoryUrl, { recursive: true, allowUseless: true });
try {
  takeDirectorySnapshot(sourceDirectoryUrl, snapshotsDirectoryUrl);
  const snapshotDirectoryContent = readSnapshotsFromDirectory(
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
