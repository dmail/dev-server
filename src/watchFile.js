import { createSignal } from "@dmail/signal"
import fs from "fs"
import { memoizeSync } from "./memoize.js"

const getModificationDate = (url) => {
  return new Promise((resolve, reject) => {
    fs.stat(url, (error, stat) => {
      if (error) {
        reject(error)
      } else {
        resolve(stat.mtime)
      }
    })
  })
}

const getModificationDateForWatch = (url) => {
  return getModificationDate(url).catch((error) => {
    if (error && error.code === "ENOENT") {
      return new Date()
    }
    return Promise.reject(error)
  })
}

const guardAsync = (fn, shield) => (...args) => {
  return Promise.resolve()
    .then(() => shield(...args))
    .then((shielded) => {
      return shielded ? undefined : fn(...args)
    })
}

const createChangedAsyncShield = ({ valuePromise, get, compare }) => {
  let lastValuePromise

  return (...args) => {
    return Promise.all([
      lastValuePromise === undefined ? valuePromise : lastValuePromise,
      Promise.resolve().then(() => get(...args)),
    ]).then(([previousValue, value]) => {
      lastValuePromise = value
      return !compare(previousValue, value)
    })
  }
}

const limitRate = (fn, ms) => {
  let canBeCalled = true
  return (...args) => {
    if (!canBeCalled) {
      return undefined
    }

    canBeCalled = false
    setTimeout(() => {
      canBeCalled = true
    }, ms)
    return fn(...args)
  }
}

const watchFileChange = (fileLocation, callback) => {
  // https://nodejs.org/docs/latest/api/fs.html#fs_fs_watch_filename_options_listener
  let watcher
  try {
    watcher = fs.watch(fileLocation, { persistent: false })
  } catch (e) {
    if (e.code === "ENOENT") {
      // ignore, but conceptually we would like to be notified if this file gets created no ?
      return null
    }
    throw e
  }

  watcher.on("error", (error) => {
    if (error && error.code === "ENOENT") {
      // ignore, but conceptually we would like to be notified if this file gets created no ?
      return
    }
    throw error
  })
  watcher.on("change", callback)

  // watcher.on('close', () => {})
  return () => {
    watcher.close()
  }
}

const createWatchSignal = (url) => {
  // get mtime right now
  const mtimePromise = getModificationDateForWatch(url)

  return createSignal({
    installer: ({ emit }) => {
      const shield = createChangedAsyncShield({
        valuePromise: mtimePromise,
        get: () => getModificationDateForWatch(url),
        compare: (modificationDate, nextModificationDate) => {
          return Number(modificationDate) !== Number(nextModificationDate)
        },
      })

      const guardedEmit = guardAsync(emit, shield)

      return watchFileChange(
        url,
        limitRate((eventType, filename) => {
          guardedEmit({ url, eventType, filename })
        }, 100),
      )
    },
  })
}

const memoizedCreateWatchSignal = memoizeSync(createWatchSignal)

export const watchFile = (url, fn) => {
  const signal = memoizedCreateWatchSignal(url)
  const listener = signal.listen(fn)
  return () => {
    listener.remove()
  }
}
