import { normalizePathname } from "/node_modules/@jsenv/module-resolution/index.js"
import { startCompileServer } from "../server-compile/index.js"
import { launchAndExecute } from "../launchAndExecute/index.js"
import {
  createProcessInterruptionCancellationToken,
  catchAsyncFunctionCancellation,
} from "../cancellationHelper.js"

export const execute = async ({
  importMap,
  projectFolder,
  compileInto,
  babelConfigMap,
  compileGroupCount = 2,
  protocol,
  ip,
  port,
  verbose = false,
  launch,
  mirrorConsole = true,
  stopOnceExecuted,
  filenameRelative,
}) =>
  catchAsyncFunctionCancellation(async () => {
    projectFolder = normalizePathname(projectFolder)
    const cancellationToken = createProcessInterruptionCancellationToken()

    const sourceOrigin = `file://${projectFolder}`

    const { origin: compileServerOrigin } = await startCompileServer({
      cancellationToken,
      importMap,
      projectFolder,
      compileInto,
      babelConfigMap,
      compileGroupCount,
      protocol,
      ip,
      port,
      verbose,
    })

    return launchAndExecute({
      launch: (options) => launch({ ...options, compileInto, sourceOrigin, compileServerOrigin }),
      cancellationToken,
      mirrorConsole,
      stopOnceExecuted,
      filenameRelative,
      verbose,
    })
  })
