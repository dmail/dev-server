/**

An important concern here:

All script type="module" will be converted to inline script.
These inline script execution order is non predictible it depends
which one is being done first

*/

import { createHash } from "crypto"
import { require } from "../require.js"

const parse5 = require("parse5")

export const compileHtml = (
  htmlBeforeCompilation,
  {
    headScripts = [],
    replaceModuleScripts = true,
    replaceImportmapScript = true,
    // resolveScriptSrc = (src) => src,
    generateInlineScriptSrc = ({ hash }) => `./${hash}.js`,
  } = {},
) => {
  // https://github.com/inikulin/parse5/blob/master/packages/parse5/docs/tree-adapter/interface.md
  const document = parse5.parse(htmlBeforeCompilation)

  injectHeadScripts(document, headScripts)

  const scriptsExternalized = polyfillScripts(document, {
    replaceModuleScripts,
    replaceImportmapScript,
    generateInlineScriptSrc,
  })
  // resolveScripts(document, resolveScriptSrc)

  const htmlAfterCompilation = parse5.serialize(document)
  return {
    htmlAfterCompilation,
    scriptsExternalized,
  }
}

const injectHeadScripts = (document, headScripts) => {
  const htmlNode = document.childNodes.find((node) => node.nodeName === "html")
  const headNode = htmlNode.childNodes[0]
  const headChildNodes = headNode.childNodes

  const headScriptsToInject = headScripts.filter((script) => {
    const existingScript = findExistingScript(headNode, script)
    return !existingScript
  })

  const headScriptHtml = headScriptsToInject.reduce((previous, script) => {
    const scriptAttributes = objectToHtmlAttributes(script)
    return `${previous}<script ${scriptAttributes}></script>
      `
  }, "")
  const fragment = parse5.parseFragment(headScriptHtml)

  const firstScriptChildIndex = headChildNodes.findIndex((node) => node.nodeName === "script")
  if (firstScriptChildIndex > -1) {
    headNode.childNodes = [
      ...headChildNodes.slice(0, firstScriptChildIndex),
      ...fragment.childNodes.map((child) => {
        return { ...child, parentNode: headNode }
      }),
      ...headChildNodes.slice(firstScriptChildIndex),
    ]
  } else {
    // prefer append (so that any first child being text remains and indentation is safe)
    headNode.childNodes = [
      ...headChildNodes,
      ...fragment.childNodes.map((child) => {
        return { ...child, parentNode: headNode }
      }),
    ]
  }
}

const findExistingScript = (node, script) => {
  return node.childNodes.find((childNode) => {
    return childNode.nodeName === "script" && sameScript(childNode, script)
  })
}

const sameScript = (node, { type = "text/javascript", src }) => {
  const nodeType = getAttributeValue(node, "type") || "text/javascript"
  const nodeSrc = getAttributeValue(node, "src")

  if (type === "importmap") {
    if (nodeSrc !== src) {
      console.warn(`importmap src should be ${src}, found ${nodeSrc} instead`)
    }
    return nodeType === type
  }

  return nodeType === type && nodeSrc === src
}

const objectToHtmlAttributes = (object) => {
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

const polyfillScripts = (
  document,
  { replaceModuleScripts, replaceImportmapScript, generateInlineScriptSrc },
) => {
  /*
  <script type="module" src="*" /> are going to be inlined
  <script type="module">** </script> are going to be transformed to import a file so that we can transform the script content.

  but we don't want that a script with an src to be considered as an inline script after it was inlined.

  For that reason we perform mutation in the end
  */
  const mutations = []
  const scriptsExternalized = {}

  visitDocument(document, (node) => {
    if (node.nodeName !== "script") {
      return
    }

    const attributes = node.attrs
    const nodeType = getAttributeValue(node, "type")

    if (replaceModuleScripts && nodeType === "module") {
      const nodeSrc = getAttributeValue(node, "src")
      if (nodeSrc) {
        mutations.push(() => {
          const script = parseHtmlAsSingleElement(generateScriptForJsenv(nodeSrc))
          // inherit script attributes (except src and type)
          script.attrs = [
            ...script.attrs,
            ...attributes.filter((attr) => attr.name !== "type" && attr.name !== "src"),
          ]
          replaceNode(node, script)
        })
        return
      }

      const firstChild = node.childNodes[0]
      if (firstChild && firstChild.nodeName === "#text") {
        const scriptText = firstChild.value
        mutations.push(() => {
          const nodeId = getAttributeValue(node, "id")
          const hash = createScriptContentHash(scriptText)
          const src = generateInlineScriptSrc({
            hash,
            id: nodeId,
          })
          const script = parseHtmlAsSingleElement(generateScriptForJsenv(src))
          // inherit script attributes (except src and type)
          script.attrs = [
            ...script.attrs,
            ...attributes.filter((attr) => attr.name !== "type" && attr.name !== "src"),
          ]
          replaceNode(node, script)

          scriptsExternalized[src] = scriptText
        })
        return
      }
    }

    if (replaceImportmapScript && nodeType === "importmap") {
      const typeAttribute = getAttributeByName(node.attrs, "type")
      typeAttribute.value = "jsenv-importmap"
    }
  })

  mutations.forEach((fn) => fn())

  return scriptsExternalized
}

// const resolveScripts = (document, resolveScriptSrc) => {
//   visitDocument(document, (node) => {
//     if (node.nodeName !== "script") {
//       return
//     }

//     const attributes = node.attrs
//     const srcAttribute = getAttributeByName(attributes, "src")
//     if (!srcAttribute) {
//       return
//     }

//     const srcAttributeValue = srcAttribute.value
//     srcAttribute.value = resolveScriptSrc(srcAttributeValue)
//   })
// }

const getAttributeValue = (node, attributeName) => {
  const attribute = getAttributeByName(node.attrs, attributeName)
  return attribute ? attribute.value : undefined
}

const getAttributeByName = (attributes, attributeName) =>
  attributes.find((attr) => attr.name === attributeName)

const generateScriptForJsenv = (src) => {
  return `<script>
      window.__jsenv__.importFile(${JSON.stringify(src)})
    </script>`
}

const createScriptContentHash = (content) => {
  const hash = createHash("sha256")
  hash.update(content)
  return hash.digest("hex").slice(0, 8)
}

const parseHtmlAsSingleElement = (html) => {
  const fragment = parse5.parseFragment(html)
  return fragment.childNodes[0]
}

const replaceNode = (node, newNode) => {
  const { parentNode } = node
  const parentNodeChildNodes = parentNode.childNodes
  const nodeIndex = parentNodeChildNodes.indexOf(node)
  parentNodeChildNodes[nodeIndex] = newNode
}

const visitDocument = (document, fn) => {
  const visitNode = (node) => {
    fn(node)
    const { childNodes } = node
    if (childNodes) {
      let i = 0
      while (i < childNodes.length) {
        visitNode(childNodes[i++])
      }
    }
  }
  visitNode(document)
}
