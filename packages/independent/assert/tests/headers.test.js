import { assert } from "../src/assert_scratch.js";
import { startSnapshotTesting } from "./start_snapshot_testing.js";

await startSnapshotTesting("headers", ({ test }) => {
  test("content-type added", () => {
    assert({
      actual: new Headers({
        "content-type": "text/xml",
      }),
      expect: new Headers(),
    });
  });
  test("content-type removed", () => {
    assert({
      actual: new Headers({}),
      expect: new Headers({
        "content-type": "text/xml",
      }),
    });
  });
  test("content-type modified", () => {
    assert({
      actual: new Headers({
        "content-type": "text/css",
      }),
      expect: new Headers({
        "content-type": "text/xml",
      }),
    });
  });
  test("content-type multi diff", () => {
    assert({
      actual: new Headers({
        "content-type": "text/xml, text/css",
      }),
      expect: new Headers({
        "content-type": "text/xml, text/html",
      }),
    });
  });
  // From an HTTP perspective the whitspaces (and even the order of header values)
  // does not matter.
  // However if a change in the code is adding/removing whitespaces in header values
  // people would expect assert to fail as a testimony of their changes
  // so header value comparison is whitespace sensitive
  test("content-type spacing diff", () => {
    assert({
      actual: new Headers({
        "content-type": "text/xml,text/css",
      }),
      expect: new Headers({
        "content-type": "text/xml, text/css",
      }),
    });
  });
  test("set cookie added", () => {
    assert({
      actual: new Headers({
        "set-cookie": "name=value",
      }),
      expect: new Headers({}),
    });
  });
  test("set cookie removed", () => {
    assert({
      actual: new Headers({}),
      expect: new Headers({
        "set-cookie": "name=value;",
      }),
    });
  });
  test("cookie added", () => {
    assert({
      actual: new Headers({
        "set-cookie": "foo=a,bar=b",
      }),
      expect: new Headers({
        "set-cookie": "foo=a",
      }),
    });
  });
  // TODO: accept, header with a diff on q
  //       something new is accepted
  //       something is not accepted anymore
  // TODO: cookies header with a diff on some prop
  //       a cookie is added
  //       a cookie is removed
});
