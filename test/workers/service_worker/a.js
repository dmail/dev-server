/* globals self */

self.order.push("before-b")

// eslint-disable-next-line import/first
import "./b.js"

self.order.push("after-b")
