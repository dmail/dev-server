import { assert } from "@jsenv/assert"
import { resolveDirectoryUrl, urlToRelativeUrl } from "@jsenv/filesystem"

import { execute, chromiumRuntime } from "@jsenv/core"
import { jsenvCoreDirectoryUrl } from "@jsenv/core/src/internal/jsenvCoreDirectoryUrl.js"
import {
  EXECUTE_TEST_PARAMS,
  LAUNCH_TEST_PARAMS,
} from "@jsenv/core/test/TEST_PARAMS_LAUNCH_BROWSER.js"

const { server } = await import("./script/serve.js")
try {
  const testDirectoryUrl = resolveDirectoryUrl("./", import.meta.url)
  const testDirectoryRelativeUrl = urlToRelativeUrl(
    testDirectoryUrl,
    jsenvCoreDirectoryUrl,
  )
  const test = async ({ forceCompilation } = {}) => {
    const result = await execute({
      ...EXECUTE_TEST_PARAMS,
      jsenvDirectoryRelativeUrl: `${testDirectoryRelativeUrl}.jsenv`,
      runtime: chromiumRuntime,
      runtimeParams: {
        ...LAUNCH_TEST_PARAMS,
        forceCompilation,
      },
      fileRelativeUrl: `${testDirectoryRelativeUrl}main.html`,
      collectCompileServerInfo: true,
    })
    return result
  }

  {
    const { namespace, compileServerOrigin } = await test({
      forceCompilation: true,
    })
    const actual = {
      namespace,
    }
    const expected = {
      namespace: {
        "./main.js": {
          status: "completed",
          namespace: {
            url: `${compileServerOrigin}/test/external_url/.jsenv/dev/best/test/external_url/.jsenv/.remote/http$3a$2f$2flocalhost$3a9999/constants.js?foo=bar`,
          },
        },
      },
    }
    assert({ actual, expected })
  }

  {
    const { namespace } = await test()
    const actual = {
      namespace,
    }
    const expected = {
      namespace: {
        "./main.js": {
          status: "completed",
          namespace: {
            url: "http://localhost:9999/constants.js?foo=bar",
          },
        },
      },
    }
    assert({ actual, expected })
  }
} finally {
  server.stop()
}
