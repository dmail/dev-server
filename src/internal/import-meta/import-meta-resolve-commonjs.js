// eslint-disable-next-line import/no-unresolved
import importMap from "/jsenv.importmap"
import { normalizeImportMap, resolveImport } from "@jsenv/import-map"
import url from "./import-meta-url-commonjs.js"

const resolve = (specifier) => {
  return Promise.resolve(
    resolveImport({
      specifier,
      importer: url,
      importMap: memoizedGetImportMap(),
      defaultExtension: false,
    }),
  )
}

// better for perf and helps rollup to tree shake this out
// when import.meta.resolve is not used
let memoizedImportMap
const memoizedGetImportMap = () => {
  if (memoizedImportMap) return memoizedImportMap
  memoizedImportMap = normalizeImportMap(importMap, url)
  return memoizedImportMap
}

export default resolve
