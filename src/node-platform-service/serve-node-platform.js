import { serveFile } from "@dmail/server"
import { serveNodeCommonJsBundle } from "../bundling/index.js"

const NODE_PLATFORM_CLIENT_PATHNAME = `/.jsenv/node-platform.js`
const NODE_PLATFORM_DATA_CLIENT_PATHNAME = `/.jsenv/node-platform-data.js`
const NODE_GROUP_RESOLVER_CLIENT_PATHNAME = `/.jsenv/node-group-resolver.js`
const IMPORT_MAP_CLIENT_PATHNAME = `/.jsenv/import-map.json`

export const serveNodePlatform = ({
  projectPathname,
  compileIntoRelativePath,
  importMapRelativePath,
  importDefaultExtension,
  nodePlatformRelativePath,
  nodeGroupResolverRelativePath,
  babelPluginMap,
  groupMap,
  // projectFileRequestedCallback,
  request: { ressource, method, headers },
}) => {
  if (ressource.startsWith(`${NODE_PLATFORM_CLIENT_PATHNAME}__asset__/`)) {
    return serveFile(`${projectPathname}${compileIntoRelativePath}${ressource}`, {
      method,
      headers,
    })
  }

  if (ressource !== NODE_PLATFORM_CLIENT_PATHNAME) return null

  return serveNodeCommonJsBundle({
    projectPathname,
    compileIntoRelativePath,
    importMapRelativePath,
    babelPluginMap,
    sourceRelativePath: nodePlatformRelativePath,
    compileRelativePath: NODE_PLATFORM_CLIENT_PATHNAME,
    inlineSpecifierMap: {
      [NODE_PLATFORM_DATA_CLIENT_PATHNAME]: () =>
        generateNodePlatformDataSource({
          compileIntoRelativePath,
          groupMap,
          importDefaultExtension,
        }),
      [NODE_GROUP_RESOLVER_CLIENT_PATHNAME]: `${projectPathname}${nodeGroupResolverRelativePath}`,
      [IMPORT_MAP_CLIENT_PATHNAME]: `${projectPathname}${importMapRelativePath}`,
    },
    headers,
  })
}

const generateNodePlatformDataSource = ({
  compileIntoRelativePath,
  groupMap,
  importDefaultExtension,
}) =>
  `export const compileIntoRelativePath = ${JSON.stringify(compileIntoRelativePath)}
export const groupMap = ${JSON.stringify(groupMap)}
export const importDefaultExtension = ${JSON.stringify(importDefaultExtension)}`
