/* eslint-disable import/max-dependencies */
import {
  catchAsyncFunctionCancellation,
  createProcessInterruptionCancellationToken,
  cancellationTokenCompose,
  createCancellationSource,
  errorToCancelReason,
} from "@dmail/cancellation"
import { registerFolderLifecycle } from "@dmail/filesystem-watch"
import { operatingSystemPathToPathname } from "@jsenv/operating-system-path"
import { hrefToOrigin, hrefToPathname } from "@jsenv/href"
import { createLogger } from "@jsenv/logger"
import { startCompileServerForTesting } from "../start-compile-server-for-testing.js"
import { generateExecutionArray } from "../execution/generate-execution-array.js"
import { executeAll } from "../execution/execute-all.js"
import {
  DEFAULT_EXECUTE_DESCRIPTION,
  DEFAULT_MAX_PARALLEL_EXECUTION,
  DEFAULT_COMPILE_INTO_RELATIVE_PATH,
} from "../test-constant.js"
import { relativePathToExecutionArray } from "./relativePathToExecutionArray.js"
import { showContinuousTestingNotification } from "./showContinuousTestingNotification.js"
import { createRemoveLog, createRunLog } from "./continous-testing-logs.js"

const cuid = import.meta.require("cuid")

export const TESTING_WATCH_EXCLUDE_DESCRIPTION = {
  "/.git/": false,
  "/node_modules/": false,
}

