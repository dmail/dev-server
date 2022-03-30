export const createPluginController = ({ plugins, scenario }) => {
  plugins = flattenAndFilterPlugins(plugins, { scenario })
  const hookGroups = {
    serve: [],
    augmentResponse: [],

    resolve: [],
    normalize: [],
    load: [],
    transform: [],
    transformReferencedUrl: [],
    formatReferencedUrl: [],
    finalize: [],
    cooked: [],
    destroy: [],
  }
  plugins.forEach((plugin) => {
    Object.keys(hookGroups).forEach((hookName) => {
      const hook = plugin[hookName]
      if (hook) {
        hookGroups[hookName].push({
          plugin,
          hookName,
          value: hook,
        })
      }
    })
  })

  let currentPlugin = null
  let currentHookName = null
  const callPluginHook = (hook, info, context) => {
    const hookFn = getHookFunction(hook, info)
    if (!hookFn) {
      return null
    }
    currentPlugin = hook.plugin
    currentHookName = hook.hookName
    let valueReturned = hookFn(info, context)
    valueReturned = assertAndNormalizeReturnValue(hook.hookName, valueReturned)
    currentPlugin = null
    currentHookName = null
    return valueReturned
  }
  const callPluginAsyncHook = async (hook, info, context) => {
    const hookFn = getHookFunction(hook, info)
    if (!hookFn) {
      return null
    }
    currentPlugin = hook.plugin
    currentHookName = hook.hookName
    let valueReturned = await hookFn(info, context)
    valueReturned = assertAndNormalizeReturnValue(hook.hookName, valueReturned)
    currentPlugin = null
    currentHookName = null
    return valueReturned
  }

  const callHooks = (hookName, info, context, callback) => {
    const hooks = hookGroups[hookName]
    for (const hook of hooks) {
      const returnValue = callPluginHook(hook, info, context)
      if (returnValue) {
        callback(returnValue)
      }
    }
  }
  const callAsyncHooks = async (hookName, info, context, callback) => {
    const hooks = hookGroups[hookName]
    await hooks.reduce(async (previous, hook) => {
      await previous
      const returnValue = await callPluginAsyncHook(hook, info, context)
      if (returnValue && callback) {
        await callback(returnValue)
      }
    }, Promise.resolve())
  }

  const callHooksUntil = (hookName, info, context) => {
    const hooks = hookGroups[hookName]
    for (const hook of hooks) {
      const returnValue = callPluginHook(hook, info, context)
      if (returnValue) {
        return returnValue
      }
    }
    return null
  }
  const callAsyncHooksUntil = (hookName, info, context) => {
    const hooks = hookGroups[hookName]
    return new Promise((resolve, reject) => {
      const visit = (index) => {
        if (index >= hooks.length) {
          return resolve()
        }
        const hook = hooks[index]
        const returnValue = callPluginAsyncHook(hook, info, context)
        return Promise.resolve(returnValue).then((output) => {
          if (output) {
            return resolve(output)
          }
          return visit(index + 1)
        }, reject)
      }
      visit(0)
    })
  }

  return {
    callHooks,
    callHooksUntil,
    callAsyncHooks,
    callAsyncHooksUntil,

    getCurrentPlugin: () => currentPlugin,
    getCurrentHookName: () => currentHookName,
  }
}

const flattenAndFilterPlugins = (pluginsRaw, { scenario }) => {
  const plugins = []
  const visitPluginEntry = (pluginEntry) => {
    if (Array.isArray(pluginEntry)) {
      pluginEntry.forEach((value) => visitPluginEntry(value))
      return
    }
    if (typeof pluginEntry === "object" && pluginEntry !== null) {
      const { appliesDuring } = pluginEntry
      if (appliesDuring === undefined) {
        console.warn(`"appliesDuring" is undefined on ${pluginEntry.name}`)
      }
      if (appliesDuring === "*") {
        plugins.push(pluginEntry)
        return
      }
      if (appliesDuring && appliesDuring[scenario]) {
        plugins.push(pluginEntry)
        return
      }
      if (pluginEntry.destroy) {
        pluginEntry.destroy()
      }
      return
    }
    throw new Error(`plugin must be objects, got ${pluginEntry}`)
  }
  pluginsRaw.forEach((plugin) => visitPluginEntry(plugin))
  return plugins
}

const getHookFunction = (
  hook,
  // can be undefined, reference, or urlInfo
  info = {},
) => {
  const hookValue = hook.value
  if (typeof hookValue === "object") {
    const hookForType = hookValue[info.type] || hookValue["*"]
    if (!hookForType) {
      return null
    }
    return hookForType
  }
  return hookValue
}

const assertAndNormalizeReturnValue = (hookName, returnValue) => {
  // all hooks are allowed to return null/undefined as a signal of "I don't do anything"
  if (returnValue === null || returnValue === undefined) {
    return returnValue
  }
  for (const returnValueAssertion of returnValueAssertions) {
    if (!returnValueAssertion.appliesTo.includes(hookName)) {
      continue
    }
    const assertionResult = returnValueAssertion.assertion(returnValue)
    if (assertionResult !== undefined) {
      // normalization
      returnValue = assertionResult
      break
    }
  }
  return returnValue
}

const returnValueAssertions = [
  {
    name: "url_assertion",
    appliesTo: ["resolve", "redirect"],
    assertion: (valueReturned) => {
      if (valueReturned instanceof URL) {
        return valueReturned.href
      }
      if (typeof valueReturned === "string") {
        return undefined
      }
      throw new Error(
        `Unexpected value returned by plugin: it must be a string; got ${valueReturned}`,
      )
    },
  },
  {
    name: "content_assertion",
    appliesTo: ["load", "transform", "finalize"],
    assertion: (valueReturned) => {
      if (typeof valueReturned === "string" || Buffer.isBuffer(valueReturned)) {
        return { content: valueReturned }
      }
      if (typeof valueReturned === "object") {
        const { content } = valueReturned
        if (typeof content !== "string" && !Buffer.isBuffer(content)) {
          throw new Error(
            `Unexpected "content" returned by plugin: it must be a string or a buffer; got ${content}`,
          )
        }
        return undefined
      }
      throw new Error(
        `Unexpected value returned by plugin: it must be a string, a buffer or an object; got ${valueReturned}`,
      )
    },
  },
]
