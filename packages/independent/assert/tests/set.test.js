import { startSnapshotTesting } from "./start_snapshot_testing.js";

import { createAssert } from "../src/assert.js";

const assert = createAssert();

await startSnapshotTesting("set", {
  ["set value added"]: () => {
    assert({
      actual: new Set([
        "a",
        "b",
        "c",
        // new
        "Y",
      ]),
      expect: new Set([
        "b",
        "a",
        "c",
        // new
        "Z",
      ]),
      maxValueAroundDiff: 4,
    });
  },
  ["compare set and array"]: () => {
    assert({
      actual: ["a"],
      expect: new Set(["a"]),
    });
  },
  ["set collapsed various cases"]: () => {
    assert({
      actual: {
        a: true,
        set_without_diff: new Set(["a", "b"]),
        set_with_added: new Set(["a"]),
      },
      expect: {
        a: false,
        set_without_diff: new Set(["b", "a"]),
        set_with_added: new Set(["b"]),
      },
      maxDepthInsideDiff: 0,
    });
  },
  ["set collapsed deep"]: () => {
    assert({
      actual: {
        a: {
          set_without_diff: new Set(["a", "b"]),
          set_with_added: new Set(["a"]),
        },
      },
      expect: {
        a: {
          set_without_diff: new Set(["b", "a"]),
          set_with_added: new Set(["b"]),
        },
      },
      maxDepthInsideDiff: 0,
    });
  },
});