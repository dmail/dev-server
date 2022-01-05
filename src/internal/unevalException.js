import { uneval } from "@jsenv/uneval"

export const unevalException = (value) => {
  if (value && value.hasOwnProperty("toString")) {
    delete value.toString
  }
  return uneval(value, { ignoreSymbols: true })
}
