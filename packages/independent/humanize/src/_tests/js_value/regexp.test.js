import { assert } from "@jsenv/assert";
import { humanize } from "@jsenv/humanize";

{
  const actual = humanize(/ok/g);
  const expect = "/ok/g";
  assert({ actual, expect });
}

{
  const actual = humanize(new RegExp("foo", "g"));
  const expect = "/foo/g";
  assert({ actual, expect });
}
