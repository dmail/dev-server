import {
  applyNodeEsmResolution,
  lookupPackageScope,
  readPackageJson,
} from "@jsenv/core/packages/node-esm-resolution/main.js"

export const jsenvPluginNodeEsmResolution = ({
  // https://nodejs.org/api/esm.html#resolver-algorithm-specification
  packageConditions = ["browser", "import"],
} = {}) => {
  const nodeEsmResolution = {
    name: "jsenv:node_esm_resolve",
    appliesDuring: "*",
    resolve: {
      js_import_export: ({ parentUrl, specifier }) => {
        const { url } = applyNodeEsmResolution({
          conditions: packageConditions,
          parentUrl,
          specifier,
        })
        // should I restore eventual search params that would be lost during node esm resolution?
        return url
      },
    },
    load: ({ url }) => {
      if (url.startsWith("file:///@ignore/")) {
        return {
          content: "export default {}",
        }
      }
      return null
    },
  }

  const packageVersionInUrl = {
    name: "jsenv:package_url_version",
    appliesDuring: {
      dev: true,
      test: true,
    },
    deriveMetaFromUrl: ({ projectDirectoryUrl, url }) => {
      if (!url.startsWith("file:")) {
        return null
      }
      // without this check a file inside a project without package.json
      // could be considered as a node module if there is a ancestor package.json
      // but we want to version only node modules
      if (!url.includes("/node_modules/")) {
        return null
      }
      const packageUrl = lookupPackageScope(url)
      if (!packageUrl) {
        return null
      }
      if (packageUrl === projectDirectoryUrl) {
        return null
      }
      const packageVersion = readPackageJson(packageUrl).version
      return { urlVersion: packageVersion }
    },
  }

  return [nodeEsmResolution, packageVersionInUrl]
}
