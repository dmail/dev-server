import { createBrowserSystem } from "./createBrowserSystem.js"
import { createImportTracker } from "../../createImportTracker.js"

export const createSystemImporter = ({
  importMap,
  compileInto,
  compileServerOrigin,
  compileId,
  fetchSource,
}) => {
  const importTracker = createImportTracker()

  const browserSystem = createBrowserSystem({
    importMap,
    compileInto,
    compileServerOrigin,
    compileId,
    fetchSource,
  })

  const importFile = (href) => {
    importTracker.markHrefAsImported(href)
    return browserSystem.import(href)
  }

  return { importFile }
}
