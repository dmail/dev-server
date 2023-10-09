import { assert } from "@jsenv/assert";
import { ensureAssertionErrorWithMessage } from "../ensureAssertionErrorWithMessage.js";

// anonymous funciton
{
  const actual = (function () {
    return function () {};
  })();
  const expected = (function () {
    return function () {};
  })();
  assert({ actual, expected });
}

// anonymous arrow function
{
  const actual = (function () {
    return () => {};
  })();
  const expected = (function () {
    return () => {};
  })();
  assert({ actual, expected });
}

// named arrow function
{
  const actual = () => {};
  const expected = () => {};
  try {
    assert({ actual, expected });
  } catch (e) {
    ensureAssertionErrorWithMessage(
      e,
      `unexpected character in function name
--- details ---
actual
^ unexpected "a", expected to continue with "expected"
--- path ---
actual.name[0]`,
    );
  }
}
