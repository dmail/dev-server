import { genericImportCompiledFile } from "../genericImportCompiledFile.js"
import { loadCompileMeta } from "./loadCompileMeta.js"
import { loadImporter } from "./loadImporter.js"

export const importCompiledFile = ({ compileInto, remoteRoot, file }) =>
  genericImportCompiledFile({
    loadCompileMeta: () => loadCompileMeta({ compileInto, remoteRoot }),
    loadImporter: () => loadImporter({ compileInto, remoteRoot }),
    remoteRoot,
    compileInto,
    file,
  })
