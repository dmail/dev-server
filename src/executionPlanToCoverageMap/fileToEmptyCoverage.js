import { jsCompile, createInstrumentPlugin } from "../jsCompile/index.js"
import { readFile } from "../fileHelper.js"

export const fileToEmptyCoverage = async (file, { cancellationToken, localRoot }) => {
  cancellationToken.throwIfRequested()

  const input = await readFile(`${localRoot}/${file}`)

  // we must compile to get the coverage object
  // without evaluating the file because it would increment coverage
  // and execute code that can be doing anything
  const { assetMap } = await jsCompile({
    localRoot,
    file,
    input,
    pluginMap: {
      instrument: [createInstrumentPlugin({ predicate: () => true })],
    },
    remap: false,
  })

  const coverageAsset = assetMap["coverage.json"]
  const coverage = JSON.parse(coverageAsset)
  // https://github.com/gotwarlost/istanbul/blob/bc84c315271a5dd4d39bcefc5925cfb61a3d174a/lib/command/common/run-with-cover.js#L229
  Object.keys(coverage.s).forEach(function(key) {
    coverage.s[key] = 0
  })

  return coverage
}
