import { sep, basename } from "path"
import { writeSourceMappingURL } from "../source-mapping-url.js"
import { ansiToHTML } from "../ansiToHTML.js"
import { regexpEscape } from "../stringHelper.js"
import { createParseError } from "../compiled-file-service/index.js"
import { transpiler } from "./transpiler.js"
import { pathnameToOperatingSystemPath } from "../operating-system-path.js"

export const compileJs = async ({
  source,
  projectPathname,
  sourceRelativePath,
  compileRelativePath = sourceRelativePath,
  babelConfigMap,
  transformTopLevelAwait,
  inputAst = undefined,
  inputMap = undefined,
  remap = true,
  remapMethod = "comment", // 'comment', 'inline'
}) => {
  const sourceFilename = pathnameToOperatingSystemPath(`${projectPathname}${sourceRelativePath}`)
  const compileFilename = pathnameToOperatingSystemPath(`${projectPathname}${compileRelativePath}`)

  try {
    const sources = []
    const sourcesContent = []
    const assets = []
    const assetsContent = []

    // source can be fetched at `${compileServer.origin}/src/file.js`
    const sourceToSourceForSourceMap = (source) => `/${source}`

    const { map, code, metadata } = await transpiler({
      input: source,
      filename: sourceFilename,
      filenameRelative: sourceRelativePath.slice(1),
      inputAst,
      inputMap,
      babelConfigMap,
      transformTopLevelAwait,
      remap,
    })
    const coverage = metadata.coverage
    let output = code

    if (remap && map) {
      map.sources = map.sources.map((source) => sourceToSourceForSourceMap(source))
      sources.push(...map.sources)
      if (map.sourcesContent) sourcesContent.push(...map.sourcesContent)

      // we don't need sourceRoot because our path are relative or absolute to the current location
      // we could comment this line because it is not set by babel because not passed during transform
      delete map.sourceRoot
      // removing sourcesContent from map decrease the sourceMap
      // it also means client have to fetch source from server (additional http request)
      // some client ignore sourcesContent property such as vscode-chrome-debugger
      // Because it's the most complex scenario and we want to ensure client is always able
      // to find source from the sourcemap, we explicitely delete nmap.sourcesContent to test this.
      delete map.sourcesContent

      if (remapMethod === "inline") {
        const mapAsBase64 = new Buffer(JSON.stringify(map)).toString("base64")
        output = writeSourceMappingURL(
          output,
          `data:application/json;charset=utf-8;base64,${mapAsBase64}`,
        )
      } else if (remapMethod === "comment") {
        const sourcemappathnameRelative = generateAssetpathnameRelative({
          projectPathname,
          sourceRelativePath,
          assetName: `${basename(sourceRelativePath)}.map`,
        })
        output = writeSourceMappingURL(output, `./${sourcemappathnameRelative}`)
        assets.push(sourcemappathnameRelative)
        assetsContent.push(stringifyMap(map))
      }
    } else {
      sources.push(`/${sourceRelativePath}`)
      sourcesContent.push(source)
    }

    if (coverage) {
      const coveragepathnameRelative = generateAssetpathnameRelative({
        projectPathname,
        sourceRelativePath,
        assetName: "coverage.json",
      })
      assets.push(coveragepathnameRelative)
      assetsContent.push(stringifyCoverage(coverage))
    }

    return {
      compiledSource: output,
      contentType: "application/javascript",
      sources,
      sourcesContent,
      assets,
      assetsContent,
    }
  } catch (error) {
    if (error && error.code === "BABEL_PARSE_ERROR") {
      const message = transformBabelParseErrorMessage(
        error.message,
        sourceFilename,
        compileFilename,
      )
      throw createParseError({
        message,
        messageHTML: ansiToHTML(message),
        filename: sourceFilename,
        outputFilename: compileFilename,
        lineNumber: error.loc.line,
        columnNumber: error.loc.column,
      })
    }
    throw error
  }
}

const generateAssetpathnameRelative = ({ sourceRelativePath, assetName }) => {
  const fileBasename = basename(sourceRelativePath)

  return `${fileBasename}__asset__/${assetName}`
}

const stringifyMap = (object) => JSON.stringify(object, null, "  ")

const stringifyCoverage = (object) => JSON.stringify(object, null, "  ")

const transformBabelParseErrorMessage = (babelParseErrorMessage, filename, replacement) => {
  // the babelParseErrorMessage looks somehow like that:
  /*
  `${filename}: Unexpected token(${lineNumber}:${columnNumber}})

    ${lineNumber - 1} | ${sourceForThatLine}
  > ${lineNumber} | ${sourceForThatLine}
    | ^`
  */
  // and the idea is to replace ${filename} by somsething else

  const filenameString = sep === "/" ? filename : filename.replace(/\//g, "\\")
  const filenameRegexp = new RegExp(regexpEscape(filenameString), "gi")
  const parseErrorMessage = babelParseErrorMessage.replace(filenameRegexp, replacement)
  return parseErrorMessage
}
