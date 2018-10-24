import { versionIsBelowOrEqual } from "@dmail/project-structure-compile-babel"
import { open } from "./hotreload.js"
import { createImportTracker } from "../createImportTracker.js"
import https from "https"
import fetch from "node-fetch"
import EventSource from "eventsource"
import { createNodeSystem } from "@dmail/module-loader"
import { valueInstall } from "./valueInstall.js"
import { createLocaters } from "../createLocaters.js"

export const nodeVersionToGroupId = (version, groupMap) => {
  return Object.keys(groupMap).find((id) => {
    const { compatMap } = groupMap[id]
    if ("node" in compatMap === false) {
      return false
    }
    const versionForGroup = compatMap.node
    return versionIsBelowOrEqual(versionForGroup, version)
  })
}

export const createNodePlatform = ({
  localRoot,
  remoteRoot,
  compileInto,
  groupMap,
  hotreload,
  hotreloadSSERoot,
  hotreloadCallback,
}) => {
  const cleanupCallbacks = []
  const clean = () => {
    cleanupCallbacks.forEach((callback) => {
      callback()
    })
    cleanupCallbacks.length = 0
  }
  const onceClean = (callback) => {
    cleanupCallbacks.push(callback)
  }

  const compileId = nodeVersionToGroupId(process.version.slice(1), groupMap) || "otherwise"

  const {
    fileToRemoteCompiledFile,
    fileToRemoteInstrumentedFile,
    hrefToLocalFile,
  } = createLocaters({
    localRoot,
    remoteRoot,
    compileInto,
    compileId,
  })

  const { markFileAsImported, isFileImported } = createImportTracker()

  const nodeSystem = createNodeSystem({
    urlToFilename: (url) => {
      return hrefToLocalFile(url)
    },
  })

  onceClean(valueInstall(https.globalAgent.options, "rejectUnauthorized", false))
  onceClean(valueInstall(global, "fetch", fetch))
  onceClean(valueInstall(global, "System", nodeSystem))
  onceClean(valueInstall(global, "EventSource", EventSource))

  if (hotreload) {
    // we can be notified from file we don't care about, reload only if needed
    const hotreloadPredicate = (file) => {
      // isFileImported is useful in case the file was imported but is not
      // in System registry because it has a parse error or insantiate error
      if (isFileImported(file)) {
        return true
      }

      const remoteCompiledFile = fileToRemoteCompiledFile(file)
      if (global.System.get(remoteCompiledFile)) {
        return true
      }

      const remoteInstrumentedFile = fileToRemoteInstrumentedFile(file)
      if (global.System.get(remoteInstrumentedFile)) {
        return true
      }

      return false
    }

    onceClean(
      open(hotreloadSSERoot, (fileChanged) => {
        if (hotreloadPredicate(fileChanged)) {
          hotreloadCallback({ file: fileChanged })
        }
      }),
    )
  }

  const executeFile = ({ file, instrument = false, setup = () => {}, teardown = () => {} }) => {
    markFileAsImported(file)

    const fileURL = instrument ? fileToRemoteInstrumentedFile(file) : fileToRemoteCompiledFile(file)

    return Promise.resolve()
      .then(setup)
      .then(() => global.System.import(fileURL))
      .then(teardown)
  }

  return { executeFile, clean }
}
