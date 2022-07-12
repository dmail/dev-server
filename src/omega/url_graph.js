import { urlToRelativeUrl } from "@jsenv/urls"
import { urlSpecifierEncoding } from "./url_specifier_encoding.js"

export const createUrlGraph = ({
  clientFileChangeCallbackList,
  clientFilesPruneCallbackList,
} = {}) => {
  const urlInfoMap = new Map()
  const getUrlInfo = (url) => urlInfoMap.get(url)
  const deleteUrlInfo = (url) => {
    const urlInfo = urlInfoMap.get(url)
    if (urlInfo) {
      urlInfoMap.delete(url)
      if (urlInfo.sourcemapReference) {
        deleteUrlInfo(urlInfo.sourcemapReference.url)
      }
    }
  }

  const reuseOrCreateUrlInfo = (url) => {
    const existingUrlInfo = getUrlInfo(url)
    if (existingUrlInfo) return existingUrlInfo
    const urlInfo = createUrlInfo(url)
    urlInfoMap.set(url, urlInfo)
    return urlInfo
  }
  const inferReference = (specifier, parentUrl) => {
    const parentUrlInfo = getUrlInfo(parentUrl)
    if (!parentUrlInfo) {
      return null
    }
    const firstReferenceOnThatUrl = parentUrlInfo.references.find(
      (reference) => {
        return urlSpecifierEncoding.decode(reference) === specifier
      },
    )
    return firstReferenceOnThatUrl
  }
  const findDependent = (url, predicate) => {
    const urlInfo = getUrlInfo(url)
    if (!urlInfo) {
      return null
    }
    const visitDependents = (urlInfo) => {
      for (const dependentUrl of urlInfo.dependents) {
        const dependent = getUrlInfo(dependentUrl)
        if (predicate(dependent)) {
          return dependent
        }
        return visitDependents(dependent)
      }
      return null
    }
    return visitDependents(urlInfo)
  }

  const updateReferences = (urlInfo, references) => {
    const dependencyUrls = []
    references.forEach((reference) => {
      if (reference.isRessourceHint) {
        // ressource hint are a special kind of reference.
        // They are a sort of weak reference to an url.
        // We ignore them so that url referenced only by ressource hints
        // have url.dependents.size === 0 and can be considered as not used
        // It means html won't consider url referenced solely
        // by <link> as dependency and it's fine
        return
      }
      if (dependencyUrls.includes(reference.url)) {
        return
      }
      dependencyUrls.push(reference.url)
    })
    pruneDependencies(
      urlInfo,
      Array.from(urlInfo.dependencies).filter(
        (dep) => !dependencyUrls.includes(dep),
      ),
    )
    urlInfo.references = references
    dependencyUrls.forEach((dependencyUrl) => {
      const dependencyUrlInfo = reuseOrCreateUrlInfo(dependencyUrl)
      urlInfo.dependencies.add(dependencyUrl)
      dependencyUrlInfo.dependents.add(urlInfo.url)
    })
    return urlInfo
  }
  const pruneDependencies = (firstUrlInfo, urlsToRemove) => {
    const prunedUrlInfos = []
    const removeDependencies = (urlInfo, urlsToPrune) => {
      urlsToPrune.forEach((urlToPrune) => {
        urlInfo.dependencies.delete(urlToPrune)
        const dependency = getUrlInfo(urlToPrune)
        if (!dependency) {
          return
        }
        dependency.dependents.delete(urlInfo.url)
        if (dependency.dependents.size === 0) {
          removeDependencies(dependency, Array.from(dependency.dependencies))
          prunedUrlInfos.push(dependency)
        }
      })
    }
    removeDependencies(firstUrlInfo, urlsToRemove)
    if (prunedUrlInfos.length === 0) {
      return
    }
    prunedUrlInfos.forEach((prunedUrlInfo) => {
      prunedUrlInfo.modifiedTimestamp = Date.now()
      // should we delete?
      // delete urlInfos[prunedUrlInfo.url]
    })
    if (clientFilesPruneCallbackList) {
      clientFilesPruneCallbackList.forEach((callback) => {
        callback({
          firstUrlInfo,
          prunedUrlInfos,
        })
      })
    }
  }

  if (clientFileChangeCallbackList) {
    clientFileChangeCallbackList.push(({ url }) => {
      const urlInfo = getUrlInfo(url)
      if (urlInfo) {
        considerModified(urlInfo, Date.now())
      }
    })
  }

  const considerModified = (urlInfo, modifiedTimestamp = Date.now()) => {
    const seen = []
    const iterate = (urlInfo) => {
      if (seen.includes(urlInfo.url)) {
        return
      }
      seen.push(urlInfo.url)
      urlInfo.modifiedTimestamp = modifiedTimestamp
      urlInfo.contentEtag = undefined
      urlInfo.dependents.forEach((dependentUrl) => {
        const dependentUrlInfo = getUrlInfo(dependentUrl)
        const { hotAcceptDependencies = [] } = dependentUrlInfo.data
        if (!hotAcceptDependencies.includes(urlInfo.url)) {
          iterate(dependentUrlInfo)
        }
      })
      urlInfo.dependencies.forEach((dependencyUrl) => {
        const dependencyUrlInfo = getUrlInfo(dependencyUrl)
        if (dependencyUrlInfo.isInline) {
          iterate(dependencyUrlInfo)
        }
      })
    }
    iterate(urlInfo)
  }

  const getRelatedUrlInfos = (url) => {
    const urlInfosUntilNotInline = []
    const parentUrlInfo = getUrlInfo(url)
    if (parentUrlInfo) {
      urlInfosUntilNotInline.push(parentUrlInfo)
      if (parentUrlInfo.inlineUrlSite) {
        urlInfosUntilNotInline.push(
          ...getRelatedUrlInfos(parentUrlInfo.inlineUrlSite.url),
        )
      }
    }
    return urlInfosUntilNotInline
  }

  return {
    urlInfoMap,
    reuseOrCreateUrlInfo,
    getUrlInfo,
    deleteUrlInfo,
    inferReference,
    findDependent,
    updateReferences,
    considerModified,
    getRelatedUrlInfos,

    toObject: () => {
      const data = {}
      urlInfoMap.forEach((urlInfo) => {
        data[urlInfo.url] = urlInfo
      })
      return data
    },
    toJSON: (rootDirectoryUrl) => {
      const data = {}
      urlInfoMap.forEach((urlInfo) => {
        const dependencyUrls = Array.from(urlInfo.dependencies)
        if (dependencyUrls.length) {
          const relativeUrl = urlToRelativeUrl(urlInfo.url, rootDirectoryUrl)
          data[relativeUrl] = dependencyUrls.map((dependencyUrl) =>
            urlToRelativeUrl(dependencyUrl, rootDirectoryUrl),
          )
        }
      })
      return data
    },
  }
}

const createUrlInfo = (url) => {
  return {
    modifiedTimestamp: 0,
    contentEtag: null,
    dependsOnPackageJson: false,
    isValid,
    data: {}, // plugins can put whatever they want here
    references: [],
    dependencies: new Set(),
    dependents: new Set(),
    type: undefined, // "html", "css", "js_classic", "js_module", "importmap", "json", "webmanifest", ...
    subtype: undefined, // "worker", "service_worker", "shared_worker" for js, otherwise undefined
    contentType: "", // "text/html", "text/css", "text/javascript", "application/json", ...
    url,
    originalUrl: undefined,
    generatedUrl: null,
    filename: "",
    isEntryPoint: false,
    isInline: false,
    inlineUrlSite: null,
    shouldHandle: undefined,
    originalContent: undefined,
    content: undefined,

    sourcemap: null,
    sourcemapReference: null,
    sourcemapIsWrong: false,
    timing: {},
    headers: {},
  }
}

const isValid = () => true
