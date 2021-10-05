import { assert } from "@jsenv/assert"
import { resolveUrl, urlToRelativeUrl } from "@jsenv/filesystem"

import {
  execute,
  launchChromium,
  commonJsToJavaScriptModule,
} from "@jsenv/core"
import { require } from "@jsenv/core/src/internal/require.js"
import { jsenvCoreDirectoryUrl } from "@jsenv/core/src/internal/jsenvCoreDirectoryUrl.js"
import { EXECUTE_TEST_PARAMS } from "@jsenv/core/test/TEST_PARAMS_EXECUTE.js"

const transformReactJSX = require("@babel/plugin-transform-react-jsx")

const testDirectoryUrl = resolveUrl("./", import.meta.url)
const testDirectoryRelativeUrl = urlToRelativeUrl(
  testDirectoryUrl,
  jsenvCoreDirectoryUrl,
)
const jsenvDirectoryRelativeUrl = `${testDirectoryRelativeUrl}.jsenv/`
const htmlFileRelativeUrl = `${testDirectoryRelativeUrl}importing_react.html`

const actual = await execute({
  ...EXECUTE_TEST_PARAMS,
  jsenvDirectoryRelativeUrl,
  customCompilers: {
    "./node_modules/react/index.js": commonJsToJavaScriptModule,
    "./node_modules/react-dom/index.js": async (options) => {
      return commonJsToJavaScriptModule({
        ...options,
        external: ["react"],
      })
    },
  },
  babelPluginMap: {
    "transform-react-jsx": [
      transformReactJSX,
      { pragma: "React.createElement", pragmaFrag: "React.Fragment" },
    ],
  },
  launch: launchChromium,
  stopAfterExecute: true,
  fileRelativeUrl: htmlFileRelativeUrl,
})
const expected = {
  status: "completed",
  namespace: {
    "./importing_react.jsx": {
      status: "completed",
      namespace: {
        ready: 42,
        reactExportNames: [
          "Children",
          "Component",
          "Fragment",
          "Profiler",
          "PureComponent",
          "StrictMode",
          "Suspense",
          "__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED",
          "cloneElement",
          "createContext",
          "createElement",
          "createFactory",
          "createRef",
          "default",
          "forwardRef",
          "isValidElement",
          "lazy",
          "memo",
          "useCallback",
          "useContext",
          "useDebugValue",
          "useEffect",
          "useImperativeHandle",
          "useLayoutEffect",
          "useMemo",
          "useReducer",
          "useRef",
          "useState",
          "version",
        ],
      },
    },
  },
}
assert({ actual, expected })
