/*
 * Some code uses globals specific to Node.js in code meant to run in browsers...
 * This plugin will replace some node globals to things compatible with web:
 * - process.env.NODE_ENV
 * - __filename
 * - __dirname
 * - global
 */

import { applyBabelPlugins } from "@jsenv/utils/js_ast/apply_babel_plugins.js"
import { createMagicSource } from "@jsenv/utils/sourcemap/magic_source.js"

import { babelPluginMetadataExpressionPaths } from "./utils/babel_plugin_metadata_expression_paths.js"

export const jsenvPluginCommonJsGlobals = () => {
  return {
    name: "jsenv:commonjs_globals",
    appliesDuring: "*",
    transform: {
      js_module: async ({ url, generatedUrl, content }, { scenario }) => {
        const replaceMap = {
          "process.env.NODE_ENV": `("${
            scenario === "dev" || scenario === "test" ? "dev" : "prod"
          }")`,
          "global": "globalThis",
          "__filename": `import.meta.url.slice('file:///'.length)`,
          "__dirname": `import.meta.url.slice('file:///'.length).replace(/[\\\/\\\\][^\\\/\\\\]*$/, '')`,
        }
        const { metadata } = await applyBabelPlugins({
          babelPlugins: [
            [
              babelPluginMetadataExpressionPaths,
              {
                replaceMap,
                allowConflictingReplacements: true,
              },
            ],
          ],
          url,
          generatedUrl,
          content,
        })
        const { expressionPaths } = metadata
        const keys = Object.keys(expressionPaths)
        if (keys.length === 0) {
          return null
        }
        const magicSource = createMagicSource(content)
        keys.forEach((key) => {
          expressionPaths[key].forEach((path) => {
            magicSource.replace({
              start: path.node.start,
              end: path.node.end,
              replacement: replaceMap[key],
            })
          })
        })
        return magicSource.toContentAndSourcemap()
      },
    },
  }
}
