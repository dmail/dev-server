import { resolveImport, remapResolvedImport } from "/node_modules/@jsenv/module-resolution/index.js"
import { hrefToFilenameRelative } from "../../hrefToFilenameRelative.js"
import { valueInstall } from "../../valueInstall.js"
import { fromFunctionReturningNamespace, fromHref } from "../../registerModuleFrom/index.js"
import { fetchSource } from "../fetchSource.js"
import { evalSource } from "../evalSource.js"

const GLOBAL_SPECIFIER = "global"

export const createBrowserSystem = ({ compileInto, compileServerOrigin, importMap }) => {
  if (typeof window.System === "undefined") throw new Error(`window.System is undefined`)

  const browserSystem = new window.System.constructor()

  browserSystem.resolve = (specifier, importer) => {
    if (specifier === GLOBAL_SPECIFIER) return specifier

    const resolvedImport = resolveImport({
      importer,
      specifier,
    })

    return remapResolvedImport({
      importMap,
      importerHref: importer,
      resolvedImport,
    })
  }

  browserSystem.instantiate = (href, importerHref) => {
    if (href === GLOBAL_SPECIFIER) return fromFunctionReturningNamespace(() => window)

    return fromHref({
      href,
      importerHref,
      fetchSource,
      instantiateJavaScript: (source, realHref) => {
        const uninstallSystemGlobal = valueInstall(window, "System", browserSystem)
        try {
          evalSource(source, realHref)
        } finally {
          uninstallSystemGlobal()
        }

        return browserSystem.getRegister()
      },
    })
  }

  browserSystem.createContext = (moduleUrl) => {
    const filenameRelative = hrefToFilenameRelative(moduleUrl, { compileInto, compileServerOrigin })
    const fileURL = `${compileServerOrigin}/${filenameRelative}`
    const url = fileURL

    return { url }
  }

  return browserSystem
}
