import blockScoping from "@babel/plugin-transform-block-scoping"
import { projectFolder } from "../../../../projectFolder.js"
import { bundleNode } from "../../bundleNode.js"

bundleNode({
  projectFolder,
  into: "bundle/node",
  entryPointsDescription: {
    main: "src/bundle/node/test/without-balancing/without-balancing.js",
  },
  babelPluginDescription: {
    "transform-block-scoping": [blockScoping],
  },
  compileGroupCount: 1,
  verbose: true,
})
