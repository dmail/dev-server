import { predictLocalDependencies } from "../predict-local-dependencies/predictLocalDependencies.js"
import { ensureDependenciesInsideRoot } from "./ensureDependenciesInsideRoot.js"
import { resolveDependenciesRealFile } from "./resolveDependenciesRealFile.js"
import { dependenciesToMapping } from "./dependenciesToMapping.js"
import { patternGroupToMetaMap, forEachRessourceMatching } from "@dmail/project-structure"

export const computeCompilationInstruction = async ({
  cancellationToken,
  localRoot,
  main,
  compilePatternMapping,
}) => {
  const [mainCompilationInstruction, additionalCompilationInstruction] = await Promise.all([
    getMainCompilationInstruction({
      cancellationToken,
      localRoot,
      main,
    }),
    getAdditionalCompilationInstruction({
      cancellationToken,
      localRoot,
      compilePatternMapping,
    }),
  ])

  const compilationInstruction = {
    ...mainCompilationInstruction,
    ...additionalCompilationInstruction,
  }
  return compilationInstruction
}

const getMainCompilationInstruction = async ({ cancellationToken, localRoot, main }) => {
  const mainDependencies = await predictLocalDependencies({
    cancellationToken,
    root: localRoot,
    ressource: main,
  })

  const dependencies = resolveDependenciesRealFile(mainDependencies)
  ensureDependenciesInsideRoot({ root: localRoot, ressource: main, dependencies })

  const mapping = dependenciesToMapping({ localRoot, main, dependencies })
  const files = {}
  Object.keys(dependencies).forEach((dependency) => {
    files[dependency.realFile] = { type: "compile" }
  })

  return {
    mapping,
    files,
  }
}

const getAdditionalCompilationInstruction = async ({
  cancellationToken,
  localRoot,
  compilePatternMapping,
}) => {
  const metaMap = patternGroupToMetaMap({
    compile: compilePatternMapping,
  })

  const mapping = {}
  const files = {}

  await forEachRessourceMatching({
    cancellationToken,
    localRoot,
    metaMap,
    predicate: (meta) => meta.compile,
    callback: (ressource, meta) => {
      files[`${localRoot}/${ressource}`] = meta.compile
    },
  })

  return { mapping, files }
}
