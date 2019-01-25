import "systemjs/dist/system.js"
import { overrideSystemResolve } from "../../overrideSystemResolve.js"
import { overrideSystemInstantiate } from "../../overrideSystemInstantiate.js"

export const createBrowserSystem = ({
  remoteRoot,
  localRoot, // in browser it is undefined because it could be a sensitive information
  compileInto,
  compileId,
  fetchSource,
  evalSource,
}) => {
  const browserSystem = new window.System.constructor()

  overrideSystemResolve({
    System: browserSystem,
    remoteRoot,
    compileInto,
    compileId,
  })
  overrideSystemInstantiate({
    System: browserSystem,
    remoteRoot,
    localRoot,
    compileInto,
    compileId,
    fetchSource,
    evalSource,
  })

  return browserSystem
}
