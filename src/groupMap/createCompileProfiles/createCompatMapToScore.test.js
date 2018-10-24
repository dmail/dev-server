import { createCompatMapToScore } from "./createCompatMapToScore.js"
import assert from "assert"

{
  const chrome50Score = 1
  const chrome49Score = 2
  const chromeBelow49Score = 4
  const otherScore = 8
  const compatMapToScore = createCompatMapToScore({
    chrome: {
      "50": chrome50Score,
      "49": chrome49Score,
      "0": chromeBelow49Score,
    },
    other: otherScore,
  })

  {
    const actual = compatMapToScore({
      chrome: "48",
    })
    const expected = chromeBelow49Score
    assert.equal(actual, expected)
  }

  {
    const actual = compatMapToScore({
      chrome: "49",
    })
    const expected = chrome49Score
    assert.equal(actual, expected)
  }

  {
    const actual = compatMapToScore({
      chrome: "50",
    })
    const expected = chrome50Score
    assert.equal(actual, expected)
  }

  {
    const actual = compatMapToScore({
      chrome: "51",
    })
    const expected = chrome50Score
    assert.equal(actual, expected)
  }

  {
    const actual = compatMapToScore({
      chrome: "51",
      foo: ["0"],
    })
    const expected = chrome50Score + otherScore
    assert.equal(actual, expected)
  }
}

console.log("passed")
