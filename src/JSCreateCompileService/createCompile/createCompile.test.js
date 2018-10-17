import { createCompile } from "./createCompile.js"
import fs from "fs"
import path from "path"
import assert from "assert"

const compileJS = createCompile({
  createOptions: () => {
    return {
      transpile: true,
      instrument: false,
    }
  },
})

const root = path.resolve(__dirname, "../../../")
const file = "src/createCompileJS/file.js"
const filename = `${root}/${file}`

compileJS({
  root,
  inputName: file,
  inputSource: fs.readFileSync(filename).toString(),
  groupId: "nothing",
}).then(({ generate }) => {
  return generate({
    outputName: "file.compiled.js",
    getBabelPlugins: () => [],
  }).then(({ output, outputAssets }) => {
    assert.equal(typeof output, "string")
    assert.equal(outputAssets[0].name, "file.js.map")
    console.log("passed")
  })
})
