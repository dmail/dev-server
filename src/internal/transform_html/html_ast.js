import { createHash } from "node:crypto"

import { require } from "@jsenv/core/src/internal/require.js"

import { htmlAttributeSrcSet } from "./html_attribute_src_set.js"

// https://github.com/inikulin/parse5/blob/master/packages/parse5/lib/tree-adapters/default.js
// eslint-disable-next-line import/no-unresolved
// const treeAdapter = require("parse5/lib/tree-adapters/default.js")

export const parseHtmlString = (htmlString) => {
  const parse5 = require("parse5")
  const htmlAst = parse5.parse(htmlString, { sourceCodeLocationInfo: true })
  return htmlAst
}

export const parseSvgString = (svgString) => {
  const parse5 = require("parse5")
  const svgAst = parse5.parseFragment(svgString, {
    sourceCodeLocationInfo: true,
  })
  return svgAst
}

export const stringifyHtmlAst = (htmlAst) => {
  const parse5 = require("parse5")
  const htmlString = parse5.serialize(htmlAst)
  return htmlString
}

export const findNode = (htmlStringOrAst, predicate) => {
  const htmlAst =
    typeof htmlStringOrAst === "string"
      ? parseHtmlString(htmlStringOrAst)
      : htmlStringOrAst
  let nodeMatching = null
  visitHtmlAst(htmlAst, (node) => {
    if (predicate(node)) {
      nodeMatching = node
      return "stop"
    }
    return null
  })
  return nodeMatching
}

export const findNodes = (htmlString, predicate) => {
  const htmlAst = parseHtmlString(htmlString)
  const nodes = []
  visitHtmlAst(htmlAst, (node) => {
    if (predicate(node)) {
      nodes.push(node)
    }
    return null
  })
  return nodes
}

export const findNodeByTagName = (htmlString, tagName) =>
  findNode(htmlString, (node) => node.nodeName === tagName)

export const findHtmlNodeById = (htmlString, id) => {
  return findNode(htmlString, (node) => {
    const idAttribute = getHtmlNodeAttributeByName(node, "id")
    return idAttribute && idAttribute.value === id
  })
}

export const findAllNodeByTagName = (htmlString, tagName) =>
  findNodes(htmlString, (node) => node.nodeName === tagName)

export const findFirstImportMapNode = (htmlStringOrAst) =>
  findNode(htmlStringOrAst, htmlNodeIsScriptImportmap)

export const getHtmlNodeAttributeByName = (htmlNode, attributeName) => {
  const attrs = htmlNode.attrs
  return attrs && attrs.find((attr) => attr.name === attributeName)
}

export const removeHtmlNodeAttributeByName = (htmlNode, attributeName) => {
  const attr = getHtmlNodeAttributeByName(htmlNode, attributeName)
  return attr ? removeHtmlNodeAttribute(htmlNode, attr) : false
}

export const removeHtmlNodeAttribute = (htmlNode, attributeToRemove) => {
  const attrIndex = htmlNode.attrs.indexOf(attributeToRemove)
  if (attrIndex === -1) {
    return false
  }
  htmlNode.attrs.splice(attrIndex, 1)
  return true
}

export const addHtmlNodeAttribute = (htmlNode, attributeToSet) => {
  if (typeof attributeToSet !== "object") {
    throw new TypeError(
      `addHtmlNodeAttribute attribute must be an object {name, value}`,
    )
  }

  const existingAttributeIndex = htmlNode.attrs.findIndex(
    (attr) => attr.name === attributeToSet.name,
  )
  if (existingAttributeIndex === -1) {
    htmlNode.attrs.push(attributeToSet)
  } else {
    htmlNode.attrs[existingAttributeIndex] = attributeToSet
  }
}

export const getHtmlNodeTextNode = (htmlNode) => {
  const firstChild = htmlNode.childNodes[0]
  return firstChild && firstChild.nodeName === "#text" ? firstChild : null
}

