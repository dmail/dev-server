import { compileToService } from "./compileToService.js"
import { createCompile } from "../createCompile/index.js"
import assert from "assert"
import path from "path"

const root = path.resolve(__dirname, "../../..")
const cacheFolder = "build"
const compileFolder = "build__dynamic__"

const compile = createCompile()

const service = compileToService(compile, {
  root,
  cacheFolder,
  compileFolder,
  cacheIgnore: true,
})

service({
  ressource: `${compileFolder}/src/__test__/file.js`,
  method: "GET",
  headers: {
    "user-agent": `node/8.0`,
  },
})
  .then((properties) => {
    assert.equal(properties.status, 200)
    assert(properties.headers.vary.indexOf("User-Agent") > -1)
    const fileLocation = properties.headers["x-location"]
    assert(typeof fileLocation, "string")
    assert(typeof properties.headers.ETag, "string")

    return service({
      ressource: `${fileLocation}.map`,
      method: "GET",
      headers: {
        "user-agent": `node/8.0`,
      },
    }).then((properties) => {
      assert.equal(properties.status, 200)
      assert(properties.headers.vary.indexOf("User-Agent") > -1)
      assert.equal(properties.headers["content-type"], "application/json")
    })
  })
  .then(() => {
    // ensure 404 on file not found
    return service({
      method: "GET",
      ressource: `${compileFolder}/src/__test__/file.js:10`,
      headers: {
        "user-agent": `node/8.0`,
      },
    }).then((properties) => {
      assert.equal(properties.status, 404)
      console.log("passed")
    })
  })
