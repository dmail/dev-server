import { basename } from "path"
import { urlToFileSystemPath } from "@jsenv/util"
import { setCssSourceMappingUrl } from "../../sourceMappingURLUtils.js"
import { parseCssUrls } from "./css/parseCssUrls.js"
import { replaceCssUrls } from "./css/replaceCssUrls.js"
import {
  parseHtmlString,
  parseHtmlDocumentRessources,
  transformHtmlDocumentModuleScripts,
  stringifyHtmlDocument,
} from "../../compiling/compileHtml.js"

export const jsenvCompositeAssetHooks = {
  parse: async (url, source, { emitAssetReference, emitJsReference }) => {
    if (url.endsWith(".html")) {
      const htmlUrl = url
      const htmlSource = String(source)
      const htmlFileName = basename(urlToFileSystemPath(htmlUrl))
      const htmlDocument = parseHtmlString(htmlSource)
      const { scripts, styles } = parseHtmlDocumentRessources(htmlDocument)

      const nodeUrlMapping = {}
      scripts.forEach((script, index) => {
        if (script.attributes.type === "module" && script.attributes.src) {
          const remoteScriptUrl = emitJsReference({
            specifier: script.attributes.src,
            line: script.line,
            column: script.node,
          })
          nodeUrlMapping[remoteScriptUrl] = script
        }
        if (script.attributes.type === "module" && script.text) {
          const inlineScriptUrl = emitJsReference({
            specifier: `${htmlFileName}.${index}.js`,
            line: script.line,
            column: script.node,
            source: script.text,
          })
          nodeUrlMapping[inlineScriptUrl] = script
        }
      })
      styles.forEach((style, index) => {
        if (style.attributes.href) {
          const remoteStyleUrl = emitAssetReference({
            specifier: style.attributes.href,
            line: style.node,
            column: style,
          })
          nodeUrlMapping[remoteStyleUrl] = style
        }
        if (style.text) {
          const inlineStyleUrl = emitAssetReference({
            specifier: `${htmlFileName}.${index}.css`,
            line: style.node,
            column: style.node,
            source: style.text,
          })
          nodeUrlMapping[inlineStyleUrl] = style
        }
      })

      return async (dependenciesMapping) => {
        transformHtmlDocumentModuleScripts(scripts, {
          generateScriptCode: (script) => {
            const scriptUrl = Object.keys(nodeUrlMapping).find(
              (key) => nodeUrlMapping[key] === script,
            )
            const scriptFileRelativeUrlForBundle = dependenciesMapping[scriptUrl]
            return `<script>window.System.import(${JSON.stringify(
              ensureRelativeUrlNotation(scriptFileRelativeUrlForBundle),
            )})</script>`
          },
        })
        const htmlAfterTransformation = stringifyHtmlDocument(htmlDocument)
        // const code = minify ? minifyHtml(htmlTransformedString, minifyHtmlOptions) : htmlTransformedString
        return {
          sourceAfterTransformation: htmlAfterTransformation,
        }
      }
    }

    if (url.endsWith(".css")) {
      const cssSource = String(source)
      const cssUrl = url
      const { atImports, urlDeclarations } = await parseCssUrls(cssSource, cssUrl)
      const nodeUrlMapping = {}

      atImports.forEach((atImport) => {
        const importedCssUrl = emitAssetReference({
          specifier: atImport.specifier,
          line: atImport.urlNode,
          column: atImport.urlNode,
        })
        nodeUrlMapping[importedCssUrl] = atImport.urlNode
      })
      urlDeclarations.forEach((urlDeclaration) => {
        const cssAssetUrl = emitAssetReference({
          specifier: urlDeclaration.specifier,
          line: urlDeclaration.node,
          column: urlDeclaration,
        })
        nodeUrlMapping[cssAssetUrl] = urlDeclaration.urlNode
      })

      return async (dependenciesMapping, { precomputeFileNameForRollup }) => {
        const cssReplaceResult = await replaceCssUrls(cssSource, cssUrl, ({ urlNode }) => {
          const scriptUrl = Object.keys(nodeUrlMapping).find((key) =>
            isSameCssDocumentUrlNode(nodeUrlMapping[key], urlNode),
          )
          return dependenciesMapping[scriptUrl]
        })
        const code = cssReplaceResult.css
        const map = cssReplaceResult.map.toJSON()
        const cssFileNameForRollup = precomputeFileNameForRollup(code)
        const cssSourceMapFileUrlRelativeToSource = `${cssFileNameForRollup}.map`

        map.file = basename(cssFileNameForRollup)

        // In theory code should never be modified once the url for caching is computed
        // because url for caching depends on file content.
        // There is an exception for sourcemap because we want to update sourcemap.file
        // to the cached filename of the css file.
        // To achieve that we set/update the sourceMapping url comment in compiled css file.
        // This is totally fine to do that because sourcemap and css file lives togethers
        // so this comment changes nothing regarding cache invalidation and is not important
        // to decide the filename for this css asset.
        const cssSourceAfterTransformation = setCssSourceMappingUrl(
          code,
          cssSourceMapFileUrlRelativeToSource,
        )
        return {
          sourceAfterTransformation: cssSourceAfterTransformation,
          map,
          fileNameForRollup: cssFileNameForRollup,
        }
      }
    }

    return null
  },
}

// otherwise systemjs thinks it's a bare import
const ensureRelativeUrlNotation = (relativeUrl) => {
  if (relativeUrl.startsWith("../")) {
    return relativeUrl
  }
  return `./${relativeUrl}`
}

const isSameCssDocumentUrlNode = (firstUrlNode, secondUrlNode) => {
  if (firstUrlNode.type !== secondUrlNode.type) {
    return false
  }
  if (firstUrlNode.value !== secondUrlNode.value) {
    return false
  }
  if (firstUrlNode.sourceIndex !== secondUrlNode.sourceIndex) {
    return false
  }
  return true
}
