import { readProjectMetaMap, ressourceToMeta } from "@dmail/project-structure"
import { jsCreateCompileService } from "./jsCreateCompileService/index.js"
import { getGroupMap, groupMapToCompileParamMap, groupMapDefaultId } from "./groupMap/index.js"
import {
  pluginOptionMapToPluginMap,
  fileWriteFromString,
} from "@dmail/project-structure-compile-babel"
import fs from "fs"

const readFile = (location) => {
  return new Promise((resolve, reject) => {
    fs.readFile(location, (error, buffer) => {
      if (error) {
        reject(error)
      } else {
        resolve(String(buffer))
      }
    })
  })
}

const pluginMap = pluginOptionMapToPluginMap({
  "transform-modules-systemjs": {},

  "proposal-async-generator-functions": {},
  "proposal-json-strings": {},
  "proposal-object-rest-spread": {},
  "proposal-optional-catch-binding": {},
  "proposal-unicode-property-regex": {},
  "transform-arrow-functions": {},
  "transform-async-to-generator": {},
  "transform-block-scoped-functions": {},
  "transform-block-scoping": {},
  "transform-classes": {},
  "transform-computed-properties": {},
  "transform-destructuring": {},
  "transform-dotall-regex": {},
  "transform-duplicate-keys": {},
  "transform-exponentiation-operator": {},
  "transform-for-of": {},
  "transform-function-name": {},
  "transform-literals": {},
  "transform-new-target": {},
  "transform-object-super": {},
  "transform-parameters": {},
  "transform-regenerator": {},
  "transform-shorthand-properties": {},
  "transform-spread": {},
  "transform-sticky-regex": {},
  "transform-template-literals": {},
  "transform-typeof-symbol": {},
  "transform-unicode-regex": {},
})

const getGroupMapForProject = (config) => {
  return readFile(config).then(
    (content) => JSON.parse(content),
    (error) => {
      if (error && error.code === "ENOENT") {
        const groupMap = getGroupMap({ pluginNames: Object.keys(pluginMap) })

        fileWriteFromString(config, JSON.stringify(groupMap, null, "  "))

        return groupMap
      }
      return Promise.reject(error)
    },
  )
}

const createPredicateFromStructure = ({ root }) => {
  return readProjectMetaMap({
    root,
  }).then((metaMap) => {
    const instrumentPredicate = (file) => {
      return Boolean(ressourceToMeta(metaMap, file).cover)
    }

    const watchPredicate = (file) => {
      return Boolean(ressourceToMeta(metaMap, file).watch)
    }

    return { instrumentPredicate, watchPredicate }
  })
}

export const createJSCompileServiceForProject = ({ localRoot, compileInto }) => {
  return createPredicateFromStructure({ root: localRoot }).then(
    ({ instrumentPredicate, watchPredicate }) => {
      return getGroupMapForProject(`${localRoot}/${compileInto}/compatGroupMap.config.json`).then(
        (groupMap) => {
          const compileParamMap = groupMapToCompileParamMap(groupMap, pluginMap)

          const compileService = jsCreateCompileService({
            localRoot,
            compileInto,
            compileParamMap,
            cacheIgnore: false,
            cacheTrackHit: true,
            cacheStrategy: "etag",
            assetCacheIgnore: false,
            assetCacheStrategy: "etag",
            instrumentPredicate,
          })

          return {
            compileService,
            watchPredicate,
            groupMap,
            groupMapDefaultId,
          }
        },
      )
    },
  )
}
