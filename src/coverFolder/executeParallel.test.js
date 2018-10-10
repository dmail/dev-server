import { executeParallel } from "./executeParallel.js"
import assert from "assert"

executeParallel((a) => a + 1, [0, 1, 2, 3, 4], { maxParallelExecution: 2 }).then((actual) => {
  const expected = [1, 2, 3, 4, 5]
  assert.deepEqual(actual, expected)
})

executeParallel((a) => a + 1, [0, 1], { maxParallelExecution: 3 }).then((actual) => {
  const expected = [1, 2]
  assert.deepEqual(actual, expected)
})
