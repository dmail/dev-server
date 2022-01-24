import { jsenvCoreDirectoryUrl } from "@jsenv/core/src/internal/jsenvCoreDirectoryUrl.js"

export const START_DEV_SERVER_TEST_PARAMS = {
  logLevel: "warn",
  protocol: "http",
  projectDirectoryUrl: jsenvCoreDirectoryUrl,
  jsenvDirectoryClean: true,
  keepProcessAlive: false,
  // livereloading: false,
}
