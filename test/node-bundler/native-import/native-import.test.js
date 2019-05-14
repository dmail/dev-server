import { assert } from "@dmail/assert"
import { hrefToFolderJsenvRelative } from "../../../src/hrefToFolderJsenvRelative.js"
import { ROOT_FOLDER } from "../../../src/ROOT_FOLDER.js"
import { bundleNode } from "../../../index.js"
import { importNodeBundle } from "../import-node-bundle.js"

const testFolderRelative = hrefToFolderJsenvRelative(import.meta.url)
const projectFolder = `${ROOT_FOLDER}`
const bundleInto = `${testFolderRelative}/dist/node`

await bundleNode({
  projectFolder,
  into: bundleInto,
  entryPointMap: {
    main: `${testFolderRelative}/native-import.js`,
  },
  logLevel: "off",
})

const { namespace: actual } = await importNodeBundle({
  bundleFolder: `${projectFolder}/${bundleInto}`,
  file: `main.js`,
})
const expected = "function"
assert({ actual, expected })
