/* eslint-env browser */

import { getJavaScriptModuleResponseError } from "@jsenv/core/src/internal/runtime_client/module_registration.js"
import "@jsenv/core/src/internal/runtime_client/s.js"

export const createBrowserSystem = ({
  compileServerOrigin,
  compileDirectoryRelativeUrl,
  importResolver,
  fetchSource,
}) => {
  if (typeof window.System === "undefined") {
    throw new Error(`window.System is undefined`)
  }

  const browserSystem = window.System

  const resolve = (specifier, importer = document.location.href) => {
    return importResolver.resolveImport(specifier, importer)
  }

  browserSystem.resolve = resolve

  const instantiate = browserSystem.instantiate
  browserSystem.instantiate = async function (url, importerUrl) {
    const { importType, urlWithoutImportType } = extractImportTypeFromUrl(url)
    if (importType === "json") {
      const jsonModule = await instantiateAsJsonModule(urlWithoutImportType, {
        browserSystem,
        fetchSource,
      })
      return jsonModule
    }

    if (importType === "css") {
      const cssModule = await instantiateAsCssModule(urlWithoutImportType, {
        browserSystem,
        importerUrl,
        compileDirectoryRelativeUrl,
        fetchSource,
      })
      return cssModule
    }

    try {
      const registration = await instantiate.call(this, url, importerUrl)
      if (!registration) {
        throw new Error(
          `no registration found for JS at ${url}
--- importer url ---
${importerUrl}
--- navigator.vendor ---
${window.navigator.vendor}`,
        )
      }
      return registration
    } catch (e) {
      const jsenvError = await createDetailedInstantiateError({
        instantiateError: e,
        url,
        importerUrl,
        compileServerOrigin,
        compileDirectoryRelativeUrl,
        fetchSource,
      })
      throw jsenvError
    }
  }

  browserSystem.createContext = (importerUrl) => {
    return {
      url: importerUrl,
      resolve: (specifier) => resolve(specifier, importerUrl),
    }
  }

  return browserSystem
}

const extractImportTypeFromUrl = (url) => {
  const urlObject = new URL(url)
  const { search } = urlObject
  const searchParams = new URLSearchParams(search)

  const importType = searchParams.get("import_type")
  if (!importType) {
    return {}
  }

  searchParams.delete("import_type")
  urlObject.search = String(searchParams)
  return {
    importType,
    urlWithoutImportType: urlObject.href,
  }
}

const instantiateAsJsonModule = async (url, { browserSystem, fetchSource }) => {
  const response = await fetchSource(url, {
    contentTypeExpected: "application/json",
  })
  const json = await response.json()
  browserSystem.register([], (_export) => {
    return {
      execute: () => {
        _export("default", json)
      },
    }
  })
  const registration = browserSystem.getRegister(url)
  if (!registration) {
    throw new Error(
      `no registration found for JSON at ${url}. Navigator.vendor: ${window.navigator.vendor}. JSON text: ${json}`,
    )
  }
  return registration
}

const instantiateAsCssModule = async (
  url,
  { importerUrl, compileDirectoryRelativeUrl, browserSystem, fetchSource },
) => {
  const response = await fetchSource(url, {
    contentTypeExpected: "text/css",
  })

  // There is a logic inside "toolbar.eventsource.js" which is reloading
  // all link rel="stylesheet" when file ending with ".css" are modified
  // But here it would not work because we have to replace the css in
  // the adopted stylsheet + all module importing this css module
  // should be reinstantiated
  // -> store a livereload callback forcing whole page reload
  const compileDirectoryServerUrl = `${window.location.origin}/${compileDirectoryRelativeUrl}`
  const originalFileRelativeUrl = response.url.slice(
    compileDirectoryServerUrl.length,
  )
  window.__jsenv__.livereloadingCallbacks[originalFileRelativeUrl] = ({
    reloadPage,
  }) => {
    reloadPage()
  }

  const cssText = await response.text()
  const cssTextWithBaseUrl = cssWithBaseUrl({
    cssText,
    cssUrl: url,
    baseUrl: importerUrl,
  })

  browserSystem.register([], (_export) => {
    return {
      execute: () => {
        const sheet = new CSSStyleSheet()
        sheet.replaceSync(cssTextWithBaseUrl)
        _export("default", sheet)
      },
    }
  })
  const registration = browserSystem.getRegister(url)
  if (!registration) {
    throw new Error(
      `no registration found for CSS at ${url}. Navigator.vendor: ${window.navigator.vendor}. CSS text: ${cssTextWithBaseUrl}`,
    )
  }
  return registration
}

// CSSStyleSheet accepts a "baseUrl" parameter
// as documented in https://developer.mozilla.org/en-US/docs/Web/API/CSSStyleSheet/CSSStyleSheet#parameters
// Unfortunately the polyfill do not seems to implement it
// So we reuse "systemjs" strategy from https://github.com/systemjs/systemjs/blob/98609dbeef01ec62447e4b21449ce47e55f818bd/src/extras/module-types.js#L37
const cssWithBaseUrl = ({ cssUrl, cssText, baseUrl }) => {
  const cssDirectoryUrl = new URL("./", cssUrl).href
  const baseDirectoryUrl = new URL("./", baseUrl).href
  if (cssDirectoryUrl === baseDirectoryUrl) {
    return cssText
  }

  const cssTextRelocated = cssText.replace(
    /url\(\s*(?:(["'])((?:\\.|[^\n\\"'])+)\1|((?:\\.|[^\s,"'()\\])+))\s*\)/g,
    (match, quotes, relUrl1, relUrl2) => {
      const absoluteUrl = new URL(relUrl1 || relUrl2, cssUrl).href
      return `url(${quotes}${absoluteUrl}${quotes})`
    },
  )
  return cssTextRelocated
}

const createDetailedInstantiateError = async ({
  instantiateError,
  url,
  importerUrl,
  compileServerOrigin,
  compileDirectoryRelativeUrl,
  fetchSource,
}) => {
  let response
  try {
    response = await fetchSource(url, {
      importerUrl,
      contentTypeExpected: "application/javascript",
    })
  } catch (e) {
    e.code = "NETWORK_FAILURE"
    return e
  }

  const jsModuleResponseError = await getJavaScriptModuleResponseError(
    response,
    {
      url,
      importerUrl,
      compileServerOrigin,
      compileDirectoryRelativeUrl,
    },
  )
  return jsModuleResponseError || instantiateError
}
