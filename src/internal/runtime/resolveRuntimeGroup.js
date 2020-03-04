import { detectBrowser } from "./detectBrowser/detectBrowser.js"
import { detectNode } from "./detectNode/detectNode.js"
import { resolveGroup } from "./resolveGroup.js"

export const resolveRuntimeGroup = ({ groupMap }) => {
  if (typeof window === "object") return resolveGroup(detectBrowser(), { groupMap })
  if (typeof process === "object") return resolveGroup(detectNode(), { groupMap })
  // we should certainly throw with unknown runtime
  return null
}