export const startContinuousTesting = async ({
  projectPath,
  compileIntoRelativePath = DEFAULT_COMPILE_INTO_RELATIVE_PATH,
  importMapRelativePath,
  importDefaultExtension,
  browserPlatformRelativePath,
  nodePlatformRelativePath,
  browserGroupResolverRelativePath,
  nodeGroupResolverRelativePath,
  executeDescription = DEFAULT_EXECUTE_DESCRIPTION,
  watchDescription = {
    "/**/*": true,
    ...TESTING_WATCH_EXCLUDE_DESCRIPTION,
  },
  compileGroupCount = 2,
  babelPluginMap,
  convertMap,
  logLevel,
  maxParallelExecution = DEFAULT_MAX_PARALLEL_EXECUTION,
  defaultAllocatedMsPerExecution = 30000,
  captureConsole = true,
  measureDuration = true,
  measureTotalDuration = false,
  collectNamespace = false,
  systemNotification = true,
  cleanCompileInto,
}) =>
  catchAsyncFunctionCancellation(async () => {
    const logger = createLogger({ logLevel })

    const cancellationToken = createProcessInterruptionCancellationToken()
    const projectPathname = operatingSystemPathToPathname(projectPath)
    const unregisterProjectFolderLifecycle = registerFolderLifecycle(projectPath, {
      watchDescription: {
        ...watchDescription,
        [compileIntoRelativePath]: false,
      },
      keepProcessAlive: false,
      added: ({ relativePath, type }) => {
        if (type === "file") {
          projectFileAddedCallback({ relativePath })
        }
      },
      updated: ({ relativePath }) => {
        if (!projectFileSet.has(relativePath)) return
        projectFileUpdatedCallback({ relativePath })
      },
      removed: ({ relativePath }) => {
        if (!projectFileSet.has(relativePath)) return
        projectFileRemovedCallback({ relativePath })
      },
    })
    cancellationToken.register(unregisterProjectFolderLifecycle)

    let executionArray = await generateExecutionArray(executeDescription, {
      cancellationToken,
      projectPathname,
    })
    executionArray.forEach((execution) => {
      execution.executionId = cuid()
    })

    let testingResult
    let initialTestingDone = false
    let fileMutationMapHandledAfterInitialTesting = {}
    let fileMutationMap
    let resolveActionRequired

    const dependencyTracker = createDependencyTracker()
    let executionImportCallback = ({ relativePath, executionId }) => {
      dependencyTracker.trackDependency(relativePath, executionId)
    }

    const projectFileAddedCallback = ({ relativePath }) => {
      projectFileSet.add(relativePath)

      if (!initialTestingDone) {
        fileMutationMapHandledAfterInitialTesting[relativePath] = "added"
        return
      }

      fileMutationMap[relativePath] = "added"
      checkActionRequiredResolution({
        projectPathname,
        executeDescription,
        executionArray,
        dependencyTracker,
        fileMutationMap,
        resolveActionRequired,
      })
    }

    const projectFileUpdatedCallback = ({ relativePath }) => {
      if (!initialTestingDone) {
        fileMutationMapHandledAfterInitialTesting[relativePath] = "updated"
        return
      }

      fileMutationMap[relativePath] = "updated"
      checkActionRequiredResolution({
        projectPathname,
        executeDescription,
        executionArray,
        dependencyTracker,
        fileMutationMap,
        resolveActionRequired,
      })
    }

    const projectFileRemovedCallback = ({ relativePath }) => {
      if (!initialTestingDone) {
        fileMutationMapHandledAfterInitialTesting[relativePath] = "removed"
        return
      }

      fileMutationMap[relativePath] = "removed"
      checkActionRequiredResolution({
        projectPathname,
        executeDescription,
        executionArray,
        dependencyTracker,
        fileMutationMap,
        resolveActionRequired,
      })
    }

    const projectFileSet = new Set()
    const projectFileRequestedCallback = ({ relativePath, request }) => {
      projectFileSet.add(relativePath)

      const { headers = {} } = request
      if ("x-jsenv-execution-id" in headers) {
        const executionId = headers["x-jsenv-execution-id"]
        executionImportCallback({ relativePath, executionId })
      } else if ("referer" in headers) {
        const { referer } = headers
        if (hrefToOrigin(referer) === request.origin) {
          const refererRelativePath = hrefToPathname(referer)

          executionArray.forEach(({ executionId, fileRelativePath }) => {
            if (fileRelativePath === refererRelativePath) {
              executionImportCallback({ relativePath, executionId })
            }
          })
        } else {
          executionImportCallback({ relativePath })
        }
      } else {
        executionImportCallback({ relativePath })
      }
    }

    const { origin: compileServerOrigin } = await startCompileServerForTesting({
      cancellationToken,
      projectPath,
      compileIntoRelativePath,
      importMapRelativePath,
      importDefaultExtension,
      browserPlatformRelativePath,
      nodePlatformRelativePath,
      browserGroupResolverRelativePath,
      nodeGroupResolverRelativePath,
      compileGroupCount,
      babelPluginMap,
      convertMap,
      logLevel: "off",
      projectFileRequestedCallback,
      cleanCompileInto,
      keepProcessAlive: true,
    })

    const getNextTestingResult = async (actionRequiredPromise) => {
      const {
        toAdd,
        toRun,
        toRemove,
        // fileResponsibleOfAdd,
        fileResponsibleOfRemove,
        fileResponsibleOfRun,
      } = await actionRequiredPromise

      const nextActionRequiredPromise = generateActionRequiredPromise()
      const actionRequiredCancellationSource = createCancellationSource()
      const externalOrFileChangedCancellationToken = cancellationTokenCompose(
        cancellationToken,
        actionRequiredCancellationSource.token,
      )

      if (toRun.length > 0) {
        logger.info(createRunLog({ fileResponsibleOfRun, toRun }))

        const nextDependencyTracker = createDependencyTracker()
        executionImportCallback = ({ relativePath, executionId }) => {
          dependencyTracker.trackDependency(relativePath, executionId)
          nextDependencyTracker.trackDependency(relativePath, executionId)
        }

        let executing
        nextActionRequiredPromise.then(
          () => {
            if (executing) {
              logger.info(`cancel all execution`)
              actionRequiredCancellationSource.cancel({
                code: "ACTION_REQUIRED",
              })
            }
          },
          () => {},
        )

        const previousTestingResult = testingResult
        try {
          executing = true
          testingResult = await executeAll(toRun, {
            cancellationToken: externalOrFileChangedCancellationToken,
            compileServerOrigin,
            projectPath,
            compileIntoRelativePath,
            importMapRelativePath,
            importDefaultExtension,
            logLevel,
            launchLogLevel: "off",
            executeLogLevel: "off",
            maxParallelExecution,
            defaultAllocatedMsPerExecution,
            logEachExecutionSuccess: false,
            captureConsole,
            measureDuration,
            measureTotalDuration,
            collectNamespace,
            afterEachExecutionCallback: ({ executionId }) => {
              // only once an execution is done,
              // we update its dependencyArray
              // because only then we know the actual dependencyArray
              // in case it gets cancelled midway
              // dependencyTracker is still tracking what is hapenning
              // and will be notified of any new file
              // becoming a dependency
              dependencyTracker.setDependencySet(
                executionId,
                nextDependencyTracker.getDependencySet(executionId),
              )
            },
            // we can realize a file is removed when we want to execute it
            // it's not a big problem, let's just call projectFileRemovedCallback
            // it can happen because fs.watch is not notified when a file is removed
            // inside a folder on windows os for instance
            mainFileNotFoundCallback: ({ relativePath }) => {
              projectFileRemovedCallback({ relativePath })
            },
          })
          executing = false

          const updatedRelativePathArray = Object.keys(fileMutationMap).filter((relativePath) => {
            return fileMutationMap[relativePath] === "removed"
          })
          // toRun handled
          updatedRelativePathArray.forEach((relativePath) => {
            delete fileMutationMap[relativePath]
          })

          if (systemNotification) {
            showContinuousTestingNotification({ projectPath, previousTestingResult, testingResult })
          }
        } catch (error) {
          const cancelReason = errorToCancelReason(error)
          if (cancelReason && cancelReason.code === `ACTION_REQUIRED`) {
            // do nothing special, we will just wait to next testing result at the bottom
            // of this function
          } else {
            throw error
          }
        }
      }

      // if cancellation is requested we cannot consider the
      // toAdd, toRun, toRemoved as handled
      if (!externalOrFileChangedCancellationToken.cancellationRequested) {
        if (toAdd.length > 0) {
          // log(createAddLog({ fileResponsibleOfAdd, toAdd }))
          // we should sort thoose execution, but it's ok for now
          executionArray.push(...toAdd)
        }
        if (toRemove.length > 0) {
          logger.info(createRemoveLog({ fileResponsibleOfRemove, toRemove }))
          // we should sort thoose execution, but it's ok for now
          executionArray = executionArray.filter((execution) => !toRemove.includes(execution))
        }
        // all mutation handled, reset the map
        fileMutationMap = {}
      }

      // we wait recursively for next testing result
      // so that something can try/catch
      // the whole execution because we still
      // await for every promise
      return await getNextTestingResult(nextActionRequiredPromise)
    }

    const generateActionRequiredPromise = () => {
      return new Promise((resolve) => {
        resolveActionRequired = resolve
      })
    }

    logger.info("start initial testing")
    testingResult = await executeAll(executionArray, {
      cancellationToken,
      compileServerOrigin,
      projectPath,
      compileIntoRelativePath,
      importMapRelativePath,
      importDefaultExtension,
      logLevel,
      launchLogLevel: "off",
      executeLogLevel: "off",
      maxParallelExecution,
      defaultAllocatedMsPerExecution,
      logEachExecutionSuccess: false,
      captureConsole,
      measureDuration,
      measureTotalDuration,
      collectNamespace,
      // we can realize a file is removed when we want to execute it
      // it's not a big problem, let's just call projectFileRemovedCallback
      // it can happen because fs.watch is not notified when a file is removed
      // inside a folder on windows os for instance
      mainFileNotFoundCallback: ({ relativePath }) => {
        projectFileRemovedCallback({ relativePath })
      },
    })
    initialTestingDone = true
    const actionRequiredPromise = generateActionRequiredPromise()
    const willDoSomething = checkActionRequiredResolution({
      projectPathname,
      executeDescription,
      executionArray,
      dependencyTracker,
      fileMutationMap: fileMutationMapHandledAfterInitialTesting,
      resolveActionRequired,
    })
    fileMutationMapHandledAfterInitialTesting = undefined
    fileMutationMap = {}
    if (!willDoSomething) {
      logger.info(`test execution will restart automatically`)
    }
    await getNextTestingResult(actionRequiredPromise)
  })

