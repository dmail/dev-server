import { pathnameToDirname } from "@jsenv/module-resolution"
import { pathnameToOperatingSystemFilename } from "../operating-system-filename.js"

export const getCacheFilename = ({ projectPathname, compileRelativePath }) =>
  pathnameToOperatingSystemFilename(`${projectPathname}${compileRelativePath}__asset__/cache.json`)

// the fact an asset filename is relative to projectFolder + compiledpathnameRelative
// is strange considering a source filename is relative to projectFolder
// I think it would make more sense to make them relative to the cache.json
// file itself but that's for later
export const getAssetFilename = ({ projectPathname, compileRelativePath, asset }) =>
  pathnameToOperatingSystemFilename(
    `${projectPathname}/${pathnameToDirname(compileRelativePath.slice(1))}/${asset}`,
  )

export const getCompiledFilename = ({ projectPathname, compileRelativePath }) =>
  pathnameToOperatingSystemFilename(`${projectPathname}${compileRelativePath}`)

export const getSourceFilename = ({ projectPathname, sourceRelativePath }) =>
  pathnameToOperatingSystemFilename(`${projectPathname}/${sourceRelativePath}`)
