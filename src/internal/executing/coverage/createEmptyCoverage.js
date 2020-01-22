import { require } from "../../require.js"

const { createFileCoverage } = require("istanbul-lib-coverage")

export const createEmptyCoverage = (relativeUrl) => createFileCoverage(relativeUrl).toJSON()
