import assert from "assert"
import { compileGroupsCompose } from "./compileGroupsCompose.js"

{
  const firstGroup = {
    babelPluginNameArray: ["a"],
    compatMap: {
      chrome: 50,
      firefox: 20,
    },
  }
  const secondGroup = {
    babelPluginNameArray: ["b", "e"],
    compatMap: {
      chrome: 49,
      firefox: 30,
      node: 10,
    },
  }
  const actual = compileGroupsCompose(firstGroup, secondGroup)
  const expected = {
    babelPluginNameArray: ["a", "b", "e"],
    compatMap: {
      chrome: "50",
      firefox: "30",
      node: "10",
    },
  }
  assert.deepEqual(actual, expected)
}

console.log("passed")
