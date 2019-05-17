import { readFileSync } from "fs"
import { pathnameToOperatingSystemPath } from "../operating-system-path.js"

// TODO: make this async
export const readProjectImportMap = ({ projectPathname, importMapRelativePath }) => {
  if (!importMapRelativePath) return {}
  try {
    const buffer = readFileSync(
      pathnameToOperatingSystemPath(`${projectPathname}/${importMapRelativePath}`),
    )
    const source = String(buffer)
    return JSON.parse(source)
  } catch (e) {
    if (e && e.code === "ENOENT") {
      return {}
    }
    throw e
  }
}
