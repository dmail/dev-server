import { ensureEmptyDirectory } from "@jsenv/filesystem"

export const loadUrlGraph = async ({
  urlGraph,
  kitchen,
  startLoading,
  outDirectoryUrl,
  clientRuntimeCompat,
}) => {
  if (outDirectoryUrl) {
    await ensureEmptyDirectory(outDirectoryUrl)
  }
  const promises = []
  const cook = ({ urlInfo, ...rest }) => {
    const promiseFromData = urlInfo.data.promise
    if (promiseFromData) return promiseFromData
    const promise = _cook({
      urlInfo,
      outDirectoryUrl,
      clientRuntimeCompat,
      ...rest,
    })
    promises.push(promise)
    urlInfo.data.promise = promise
    return promise
  }
  const _cook = async ({ urlInfo, ...rest }) => {
    await kitchen.cook({
      urlInfo,
      cookDuringCook: cook,
      ...rest,
    })
    const { references } = urlInfo
    references.forEach((reference) => {
      // we use reference.generatedUrl to mimic what a browser would do:
      // do a fetch to the specifier as it found it in the file
      if (reference.url !== reference.generatedUrl) {
        debugger
      }
      const referencedUrlInfo = urlGraph.getUrlInfo(reference.generatedUrl)
      cook({
        reference,
        urlInfo: referencedUrlInfo,
      })
    })
  }
  startLoading(
    ({ trace, parentUrl = kitchen.rootDirectoryUrl, type, specifier }) => {
      const [entryReference, entryUrlInfo] = kitchen.prepareEntryPoint({
        trace,
        parentUrl,
        type,
        specifier,
      })
      entryUrlInfo.data.isEntryPoint = true
      cook({
        reference: entryReference,
        urlInfo: entryUrlInfo,
      })
      return [entryReference, entryUrlInfo]
    },
  )

  const waitAll = async () => {
    if (promises.length === 0) {
      return
    }
    const promisesToWait = promises.slice()
    promises.length = 0
    await Promise.all(promisesToWait)
    await waitAll()
  }
  await waitAll()
}
