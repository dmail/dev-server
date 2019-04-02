import babelPluginTransformClasses from "@babel/plugin-transform-classes"
import { projectFolder } from "../../../../../projectFolder.js"
import { bundleNode } from "../../bundleNode.js"

const testFolder = `${projectFolder}/src/bundle/node/test/class`

bundleNode({
  projectFolder: testFolder,
  into: "dist/node",
  entryPointMap: {
    main: "main.js",
  },
  babelConfigMap: {
    "transform-classes": [babelPluginTransformClasses],
  },
  compileGroupCount: 2,
  verbose: true,
})
