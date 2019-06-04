import { assert } from "@dmail/assert"
import { importMetaURLToFolderJsenvRelativePath } from "../../../../src/import-meta-url-to-folder-jsenv-relative-path.js"
import { generateCommonJsBundle } from "../../../../index.js"
import { importNodeBundle } from "../import-node-bundle.js"
import {
  NODE_BUNDLER_TEST_PARAM,
  NODE_BUNDLER_TEST_IMPORT_PARAM,
} from "../node-bundler-test-param.js"

const folderJsenvRelativePath = importMetaURLToFolderJsenvRelativePath(import.meta.url)
const bundleIntoRelativePath = `${folderJsenvRelativePath}/dist/node`
const fileRelativePath = `${folderJsenvRelativePath}/dynamic-import-origin-relative.js`

await generateCommonJsBundle({
  ...NODE_BUNDLER_TEST_PARAM,
  bundleIntoRelativePath,
  entryPointMap: {
    main: fileRelativePath,
  },
})

const { namespace } = await importNodeBundle({
  ...NODE_BUNDLER_TEST_IMPORT_PARAM,
  bundleIntoRelativePath,
})
const actual = await namespace
const expected = { default: 42 }
assert({ actual, expected })