export const setHtmlNodeText = (htmlNode, textContent) => {
  const textNode = getHtmlNodeTextNode(htmlNode)
  if (textNode) {
    textNode.value = textContent
  } else {
    const newTextNode = {
      nodeName: "#text",
      value: textContent,
      parentNode: htmlNode,
    }
    htmlNode.childNodes.splice(0, 0, newTextNode)
  }
}

export const removeHtmlNodeText = (htmlNode) => {
  const textNode = getHtmlNodeTextNode(htmlNode)
  if (textNode) {
    htmlNode.childNodes = []
  }
}

export const removeHtmlNode = (htmlNode) => {
  const { childNodes } = htmlNode.parentNode
  childNodes.splice(childNodes.indexOf(htmlNode), 1)
}

export const getHtmlNodeLocation = (htmlNode, htmlAttributeName) => {
  const { sourceCodeLocation } = htmlNode
  if (!sourceCodeLocation) {
    return null
  }

  if (!htmlAttributeName) {
    const { startLine, startCol } = sourceCodeLocation
    return {
      line: startLine,
      column: startCol,
    }
  }

  const attributeSourceCodeLocation =
    sourceCodeLocation.attrs[htmlAttributeName]
  if (!attributeSourceCodeLocation) {
    return null
  }
  const { startLine, startCol } = attributeSourceCodeLocation
  return {
    line: startLine,
    column: startCol,
  }
}

export const findHtmlNode = (htmlAst, predicate) => {
  let nodeFound = null
  visitHtmlAst(htmlAst, (node) => {
    if (predicate(node)) {
      nodeFound = node
      return "stop"
    }
    return null
  })
  return nodeFound
}

export const htmlNodeIsScriptModule = (htmlNode) => {
  if (htmlNode.nodeName !== "script") {
    return false
  }
  const typeAttribute = getHtmlNodeAttributeByName(htmlNode, "type")
  if (!typeAttribute) {
    return false
  }
  return typeAttribute.value === "module"
}

export const htmlNodeIsScriptImportmap = (htmlNode) => {
  if (htmlNode.nodeName !== "script") {
    return false
  }
  const typeAttribute = getHtmlNodeAttributeByName(htmlNode, "type")
  if (!typeAttribute) {
    return false
  }
  return typeAttribute.value === "importmap"
}

// <img>, <link for favicon>, <link for css>, <styles>
// <audio> <video> <picture> supports comes for free by detecting
// <source src> attribute
// ideally relative iframe should recursively fetch (not needed so lets ignore)
export const parseHtmlAstRessources = (htmlAst) => {
  const links = []
  const styles = []
  const scripts = []
  const imgs = []
  const images = []
  const uses = []
  const sources = []
  visitHtmlAst(htmlAst, (node) => {
    if (node.nodeName === "link") {
      links.push(node)
      return
    }
    if (node.nodeName === "style") {
      styles.push(node)
      return
    }
    if (node.nodeName === "script") {
      scripts.push(node)
      return
    }
    if (node.nodeName === "img") {
      imgs.push(node)
      return
    }
    if (node.nodeName === "image") {
      images.push(node)
      return
    }
    if (node.nodeName === "use") {
      uses.push(node)
      return
    }
    if (node.nodeName === "source") {
      sources.push(node)
      return
    }
  })

  return {
    links,
    styles,
    scripts,
    imgs,
    images,
    uses,
    sources,
  }
}

export const parseLinkNode = (linkNode) => {
  const relAttr = getHtmlNodeAttributeByName(linkNode, "rel")
  const rel = relAttr ? relAttr.value : undefined

  if (rel === "stylesheet") {
    return {
      isStylesheet: true,
    }
  }
  const isRessourceHint = [
    "preconnect",
    "dns-prefetch",
    "prefetch",
    "preload",
    "modulepreload",
  ].includes(rel)
  return {
    isRessourceHint,
    rel,
  }
}

