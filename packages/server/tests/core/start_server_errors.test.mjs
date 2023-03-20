import { assert } from "@jsenv/assert"

import { startServer } from "@jsenv/server"

try {
  await startServer({
    htt: true,
  })
  throw new Error("should throw")
} catch (actual) {
  const expected = new TypeError("htt: there is no such param")
  assert({ actual, expected })
}

try {
  await startServer({
    https: "toto",
  })
  throw new Error("should throw")
} catch (actual) {
  const expected = new TypeError("https must be an object, got toto")
  assert({ actual, expected })
}

try {
  await startServer({
    https: {},
  })
  throw new Error("should throw")
} catch (actual) {
  const expected = new TypeError(
    "https must be an object with { certificate, privateKey }",
  )
  assert({ actual, expected })
}

try {
  await startServer({
    https: { certificate: "" },
  })
  throw new Error("should throw")
} catch (actual) {
  const expected = new TypeError(
    "https must be an object with { certificate, privateKey }",
  )
  assert({ actual, expected })
}

try {
  await startServer({
    http2: true,
  })
  throw new Error("should throw")
} catch (actual) {
  const expected = new Error(`http2 needs https`)
  assert({ actual, expected })
}
