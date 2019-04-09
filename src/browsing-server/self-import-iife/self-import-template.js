/* eslint-disable */
import { compileInto, compileServerOrigin, filenameRelative } from "\0self-import-options"
/* eslint-enable */
import { executeCompiledFile } from "../../platform/browser/browserPlatform.js"

const SYSTEMJS_RELATIVE_PATH = "src/systemjs/s.js"

import(`../../../${SYSTEMJS_RELATIVE_PATH}`).then(() => {
  executeCompiledFile({
    compileInto,
    compileServerOrigin,
    filenameRelative,
  })
})
