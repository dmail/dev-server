import { assert } from "@jsenv/assert";

import {
  ensureEmptyDirectorySync,
  readFileStructureSync,
  writeFileSync,
} from "@jsenv/filesystem";
import { snapshotTests } from "@jsenv/snapshot";

ensureEmptyDirectorySync(new URL("./output/", import.meta.url));
await snapshotTests(
  import.meta.url,
  ({ test }) => {
    test("0_first", () => {
      writeFileSync(new URL("./output/a.txt", import.meta.url), "a");
      writeFileSync(
        new URL("./output/b.css", import.meta.url),
        "body { color: red; }",
      );
    });
  },
  {
    filesystemActions: {
      "**/*.txt": "compare_presence_only",
      "**/*.css": "ignore",
    },
  },
);
const actual = readFileStructureSync(new URL("./output/", import.meta.url));
const expect = {
  "b.css": "body { color: red; }",
};
assert({ actual, expect });
