import { basename } from "path"
import { assert } from "@dmail/assert"
import { generateCommonJsBundle } from "../../../index.js"
import { importMetaUrlToDirectoryRelativePath } from "../../importMetaUrlToDirectoryRelativePath.js"
import { requireCommonJsBundle } from "../require-commonjs-bundle.js"
import {
  COMMONJS_BUNDLING_TEST_GENERATE_PARAM,
  COMMONJS_BUNDLING_TEST_REQUIRE_PARAM,
} from "../commonjs-bundling-test-param.js"

const testDirectoryRelativePath = importMetaUrlToDirectoryRelativePath(import.meta.url)
const testDirectoryBasename = basename(testDirectoryRelativePath)
const bundleDirectoryRelativePath = `${testDirectoryRelativePath}dist/commonjs`
const mainFileBasename = `${testDirectoryBasename}.js`

await generateCommonJsBundle({
  ...COMMONJS_BUNDLING_TEST_GENERATE_PARAM,
  bundleDirectoryRelativePath,
  entryPointMap: {
    main: `${testDirectoryRelativePath}${mainFileBasename}`,
  },
})

const {
  namespace: { ask },
} = await requireCommonJsBundle({
  ...COMMONJS_BUNDLING_TEST_REQUIRE_PARAM,
  bundleDirectoryRelativePath,
})
const iterator = ask()
{
  const actual = await iterator.next()
  const expected = { value: 42, done: false }
  assert({ actual, expected })
}
{
  const actual = await iterator.next()
  const expected = { value: undefined, done: true }
  assert({ actual, expected })
}
