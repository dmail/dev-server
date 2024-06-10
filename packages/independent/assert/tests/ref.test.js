import { assert } from "../src/assert_scratch.js";
import { startSnapshotTesting } from "./start_snapshot_testing.js";

await startSnapshotTesting("ref", {
  ["true should be object using ref"]: () => {
    const item = { id: "a" };
    assert({
      actual: true,
      expect: {
        foo: item,
        bar: item,
      },
    });
  },
  "same ref to self": () => {
    const actual = {
      a: true,
    };
    actual.self = actual;
    const expect = {
      a: false,
    };
    expect.self = expect;
    assert({
      actual,
      expect,
    });
  },
  // ref fully added
  // ref fully removed
  // value becomes a ref
  // ref becomes a value
  // same_parent_ref: () => {
  //   const actual = {};
  //   actual.object = { parent: actual };
  //   const expected = {};
  //   expected.object = { parent: expected };
  //   assert({ actual, expected });
  // },
  // same_ref_twice: () => {
  //   const actual = {};
  //   actual.object = { self: actual, self2: actual };
  //   const expected = {};
  //   expected.object = { self: expected, self2: expected };
  //   assert({ actual, expected });
  // },
  // fail_should_be_a_reference: () => {
  //   const actual = {};
  //   actual.self = {};
  //   const expected = {};
  //   expected.self = expected;
  //   assert({ actual, expected });
  // },
  // fail_should_not_be_a_reference: () => {
  //   const actual = {};
  //   actual.self = actual;
  //   const expected = {};
  //   expected.self = {};
  //   assert({ actual, expected });
  // },
  // fail_should_not_be_a_reference_nested: () => {
  //   const actual = { object: {} };
  //   actual.object.self = {};
  //   const expected = { object: {} };
  //   expected.object.self = expected.object;
  //   assert({ actual, expected });
  // },
  // fail_different_references: () => {
  //   const actual = { object: {} };
  //   actual.object.self = actual;
  //   const expected = { object: {} };
  //   expected.object.self = expected.object;
  //   assert({ actual, expected });
  // },
});
