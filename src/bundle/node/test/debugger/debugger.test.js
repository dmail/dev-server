import blockScoping from "@babel/plugin-transform-block-scoping"
import { localRoot } from "../../../../localRoot.js"
import { bundleNode } from "../../bundleNode.js"

bundleNode({
  root: localRoot,
  entryPointObject: {
    main: "src/bundle/node/test/debugger/debugger.js",
  },
  pluginMap: {
    "transform-block-scoping": [blockScoping],
  },
})
