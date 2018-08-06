import { createNodeLoader } from "@dmail/module-loader/src/node/index.js"

const memoize = (fn) => {
  let called = false
  let memoizedValue
  return (...args) => {
    if (called) {
      return memoizedValue
    }
    memoizedValue = fn(...args)
    called = true
    return memoizedValue
  }
}

export const ensureSystem = memoize(({ localRoot, remoteRoot, forceFilesystem = false }) => {
  // when System.import evaluates the code it has fetched
  // it uses require('vm').runInThisContext(code, { filename }).
  // This filename is very important because it allows the engine to be able
  // to resolve source map location inside evaluated code like //# sourceMappingURL=./file.js.map

  // There is a "bug" with vscode: https://github.com/Microsoft/vscode/issues/55659
  const getFilename = (key) => {
    if (forceFilesystem) {
      // try to force filesystem resolution replacing
      // https://ip:port/folder/file.js -> /Users/dmail/folder/file.js
      const filename = key.replace(remoteRoot, localRoot)
      return filename
    }
    return key
  }

  const System = createNodeLoader({
    getFilename,
  })

  global.System = System

  return System
})
