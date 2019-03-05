import "systemjs/dist/system.js"
import { isBareSpecifier } from "@jsenv/module-resolution"
import { overrideSystemInstantiate } from "../../overrideSystemInstantiate.js"
import { fromFunctionReturningNamespace } from "../../registerModuleFrom.js"
import { fetchSource } from "../fetchSource.js"
import { moduleSourceToSystemRegisteredModule } from "../moduleSourceToSystemRegisteredModule.js"

export const createNodeSystem = ({ compileInto, sourceOrigin, compileServerOrigin, compileId }) => {
  const nodeSystem = new global.System.constructor()

  overrideSystemInstantiate({
    compileInto,
    sourceOrigin,
    compileServerOrigin,
    compileId,
    fetchSource,
    platformSystem: nodeSystem,
    moduleSourceToSystemRegisteredModule,
  })

  const instantiate = nodeSystem.instantiate
  nodeSystem.instantiate = async (href, importer) => {
    if (isBareSpecifier(href)) {
      return fromFunctionReturningNamespace(
        () => {
          // eslint-disable-next-line import/no-dynamic-require
          const nodeNativeModuleExports = require(href)
          return {
            ...nodeNativeModuleExports,
            default: nodeNativeModuleExports,
          }
        },
        { href, importer },
      )
    }
    return instantiate(href, importer)
  }
  // https://github.com/systemjs/systemjs/blob/master/docs/hooks.md#createcontexturl---object
  // nodeSystem.createContext = (url) => {
  //   return { url }
  // }

  return nodeSystem
}
