export const createUpdateHotHandler = ({
  hotUpdateHandlers,
  fromScriptMeta,
  toScriptMeta,
}) => {
  const actions = []
  if (!fromScriptMeta || !fromScriptMeta.resources) {
    // service worker current script do not expose meta
    return null
  }
  if (!toScriptMeta || !toScriptMeta.resources) {
    // service worker update script do not expose meta
    return null
  }
  const fromResources = fromScriptMeta.resources
  const toResources = toScriptMeta.resources

  const getOneUpdateHotHandler = ({
    url,
    fromUrl,
    toUrl,
    fromVersion,
    toVersion,
  }) => {
    let handler = hotUpdateHandlers[url]
    if (!handler) {
      return null
    }
    if (typeof handler === "function") {
      return handler({ fromUrl, toUrl, fromVersion, toVersion })
    }
    if (!toUrl) {
      if (handler.remove) {
        return () => handler.remove({ fromUrl, toUrl, fromVersion, toVersion })
      }
      return null
    }
    if (!fromUrl) {
      if (handler.add) {
        return () => handler.add({ fromUrl, toUrl, fromVersion, toVersion })
      }
      return null
    }
    if (handler.replace) {
      return () => handler.replace({ fromUrl, toUrl, fromVersion, toVersion })
    }
    return null
  }

  const fromUrls = Object.keys(fromResources)
  const toUrls = Object.keys(toResources)
  for (const fromUrl of fromUrls) {
    const fromUrlMeta = fromResources[fromUrl]
    const toUrlMeta = toResources[fromUrl]
    // remove
    if (!toUrlMeta) {
      const updateHandler = getOneUpdateHotHandler({
        url: fromUrl,
        fromUrl: fromUrlMeta.versionedUrl || fromUrl,
        toUrl: null,
        fromVersion: fromUrlMeta.version || null,
        toVersion: null,
      })
      if (!updateHandler) {
        return null
      }
      actions.push({
        type: "remove",
        url: fromUrl,
        fn: updateHandler,
      })
      continue
    }
    // replace
    if (toUrlMeta.version !== fromUrlMeta.version) {
      const updateHandler = getOneUpdateHotHandler({
        url: fromUrl,
        fromUrl: fromUrlMeta.versionedUrl || fromUrl,
        toUrl: toUrlMeta.versionedUrl || fromUrl,
        fromVersion: fromUrlMeta.version || null,
        toVersion: toUrlMeta.version || null,
      })
      if (!updateHandler) {
        return null
      }
      actions.push({
        type: "replace",
        url: fromUrl,
        fn: updateHandler,
      })
    }
  }
  // add
  for (const toUrl of toUrls) {
    if (fromUrls.includes(toUrl)) {
      continue // already handled in previous loop
    }
    const toUrlMeta = toResources[toUrl]
    const updateHandler = getOneUpdateHotHandler({
      url: toUrl,
      fromUrl: null,
      toUrl: toUrlMeta.versionedUrl || toUrl,
      fromVersion: null,
      toVersion: toUrlMeta.version || null,
    })
    if (!updateHandler) {
      return null
    }
    actions.push({
      type: "add",
      url: toUrl,
      fn: updateHandler,
    })
  }

  // if nothing has changed it means it's the worker implementation (the code)
  // that has changed, so we need to reload
  if (actions.length === 0) {
    return null
  }
  return async () => {
    await Promise.all(
      actions.map(async (action) => {
        await action.fn()
      }),
    )
  }
}