export const collectHtmlDependenciesFromAst = (htmlAst) => {
  const dependencies = []
  const addDependency = ({ node, attribute, specifier, hotAccepted }) => {
    dependencies.push({
      htmlNode: node,
      attribute,
      specifier,
      hotAccepted,
    })
  }
  const onNode = (node, { hotAccepted }) => {
    if (node.nodeName === "link") {
      const { isStylesheet, isRessourceHint } = parseLinkNode(node)
      // stylesheets can be hot replaced by default
      if (hotAccepted === undefined && isStylesheet) {
        hotAccepted = true
      }
      // for ressource hints html will be notified the underlying ressource has changed
      // but we won't do anything (if the ressource is deleted we should?)
      if (hotAccepted === undefined && isRessourceHint) {
        hotAccepted = true
      }
      visitAttributeAsUrlSpecifier({
        node,
        attributeName: "href",
        hotAccepted,
      })
      return
    }
    // if (node.nodeName === "style") {
    //   // styles.push(node)
    //   return
    // }
    if (node.nodeName === "script") {
      // script full_reload by default
      visitAttributeAsUrlSpecifier({
        node,
        attributeName: "src",
        hotAccepted,
      })
      return
    }
    if (node.nodeName === "img") {
      if (hotAccepted === undefined) {
        hotAccepted = true
      }
      visitAttributeAsUrlSpecifier({
        node,
        attributeName: "src",
        hotAccepted,
      })
      visitSrcset({
        node,
        hotAccepted,
      })
      return
    }
    if (node.nodeName === "source") {
      if (hotAccepted === undefined) {
        hotAccepted = true
      }
      visitAttributeAsUrlSpecifier({
        node,
        attributeName: "src",
        hotAccepted,
      })
      visitSrcset({
        node,
        hotAccepted,
      })
      return
    }
    // svg <image> tag
    if (node.nodeName === "image") {
      if (hotAccepted === undefined) {
        hotAccepted = true
      }
      visitAttributeAsUrlSpecifier({
        node,
        attributeName: "href",
        hotAccepted,
      })
      return
    }
    if (node.nodeName === "use") {
      if (hotAccepted === undefined) {
        hotAccepted = true
      }
      visitAttributeAsUrlSpecifier({
        node,
        attributeName: "href",
        hotAccepted,
      })
      return
    }
  }
  const visitAttributeAsUrlSpecifier = ({
    node,
    attributeName,
    hotAccepted,
  }) => {
    const attribute = getHtmlNodeAttributeByName(node, attributeName)
    const value = attribute ? attribute.value : undefined
    if (value && value[0] !== "#") {
      addDependency({
        node,
        attribute,
        value,
        hotAccepted,
      })
    }
  }
  const visitSrcset = ({ node, hotAccepted }) => {
    const srcsetAttribute = getHtmlNodeAttributeByName(node, "srcset")
    const srcset = srcsetAttribute ? srcsetAttribute.value : undefined
    if (srcset) {
      const srcCandidates = htmlAttributeSrcSet.parse(srcset)
      srcCandidates.forEach((srcCandidate) => {
        addDependency({
          node,
          attribute: srcsetAttribute,
          value: srcCandidate.specifier,
          hotAccepted,
        })
      })
    }
  }
  const getNodeContext = (node) => {
    const context = {}
    const hotAcceptAttribute = getHtmlNodeAttributeByName(node, "hot-accept")
    if (hotAcceptAttribute) {
      context.hotAccepted = true
    }
    const hotDeclineAttribute = getHtmlNodeAttributeByName(node, "hot-decline")
    if (hotDeclineAttribute) {
      context.hotAccepted = false
    }
    return context
  }
  const iterate = (node, context) => {
    context = {
      ...context,
      ...getNodeContext(node),
    }
    onNode(node, context)
    const { childNodes } = node
    if (childNodes) {
      let i = 0
      while (i < childNodes.length) {
        const childNode = childNodes[i++]
        iterate(childNode, context)
      }
    }
  }
  iterate(htmlAst, {})
  return dependencies
}

