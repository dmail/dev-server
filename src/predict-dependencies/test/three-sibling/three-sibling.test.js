import { assert } from "@dmail/assert"
import { predictDependencies } from "../../predictDependencies.js"
import { localRoot } from "../../../localRoot.js"

const testRoot = "src/predict-dependencies/test/three-sibling"
const ressource = `${testRoot}/three-sibling.js`

;(async () => {
  const root = localRoot

  const actual = await predictDependencies({
    root,
    ressource,
  })

  const expected = {
    [ressource]: [
      {
        abstract: `${testRoot}/sibling.js`,
        real: `${testRoot}/sibling.js`,
      },
    ],
    [`${testRoot}/sibling.js`]: [
      {
        abstract: `${testRoot}/leaf.js`,
        real: `${testRoot}/leaf.js`,
      },
    ],
    [`${testRoot}/leaf.js`]: [],
  }

  assert({ actual, expected })
})()
