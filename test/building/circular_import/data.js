import { executionOrder } from "./execution_order.js"
import { Tag } from "./tag.js"
import "./index.js"

executionOrder.push("data")

export const data = () => "data"
export const Data = () => `Tag: ${Tag()}`
