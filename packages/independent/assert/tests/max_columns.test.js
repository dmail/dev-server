import { assert } from "../src/assert_scratch.js";
import { startSnapshotTesting } from "./start_snapshot_testing.js";

// TODO: at property when rendered on single line
await startSnapshotTesting("max_columns", {
  ["string open quote"]: () => {
    assert({
      actual: "abcdefghij",
      expect: "ABCDEFGHIJ",
      MAX_COLUMNS: 9,
    });
  },
  ["string first char"]: () => {
    assert({
      actual: "abcdefghij",
      expect: "ABCDEFGHIJ",
      MAX_COLUMNS: 10,
    });
  },
  ["string second char"]: () => {
    assert({
      actual: "abcdefghij",
      expect: "ABCDEFGHIJ",
      MAX_COLUMNS: 11,
    });
  },
  ["string third char"]: () => {
    assert({
      actual: "abcdefghij",
      expect: "ABCDEFGHIJ",
      MAX_COLUMNS: 12,
    });
  },
  ["string fourth char"]: () => {
    assert({
      actual: "abcdefghij",
      expect: "ABCDEFGHIJ",
      MAX_COLUMNS: 13,
    });
  },
  ["string last char"]: () => {
    assert({
      actual: "abcdefghij",
      expect: "ABCDEFGHIJ",
      MAX_COLUMNS: 19,
    });
  },
  ["string close quote"]: () => {
    assert({
      actual: "abcdefghij",
      expect: "ABCDEFGHIJ",
      MAX_COLUMNS: 20,
    });
  },
  ["at property value"]: () => {
    assert({
      actual: {
        zzz: "abcdefghijklmn",
      },
      expect: {
        zzz: "ABCDEFGHIJKLMN",
      },
      MAX_COLUMNS: 20,
    });
  },
  ["at property key"]: () => {
    assert({
      actual: {
        "a quite long property key that will be truncated": true,
      },
      expect: {
        "a quite long property key that will be truncated": false,
      },
      MAX_COLUMNS: 40,
    });
  },
  ["at property name last char"]: () => {
    assert({
      actual: {
        abcdefgh: true,
      },
      expect: {
        abcdefgh: false,
      },
      MAX_COLUMNS: 10,
    });
  },
  ["at property name separator"]: () => {
    assert({
      actual: {
        abcdefgh: true,
      },
      expect: {
        abcdefgh: false,
      },
      MAX_COLUMNS: 11,
    });
  },
  ["at space after property name separator"]: () => {
    assert({
      actual: {
        abcdefgh: true,
      },
      expect: {
        abcdefgh: false,
      },
      MAX_COLUMNS: 12,
    });
  },
  ["at property value first char"]: () => {
    assert({
      actual: {
        abcdefgh: true,
      },
      expect: {
        abcdefgh: false,
      },
      MAX_COLUMNS: 13,
    });
  },
  ["at property value second char"]: () => {
    assert({
      actual: {
        abcdefgh: true,
      },
      expect: {
        abcdefgh: false,
      },
      MAX_COLUMNS: 14,
    });
  },
  ["at property value second char (and value width is 1)"]: () => {
    assert({
      actual: {
        abcdefgh: 0,
      },
      expect: {
        abcdefgh: 1,
      },
      MAX_COLUMNS: 14,
    });
  },
  ["at property value third char"]: () => {
    assert({
      actual: {
        abcdefgh: true,
      },
      expect: {
        abcdefgh: false,
      },
      MAX_COLUMNS: 15,
    });
  },
  // on URLS
  ["url search param modified, middle of long params"]: () => {
    assert({
      actual: "http://example_that_is_long.com?this_is_relatively_long=1&foo=a",
      expect: "http://example_that_is_long.com?this_is_relatively_long=1&foo=b",
      MAX_COLUMNS: 30,
    });
  },
  ["long url diff at end"]: () => {
    assert({
      actual: "http://example_that_is_quite_long.com/dir/file.txt",
      expect: "http://example_that_is_quite_long.com/dir/file.css",
      MAX_COLUMNS: 40,
    });
  },
  ["long url diff at start"]: () => {
    assert({
      actual: "http://example_that_is_quite_long.com/dir/file.txt",
      expect: "file://example_that_is_quite_long.com/dir/file.txt",
      MAX_COLUMNS: 40,
    });
  },
  ["long url diff in the middle"]: () => {
    assert({
      actual: "http://example_that_is_quite_long.com/dir/file.txt",
      expect: "http://example_that_AA_quite_long.com/dir/file.txt",
      MAX_COLUMNS: 40,
    });
  },
  ["long url diff start middle end"]: () => {
    assert({
      actual: "http://example_that_is_quite_long.com/dir/file.txt",
      expect: "file://example_that_AA_quite_long.com/dir/file.css",
      MAX_COLUMNS: 40,
    });
  },
});

// await startSnapshotTesting("max_columns", {
//   ["maxColumns respect actual prefix"]: () => {
//     assert({
//       actual: "a_string",
//       expect: "a_string_2",
//       maxColumns: 15,
//     });
//   },
//   ["maxColumns respect indent"]: () => {
//     assert({
//       actual: {
//         a: "a_long_string",
//         b: false,
//       },
//       expect: {
//         a: "a_long_string",
//         b: true,
//       },
//       maxColumns: 10,
//     });
//   },
// });
