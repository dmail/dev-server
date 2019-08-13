import { pathnameToOperatingSystemPath } from "@jsenv/operating-system-path"
import { hrefToPathname } from "@jsenv/module-resolution"

const commonjs = import.meta.require("rollup-plugin-commonjs")
const nodeResolve = import.meta.require("rollup-plugin-node-resolve")
const builtins = import.meta.require("rollup-plugin-node-builtins")
const createJSONRollupPlugin = import.meta.require("rollup-plugin-json")
const createNodeGlobalRollupPlugin = import.meta.require("rollup-plugin-node-globals")
const createReplaceRollupPlugin = import.meta.require("rollup-plugin-replace")
const { rollup } = import.meta.require("rollup")

export const convertCommonJsWithRollup = async ({
  sourceHref,
  replaceGlobalObject = true,
  replaceGlobalFilename = true,
  replaceGlobalDirname = true,
  replaceProcessEnvNodeEnv = true,
  replaceProcess = true,
  replaceBuffer = true,
  processEnvNodeEnv = process.env.NODE_ENV,
  replaceMap = {},
  convertBuiltinsToBrowser = true,
  external = [],
} = {}) => {
  if (!sourceHref.startsWith("file:///")) {
    // it's possible to make rollup compatible with http:// for instance
    // as we do in @jsenv/bundling
    // however it's an exotic use case for now
    throw new Error(`compatible only with file:// protocol, got ${sourceHref}`)
  }

  const sourcePathname = hrefToPathname(sourceHref)
  const filename = pathnameToOperatingSystemPath(sourcePathname)

  const nodeBuiltinsRollupPlugin = builtins()

  const nodeResolveRollupPlugin = nodeResolve({
    mainFields: ["main"],
  })

  const jsonRollupPlugin = createJSONRollupPlugin()

  const nodeGlobalRollupPlugin = createNodeGlobalRollupPlugin({
    global: false, // handled by replaceMap
    dirname: false, // handled by replaceMap
    filename: false, //  handled by replaceMap
    process: replaceProcess,
    buffer: replaceBuffer,
  })

  const commonJsRollupPlugin = commonjs()

  const rollupBundle = await rollup({
    input: filename,
    inlineDynamicImports: true,
    external,
    plugins: [
      commonJsRollupPlugin,
      createReplaceRollupPlugin({
        ...(replaceProcessEnvNodeEnv
          ? { "process.env.NODE_ENV": JSON.stringify(processEnvNodeEnv) }
          : {}),
        ...(replaceGlobalObject ? { global: "globalThis" } : {}),
        ...(replaceGlobalFilename ? { __filename: __filenameReplacement } : {}),
        ...(replaceGlobalDirname ? { __dirname: __dirnameReplacement } : {}),
        ...replaceMap,
      }),
      nodeGlobalRollupPlugin,
      ...(convertBuiltinsToBrowser ? [nodeBuiltinsRollupPlugin] : []),
      nodeResolveRollupPlugin,
      jsonRollupPlugin,
    ],
  })

  const generateOptions = {
    // https://rollupjs.org/guide/en#output-format
    format: "esm",
    // entryFileNames: `./[name].js`,
    // https://rollupjs.org/guide/en#output-sourcemap
    sourcemap: true,
    // we could exclude them
    // but it's better to put them directly
    // in case source files are not reachable
    // for whatever reason
    sourcemapExcludeSources: false,
  }

  const result = await rollupBundle.generate(generateOptions)

  return result.output[0]
}

const __filenameReplacement = `import.meta.url.slice('file:///'.length)`

const __dirnameReplacement = `import.meta.url.slice('file:///'.length).replace(/[\\\/\\\\][^\\\/\\\\]*$/, '')`
