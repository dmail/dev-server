import { require } from "../require.js"

const humanizeDuration = require("humanize-duration")

export const formatDuration = (duration) => {
  return humanizeDuration(duration, { largest: 2, maxDecimalPoints: 2 })
}
