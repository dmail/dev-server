/*
 * Plugin to read and apply importmap files found in html files.
 * - feeds importmap files to jsenv kitchen
 * - use importmap to resolve import (when there is one + fallback to other resolution mecanism)
 * - inline importmap with [src=""]
 *
 * A correct importmap resolution should scope importmap resolution per html file.
 * It would be doable by adding ?html_id to each js file in order to track
 * the html file importing it.
 * Considering it happens only when all the following conditions are met:
 * - 2+ html files are using an importmap
 * - the importmap used is not the same
 * - the importmap contain conflicting mappings
 * - these html files are both executed during the same scenario (dev, test, build)
 * And that it would be ugly to see ?html_id all over the place
 * -> The importmap resolution implemented here takes a shortcut and does the following:
 * - All importmap found are merged into a single one that is applied to every import specifiers
 */

import {
  resolveImport,
  composeTwoImportMaps,
  normalizeImportMap,
} from "@jsenv/importmap"
import { urlToFilename } from "@jsenv/filesystem"

import { stringifyUrlSite } from "@jsenv/utils/urls/url_trace.js"
import {
  parseHtmlString,
  stringifyHtmlAst,
  findNode,
  getHtmlNodeAttributeByName,
  htmlNodePosition,
  removeHtmlNodeAttributeByName,
  setHtmlNodeText,
  getIdForInlineHtmlNode,
  assignHtmlNodeAttributes,
  getHtmlNodeTextNode,
  removeHtmlNode,
} from "@jsenv/utils/html_ast/html_ast.js"

export const jsenvPluginImportmap = () => {
  let finalImportmap = null
  const importmaps = {}
  const onHtmlImportmapParsed = (importmap, htmlUrl) => {
    importmaps[htmlUrl] = importmap
      ? normalizeImportMap(importmap, htmlUrl)
      : null
    finalImportmap = Object.keys(importmaps).reduce((previous, url) => {
      const importmap = importmaps[url]
      if (!previous) {
        return importmap
      }
      if (!importmap) {
        return previous
      }
      return composeTwoImportMaps(previous, importmap)
    }, null)
  }

  return {
    name: "jsenv:importmap",
    appliesDuring: "*",
    resolve: {
      js_import_export: ({ parentUrl, specifier }) => {
        if (!finalImportmap) {
          return null
        }
        try {
          let fromMapping = false
          const result = resolveImport({
            specifier,
            importer: parentUrl,
            importMap: finalImportmap,
            onImportMapping: () => {
              fromMapping = true
            },
          })
          if (fromMapping) {
            return result
          }
          return null
        } catch (e) {
          if (e.message.includes("bare specifier")) {
            // in theory we should throw to be compliant with web behaviour
            // but for now it's simpler to return null
            // and let a chance to other plugins to handle the bare specifier
            // (node esm resolution)
            // and we want importmap to be prio over node esm so we cannot put this plugin after
            return null
          }
          throw e
        }
      },
    },
    transform: {
      html: async (
        { url, content, originalContent, references },
        { scenario, urlGraph, cook, addReference, updateReference },
      ) => {
        const htmlAst = parseHtmlString(content)
        const importmap = findNode(htmlAst, (node) => {
          if (node.nodeName !== "script") {
            return false
          }
          const typeAttribute = getHtmlNodeAttributeByName(node, "type")
          if (!typeAttribute || typeAttribute.value !== "importmap") {
            return false
          }
          return true
        })
        if (!importmap) {
          onHtmlImportmapParsed(null, url)
          return null
        }
        const handleInlineImportmap = async (importmap, textNode) => {
          const inlineId = getIdForInlineHtmlNode(htmlAst, importmap)
          const inlineImportmapSpecifier = `./${urlToFilename(
            url,
          )}@${inlineId}.importmap`
          const { line, column } = htmlNodePosition.readNodePosition(
            importmap,
            {
              preferOriginal: true,
            },
          )
          const inlineReference = addReference({
            trace: stringifyUrlSite({
              url,
              content: originalContent,
              line,
              column,
            }),
            type: "script_src",
            specifier: inlineImportmapSpecifier,
            isInline: true,
          })
          const inlineUrlInfo = urlGraph.getUrlInfo(inlineReference.url)
          inlineUrlInfo.data.inlineContentType = "application/importmap+json"
          inlineUrlInfo.data.inlineContent = textNode.value
          inlineUrlInfo.inlineUrlSite = {
            url,
            content: originalContent, // original because it's the origin line and column
            // we remove 1 to the line because imagine the following html:
            // <script>console.log('ok')</script>
            // -> code starts at the same line than script tag
            line: line - 1,
            column,
          }
          await cook({
            reference: inlineReference,
            urlInfo: inlineUrlInfo,
          })
          assignHtmlNodeAttributes(importmap, {
            "original-inline-id": inlineId,
          })
          setHtmlNodeText(importmap, inlineUrlInfo.content)
          onHtmlImportmapParsed(JSON.parse(inlineUrlInfo.content), url)
        }
        const handleImportmapWithSrc = async (importmap, src) => {
          // Browser would throw on remote importmap
          // and won't sent a request to the server for it
          // We must precook the importmap to know its content and inline it into the HTML
          // In this situation the ref to the importmap was already discovered
          // when parsing the HTML
          const importmapReference = references.find(
            (reference) => reference.url === src,
          )
          const importmapUrlInfo = urlGraph.getUrlInfo(importmapReference.url)
          await cook({
            reference: importmapReference,
            urlInfo: importmapUrlInfo,
          })
          onHtmlImportmapParsed(JSON.parse(importmapUrlInfo.content), url)
          removeHtmlNodeAttributeByName(importmap, "src")
          assignHtmlNodeAttributes(importmap, {
            "content-src": src,
            "inlined-by": "jsenv:importmap",
          })
          setHtmlNodeText(importmap, importmapUrlInfo.content)

          const inlineScriptId = getIdForInlineHtmlNode(htmlAst, importmap)
          const inlineImportmapSpecifier = `./${urlToFilename(
            url,
          )}@${inlineScriptId}.importmap`
          const inlineReference = updateReference(importmapReference, {
            isInline: true,
            specifier: inlineImportmapSpecifier,
          })
          const inlineUrlInfo = urlGraph.getUrlInfo(inlineReference.url)
          inlineUrlInfo.data.inlineContentType = "application/importmap+json"
          inlineUrlInfo.data.inlineContent = importmapUrlInfo.content
          const { line, column } = htmlNodePosition.readNodePosition(
            importmap,
            {
              preferOriginal: true,
            },
          )
          inlineUrlInfo.inlineUrlSite = {
            url,
            content: originalContent, // original because it's the origin line and column
            // we remove 1 to the line because imagine the following html:
            // <script>console.log('ok')</script>
            // -> code starts at the same line than script tag
            line: line - 1,
            column,
          }
        }

        const srcAttribute = getHtmlNodeAttributeByName(importmap, "src")
        const src = srcAttribute ? srcAttribute.value : undefined
        if (src) {
          await handleImportmapWithSrc(importmap, src)
        } else {
          const textNode = getHtmlNodeTextNode(importmap)
          if (textNode) {
            await handleInlineImportmap(importmap, textNode)
          }
        }
        // once this plugin knows the importmap, it will use it
        // to map imports. These import specifiers will be normalized
        // by "formatReferencedUrl" making the importmap presence useless.
        // In dev/test we keep importmap into the HTML to see it even if useless
        // Duing build we get rid of it
        if (scenario === "build") {
          removeHtmlNode(importmap)
        }
        return {
          content: stringifyHtmlAst(htmlAst),
        }
      },
    },
  }
}
