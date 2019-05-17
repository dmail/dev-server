import { resolve } from "path"
import { hrefToPathname } from "@jsenv/module-resolution"
import { operatingSystemFilenameToPathname } from "./operating-system-filename.js"

let jsenvPath
if (typeof __filename === "string") {
  jsenvPath = resolve(__filename, "../../../") // get ride of dist/node/main.js
} else {
  jsenvPath = resolve(hrefToPathname(import.meta.url), "../../") // get ride of src/ROOT_FOLDER.js
}

export const JSENV_PATH = jsenvPath

export const JSENV_PATHNAME = operatingSystemFilenameToPathname(jsenvPath)