const checkActionRequiredResolution = ({
  projectPathname,
  executeDescription,
  executionArray,
  dependencyTracker,
  fileMutationMap,
  resolveActionRequired,
}) => {
  const actionsToPerform = computeActionsToPerform({
    projectPathname,
    executeDescription,
    executionArray,
    dependencyTracker,
    fileMutationMap,
  })
  if (actionsToPerform) {
    resolveActionRequired(actionsToPerform)
    return true
  }
  return false
}

const computeActionsToPerform = ({
  projectPathname,
  executeDescription,
  executionArray,
  dependencyTracker,
  fileMutationMap,
}) => {
  const toAdd = []
  const toRun = []
  const toRemove = []
  const fileResponsibleOfAdd = []
  const fileResponsibleOfRemove = []
  const fileResponsibleOfRun = []

  const fileIsAdded = (relativePath) => fileMutationMap[relativePath] === "added"

  const fileIsUpdated = (relativePath) => fileMutationMap[relativePath] === "updated"

  const fileIsRemoved = (relativePath) => fileMutationMap[relativePath] === "removed"

  executionArray.forEach((execution) => {
    const { fileRelativePath } = execution

    if (fileIsRemoved(fileRelativePath)) {
      if (!fileResponsibleOfRemove.includes(fileRelativePath)) {
        fileResponsibleOfRemove.push(fileRelativePath)
      }
      toRemove.push(execution)
    } else {
      const dependencySet = dependencyTracker.getDependencySet(execution.executionId)
      const executionDependencyChangedArray = Array.from(dependencySet).filter((relativePath) => {
        if (fileIsUpdated(relativePath)) return true
        if (relativePath !== fileRelativePath && fileIsRemoved(relativePath)) return true
        // only indirect dependency added counts
        // otherwise we could add it twice
        if (relativePath !== fileRelativePath && fileIsAdded(relativePath)) return true
        return false
      })
      if (executionDependencyChangedArray.length) {
        executionDependencyChangedArray.forEach((relativePath) => {
          if (!fileResponsibleOfRun.includes(relativePath)) {
            fileResponsibleOfRun.push(relativePath)
          }
        })
        toRun.push(execution)
      }
    }
  })

  Object.keys(fileMutationMap).forEach((relativePath) => {
    if (!fileIsAdded(relativePath)) return

    const toAddForFile = relativePathToExecutionArray({
      projectPathname,
      relativePath,
      executeDescription,
    })
    if (toAddForFile.length) {
      toAddForFile.forEach((execution) => {
        execution.executionId = cuid()
      })
      fileResponsibleOfAdd.push(relativePath)
      toAdd.push(...toAddForFile)
      fileResponsibleOfRun.push(relativePath)
      toRun.push(...toAddForFile)
    }
  })

  if (toAdd.length === 0 && toRun.length === 0 && toRemove.length === 0) {
    return null
  }

  return {
    toAdd,
    toRun,
    toRemove,
    fileResponsibleOfAdd,
    fileResponsibleOfRemove,
    fileResponsibleOfRun,
  }
}

const createDependencyTracker = () => {
  const state = {}

  const trackDependency = (relativePath, executionId) => {
    if (executionId) {
      if (state.hasOwnProperty(executionId)) {
        state[executionId].add(relativePath)
      } else {
        const set = new Set()
        state[executionId] = set
        set.add(relativePath)
      }
    } else {
      Object.keys(state).forEach((executionId) => {
        state[executionId].add(relativePath)
      })
    }
  }

  const getDependencySet = (executionId) => {
    return state.hasOwnProperty(executionId) ? state[executionId] : new Set()
  }

  const setDependencySet = (executionId, dependencySet) => {
    state[executionId] = dependencySet
  }

  return {
    trackDependency,
    getDependencySet,
    setDependencySet,
  }
}
