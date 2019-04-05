import { memoizeOnce } from "/node_modules/@dmail/helper/src/memoizeOnce.js"
import { fetchUsingXHR } from "./fetchUsingXHR.js"
import { loadCompileMeta } from "./loadCompileMeta.js"
import { createSystemImporter } from "./system/createSystemImporter.js"

export const loadImporter = memoizeOnce(async ({ compileInto, compileServerOrigin }) => {
  // importer depends on informer, but this is an implementation detail
  const { compileId } = await loadCompileMeta({
    compileInto,
    compileServerOrigin,
  })

  // this importMap is just wrapped into /${compileInto}/${compileId}/ from an other importMap
  // we could wrap the globalImportMap here instead of fetching it
  const importMapHref = `${compileServerOrigin}/${compileInto}/importMap.${compileId}.json`
  const importMapResponse = await fetchHref(importMapHref)
  const importMap = JSON.parse(importMapResponse.body)

  const systemImporter = createSystemImporter({
    importMap,
    compileInto,
    compileServerOrigin,
    compileId,
    fetchSource,
  })

  return systemImporter
})

const fetchHref = async (href) => {
  const response = await fetchUsingXHR(href)
  if (response.status < 200 || response.status >= 400) {
    return Promise.reject(response)
  }
  return response
}

const fetchSource = ({ href, importer }) => {
  return fetchUsingXHR(href, {
    "x-module-referer": importer || href,
  })
}
