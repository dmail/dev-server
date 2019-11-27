// eslint-disable-next-line import/no-unresolved
import groupMap from "/.jsenv/groupMap.json"
// eslint-disable-next-line import/no-unresolved
import { chunkId } from "/.jsenv/env.js"
import { computeCompileIdFromGroupId } from "../platform/computeCompileIdFromGroupId.js"
import { resolvePlatformGroup } from "../platform/resolvePlatformGroup.js"

const compileId = computeCompileIdFromGroupId({
  groupId: resolvePlatformGroup({ groupMap }),
  groupMap,
})
// eslint-disable-next-line import/no-dynamic-require
module.exports = require(`./${compileId}/${chunkId}`)
