import { assert } from "@dmail/assert"
import { importMetaURLToFolderJsenvRelativePath } from "../../../../src/import-meta-url-to-folder-jsenv-relative-path.js"
import { bundleBrowser } from "../../../../src/bundling/browser/bundleBrowser.js"
import { importBrowserBundle } from "../import-browser-bundle.js"
import {
  BROWSER_BUNDLER_TEST_PARAM,
  BROWSER_BUNDLER_TEST_IMPORT_PARAM,
} from "../browser-bundler-test-param.js"

const folderJsenvRelativePath = importMetaURLToFolderJsenvRelativePath(import.meta.url)
const bundleIntoRelativePath = `${folderJsenvRelativePath}/dist/browser`

await bundleBrowser({
  ...BROWSER_BUNDLER_TEST_PARAM,
  bundleIntoRelativePath,
  entryPointMap: {
    main: `${folderJsenvRelativePath}/import-meta-url.js`,
  },
})
const { namespace: actual, serverOrigin } = await importBrowserBundle({
  ...BROWSER_BUNDLER_TEST_IMPORT_PARAM,
  bundleIntoRelativePath,
})
const expected = { default: `${serverOrigin}/main.js` }
assert({ actual, expected })
