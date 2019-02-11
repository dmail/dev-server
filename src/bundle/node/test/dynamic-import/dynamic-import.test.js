import blockScoping from "@babel/plugin-transform-block-scoping"
import { localRoot } from "../../../../localRoot.js"
import { bundleNode } from "../../bundleNode.js"

bundleNode({
  root: localRoot,
  entryPointObject: {
    main: "src/bundle/node/test/dynamic-import/dynamic-import.js",
  },
  pluginMap: {
    "transform-block-scoping": [blockScoping],
  },
})
