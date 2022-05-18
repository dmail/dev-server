// data.usesTopLevelAwait could certainly be faster
// and should be split to an other plugin
import { applyBabelPlugins } from "@jsenv/utils/js_ast/apply_babel_plugins.js"
import {
  analyzeNewUrlCall,
  analyzeNewWorkerOrNewSharedWorker,
  analyzeImportScriptCalls,
  analyzeSystemRegisterCall,
  analyzeSystemImportCall,
  analyzeServiceWorkerRegisterCall,
} from "@jsenv/utils/js_ast/js_static_analysis.js"
import { createMagicSource } from "@jsenv/utils/sourcemap/magic_source.js"
import { isWebWorkerUrlInfo } from "@jsenv/core/src/omega/web_workers.js"

export const parseAndTransformJsUrls = async (urlInfo, context) => {
  const { usesTopLevelAwait, jsMentions } = await performJsStaticAnalysis(
    urlInfo,
  )
  urlInfo.data.usesTopLevelAwait = usesTopLevelAwait

  const { rootDirectoryUrl, referenceUtils } = context
  const actions = []
  const magicSource = createMagicSource(urlInfo.content)
  jsMentions.forEach((jsMention) => {
    const [reference] = referenceUtils.found({
      type: jsMention.type,
      subtype: jsMention.subtype,
      expectedType: jsMention.expectedType,
      expectedSubtype: jsMention.expectedSubtype || urlInfo.subtype,
      line: jsMention.line,
      column: jsMention.column,
      specifier: jsMention.specifier,
      data: jsMention.data,
      baseUrl: {
        "StringLiteral": jsMention.baseUrl,
        "window.origin": rootDirectoryUrl,
        "import.meta.url": urlInfo.url,
      }[jsMention.baseUrlType],
    })
    actions.push(async () => {
      magicSource.replace({
        start: jsMention.start,
        end: jsMention.end,
        replacement: await referenceUtils.readGeneratedSpecifier(reference),
      })
    })
  })
  await Promise.all(actions.map((action) => action()))
  return magicSource.toContentAndSourcemap()
}

const performJsStaticAnalysis = async (urlInfo) => {
  const isJsModule = urlInfo.type === "js_module"
  const isWebWorker = isWebWorkerUrlInfo(urlInfo)
  if (canSkipStaticAnalysis(urlInfo, { isJsModule, isWebWorker })) {
    return {
      usesTopLevelAwait: false,
      jsMentions: [],
    }
  }

  const { metadata } = await applyBabelPlugins({
    babelPlugins: [
      [babelPluginMetadataJsUrlMentions, { isJsModule, isWebWorker }],
    ],
    urlInfo,
  })
  const { usesTopLevelAwait, jsMentions } = metadata
  return {
    usesTopLevelAwait,
    jsMentions,
  }
}

const canSkipStaticAnalysis = (urlInfo, { isJsModule, isWebWorker }) => {
  const js = urlInfo.content
  if (isJsModule) {
    if (
      js.includes("await") ||
      js.includes("new URL(") ||
      js.includes("new Worker(") ||
      js.includes("new SharedWorker(") ||
      js.includes("serviceWorker.register(")
    ) {
      return false
    }
  }
  if (!isJsModule) {
    if (
      js.includes("System.") ||
      js.includes("new URL(") ||
      js.includes("new Worker(") ||
      js.includes("new SharedWorker(") ||
      js.includes("serviceWorker.register(")
    ) {
      return false
    }
  }
  if (isWebWorker && js.includes("importScripts(")) {
    return false
  }
  return true
}

/*
 * see also
 * https://github.com/jamiebuilds/babel-handbook/blob/master/translations/en/plugin-handbook.md
 * https://github.com/mjackson/babel-plugin-import-visitor
 *
 */
const babelPluginMetadataJsUrlMentions = (_, { isJsModule, isWebWorker }) => {
  return {
    name: "metadata-js-mentions",
    visitor: {
      Program(programPath, state) {
        const jsMentions = []
        let usesTopLevelAwait = false

        const callOneStaticAnalyzer = (path, analyzer) => {
          const returnValue = analyzer(path)
          if (returnValue === null) {
            return false
          }
          if (Array.isArray(returnValue)) {
            jsMentions.push(...returnValue)
            return true
          }
          if (typeof returnValue === "object") {
            jsMentions.push(returnValue)
            return true
          }
          return false
        }
        const callStaticAnalyzers = (path, analysers) => {
          for (const analyzer of analysers) {
            if (callOneStaticAnalyzer(path, analyzer)) {
              break
            }
          }
        }

        const visitors = {
          AwaitExpression: (path) => {
            const closestFunction = path.getFunctionParent()
            if (!closestFunction) {
              usesTopLevelAwait = true
            }
          },
          NewExpression: (path) => {
            callStaticAnalyzers(path, [
              (path) => analyzeNewWorkerOrNewSharedWorker(path, { isJsModule }),
              (path) => analyzeNewUrlCall(path, { isJsModule }),
            ])
          },
        }
        const callExpressionStaticAnalysers = [
          ...(isJsModule
            ? []
            : [analyzeSystemRegisterCall, analyzeSystemImportCall]),
          ...(isWebWorker ? [analyzeImportScriptCalls] : []),
          analyzeServiceWorkerRegisterCall,
        ]
        visitors.CallExpression = (path) => {
          callStaticAnalyzers(path, callExpressionStaticAnalysers)
        }

        programPath.traverse(visitors)
        state.file.metadata.usesTopLevelAwait = usesTopLevelAwait
        state.file.metadata.jsMentions = jsMentions
      },
    },
  }
}
