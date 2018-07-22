import { test } from "@dmail/test"
import assert from "assert"
import { createHeaders } from "./createHeaders.js"

test(() => {
  const headersPOJO = {
    "content-length": 10,
    foo: ["bar"],
  }
  const headers = createHeaders(headersPOJO)

  assert.equal(headers.has("content-length"), true)
  assert.deepEqual(headers.toJSON(), headersPOJO)
  assert.equal(headers.get("foo"), "bar")
})
