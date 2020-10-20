import { fork } from "child_process"
import { resolveDirectoryUrl, resolveUrl, urlToFileSystemPath } from "@jsenv/util"
import { createChildExecArgv } from "@jsenv/core/src/internal/node-launcher/createChildExecArgv.js"

const CONTROLLABLE_FILE_URL = resolveUrl("./controllable-file.js", import.meta.url)

export const nodeImportBundle = async ({
  projectDirectoryUrl,
  bundleDirectoryRelativeUrl,
  mainRelativeUrl,
  namespaceProperty = "default",
}) => {
  const bundleDirectoryUrl = resolveDirectoryUrl(bundleDirectoryRelativeUrl, projectDirectoryUrl)
  const mainFileUrl = resolveUrl(mainRelativeUrl, bundleDirectoryUrl)

  const child = fork(urlToFileSystemPath(CONTROLLABLE_FILE_URL), {
    execArgv: await createChildExecArgv(),
  })

  return new Promise((resolve, reject) => {
    child.once("message", () => {
      child.once("message", ({ error, value }) => {
        child.kill()
        if (error) {
          reject(error)
        } else {
          resolve({ value })
        }
      })
      child.send({
        url: mainFileUrl,
        namespaceProperty,
      })
    })
  })
}

/*
The code below is unused, and is a basic reimplementation of import function.
It will certainly never be useful but it might be interesting so keeping it here for now.

import { SourceTextModule } from "vm"
import { resolveUrl, readFile } from "@jsenv/util"

// we could also spawn a child process too
export const importFake = async (url) => {
  const urlSource = await readFile(url)
  const esModule = new SourceTextModule(urlSource, {
    identifier: url,
    importModuleDynamically: linker,
  })
  await esModule.link(linker)
  await esModule.evaluate()
  return esModule.namespace
}

const linker = async (specifier, importer) => {
  const dependencyUrl = resolveUrl(specifier, importer.identifier)
  const dependencyModule = new SourceTextModule(await readFile(dependencyUrl), {
    identifier: dependencyUrl,
    context: importer.context,
    importModuleDynamically: linker,
  })
  await dependencyModule.link(linker)
  await dependencyModule.evaluate()
  return dependencyModule
}
*/