export const replaceHtmlNode = (
  node,
  replacement,
  { attributesInherit = true, attributesToIgnore = [] } = {},
) => {
  let newNode
  if (typeof replacement === "string") {
    newNode = parseHtmlAsSingleElement(replacement)
  } else {
    newNode = replacement
  }

  if (attributesInherit) {
    const attributeMap = {}
    // inherit attributes except thoos listed in attributesToIgnore
    node.attrs.forEach((attribute) => {
      if (attributesToIgnore.includes(attribute.name)) {
        return
      }
      attributeMap[attribute.name] = attribute
    })
    newNode.attrs.forEach((newAttribute) => {
      attributeMap[newAttribute.name] = newAttribute
    })
    const attributes = []
    Object.keys(attributeMap).forEach((attributeName) => {
      attributes.push(attributeMap[attributeName])
    })
    newNode.attrs = attributes
  }

  replaceNode(node, newNode)
}

export const createHtmlNode = ({ tagName, textContent = "", ...rest }) => {
  const html = `<${tagName} ${stringifyAttributes(
    rest,
  )}>${textContent}</${tagName}>`
  const parse5 = require("parse5")
  const fragment = parse5.parseFragment(html)
  return fragment.childNodes[0]
}

export const injectBeforeFirstHeadScript = (htmlAst, htmlNode) => {
  const headNode = htmlAst.childNodes.find((node) => node.nodeName === "html")
    .childNodes[0]

  const firstHeadScript = findChild(headNode, (node) => {
    if (node.nodeName !== "script") {
      return false
    }
    const typeAttribute = getHtmlNodeAttributeByName(node, "type")
    if (typeAttribute && typeAttribute.value === "importmap") {
      return false
    }
    return true
  })
  return insertBefore(htmlNode, headNode, firstHeadScript)
}

const insertBefore = (nodeToInsert, futureParentNode, futureNextSibling) => {
  const { childNodes = [] } = futureParentNode
  if (futureNextSibling) {
    const nextSiblingIndex = childNodes.indexOf(futureNextSibling)
    futureParentNode.childNodes = [
      ...childNodes.slice(0, nextSiblingIndex),
      { ...nodeToInsert, parentNode: futureParentNode },
      ...childNodes.slice(nextSiblingIndex),
    ]
  } else {
    futureParentNode.childNodes = [
      ...childNodes,
      { ...nodeToInsert, parentNode: futureParentNode },
    ]
  }
}

const findChild = ({ childNodes = [] }, predicate) => childNodes.find(predicate)

const stringifyAttributes = (object) => {
  return Object.keys(object)
    .map((key) => `${key}=${valueToHtmlAttributeValue(object[key])}`)
    .join(" ")
}

const valueToHtmlAttributeValue = (value) => {
  if (typeof value === "string") {
    return JSON.stringify(value)
  }
  return `"${JSON.stringify(value)}"`
}

export const createInlineScriptHash = (script) => {
  const hash = createHash("sha256")
  hash.update(getHtmlNodeTextNode(script).value)
  return hash.digest("hex").slice(0, 8)
}

export const getIdForInlineHtmlNode = (node, nodes) => {
  const idAttribute = getHtmlNodeAttributeByName(node, "id")
  if (idAttribute) {
    return idAttribute.value
  }
  const { line, column } = getHtmlNodeLocation(node) || {}
  const lineTaken = nodes.some((nodeCandidate) => {
    if (nodeCandidate === node) return false
    const htmlNodeLocation = getHtmlNodeLocation(nodeCandidate)
    if (!htmlNodeLocation) return false
    return htmlNodeLocation.line === line
  })
  if (lineTaken) {
    return `${line}.${column}`
  }
  return line
}

const parseHtmlAsSingleElement = (html) => {
  const parse5 = require("parse5")
  const fragment = parse5.parseFragment(html)
  return fragment.childNodes[0]
}

const replaceNode = (node, newNode) => {
  const { parentNode } = node
  const parentNodeChildNodes = parentNode.childNodes
  const nodeIndex = parentNodeChildNodes.indexOf(node)
  parentNodeChildNodes[nodeIndex] = newNode
}

export const visitHtmlAst = (htmlAst, callback) => {
  const visitNode = (node) => {
    const callbackReturnValue = callback(node)
    if (callbackReturnValue === "stop") {
      return
    }
    const { childNodes } = node
    if (childNodes) {
      let i = 0
      while (i < childNodes.length) {
        visitNode(childNodes[i++])
      }
    }
  }
  visitNode(htmlAst)
}
