import { platformToCompileId } from "../platformToCompileId.js"
import { createImportTracker } from "../createImportTracker.js"
import { detect } from "./browserDetect/index.js"
import { open } from "./hotreload.js"
import { stringToStringWithLink, link } from "./stringToStringWithLink.js"

const parseErrorToMeta = (error, { fileToRemoteSourceFile }) => {
  const parseError = JSON.parse(error.body)
  const file = parseError.fileName
  const message = parseError.message
  const data = message.replace(file, link(`${fileToRemoteSourceFile(file)}`, file))

  return {
    file,
    data,
  }
}

const errorToMeta = (error) => {
  return {
    data: stringToStringWithLink(error.stack),
  }
}

export const createBrowserPlatform = ({
  remoteRoot,
  compileInto,
  compatMap,
  compatMapDefaultId,
  hotreload = false,
  hotreloadSSERoot,
  hotreloadCallback,
}) => {
  const browser = detect()

  const compileId = platformToCompileId({
    compatMap,
    defaultId: compatMapDefaultId,
    platformName: browser.name,
    platformVersion: browser.version,
  })

  const compileRoot = `${remoteRoot}/${compileInto}/${compileId}`

  const fileToRemoteCompiledFile = (file) => `${compileRoot}/${file}`

  const fileToRemoteSourceFile = (file) => `${remoteRoot}/${file}`

  // const isRemoteCompiledFile = (string) => string.startsWith(compileRoot)

  const remoteCompiledFileToFile = (remoteCompiledFile) =>
    remoteCompiledFile.slice(compileRoot.length)

  const { markFileAsImported, isFileImported } = createImportTracker()

  if (hotreload) {
    const hotreloadPredicate = (file) => {
      // isFileImported is useful in case the file was imported but is not
      // in System registry because it has a parse error or insantiate error
      if (isFileImported(file)) {
        return true
      }

      const remoteCompiledFile = fileToRemoteCompiledFile(file)
      return Boolean(window.System.get(remoteCompiledFile))
    }

    open(hotreloadSSERoot, (file) => {
      if (hotreloadPredicate(file)) {
        hotreloadCallback({ file })
      }
    })
  }

  const rejectionValueToMeta = ({ error }) => {
    if (error && error.status === 500 && error.reason === "parse error") {
      return parseErrorToMeta(error, { fileToRemoteSourceFile })
    }

    if (error && error.code === "MODULE_INSTANTIATE_ERROR") {
      const file = remoteCompiledFileToFile(error.url) // to be tested
      const originalError = error.error
      return {
        file,
        // eslint-disable-next-line no-use-before-define
        data: rejectionValueToMeta(originalError),
      }
    }

    if (error && error instanceof Error) {
      return errorToMeta(error)
    }

    return {
      data: JSON.stringify(error),
    }
  }

  const executeFile = (file) => {
    markFileAsImported(file)

    const remoteCompiledFile = fileToRemoteCompiledFile(file)

    return window.System.import(remoteCompiledFile).catch((error) => {
      const meta = rejectionValueToMeta(error)

      document.body.innerHTML = `<h1><a href="${fileToRemoteSourceFile(
        file,
      )}">${file}</a> import rejected</h1>
	<pre style="border: 1px solid black">${meta.data}</pre>`

      return Promise.reject(error)
    })
  }

  return { executeFile }
}
