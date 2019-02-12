import blockScoping from "@babel/plugin-transform-block-scoping"
import { root } from "../../../../root.js"
import { bundleNode } from "../../bundleNode.js"

bundleNode({
  entryPointObject: {
    main: "src/bundle/node/test/https/https.js",
  },
  root,
  pluginMap: {
    "transform-block-scoping": [blockScoping],
  },
})
