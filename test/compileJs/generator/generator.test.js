import { readFileSync } from "fs"
import { assert } from "@dmail/assert"
import { pathnameToOperatingSystemPath } from "@jsenv/operating-system-path"
import { jsenvCorePathname } from "../../../src/jsenvCorePath.js"
import { compileJs } from "../../../src/compileJs/compileJs.js"
import { fileHrefToFolderRelativePath } from "../../fileHrefToFolderRelativePath.js"
import { ensureGeneratorRuntimeImport } from "./ensureGeneratorRuntimeImport.js"

const { jsenvBabelPluginMap } = import.meta.require("@jsenv/babel-plugin-map")

const projectPathname = jsenvCorePathname
const folderRelativePath = fileHrefToFolderRelativePath(import.meta.url)
const sourceRelativePath = `${folderRelativePath}/generator.js`
const filename = pathnameToOperatingSystemPath(`${projectPathname}${sourceRelativePath}`)
const source = readFileSync(filename).toString()

const actual = await compileJs({
  projectPathname,
  sourceRelativePath,
  babelPluginMap: {
    ...jsenvBabelPluginMap,
    "ensure-generator-runtime-import": [ensureGeneratorRuntimeImport],
  },
})
const expected = {
  compiledSource: actual.compiledSource,
  contentType: "application/javascript",
  sources: [sourceRelativePath],
  sourcesContent: [source],
  assets: [`generator.js__asset__/generator.js.map`],
  assetsContent: [actual.assetsContent[0]],
}
assert({ actual, expected })
