import blockScoping from "@babel/plugin-transform-block-scoping"
import { projectFolder } from "../../../../../projectFolder.js"
import { bundleNode } from "../../bundleNode.js"

const testFolder = `${projectFolder}/src/bundle/node/test/import-meta-url`

bundleNode({
  projectFolder: testFolder,
  into: "dist/node",
  entryPointsDescription: {
    main: "import-meta-url.js",
  },
  babelPluginDescription: {
    "transform-block-scoping": [blockScoping],
  },
  compileGroupCount: 1,
  minify: false,
  verbose: true,
})
