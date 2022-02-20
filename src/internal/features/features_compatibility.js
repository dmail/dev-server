import { babelPluginCompatMap } from "./babel_plugins_compatibility.js"

export const featuresCompatMap = {
  script_type_module: {
    edge: "16",
    firefox: "60",
    chrome: "61",
    safari: "10.1",
    opera: "48",
    ios: "10.3",
    android: "61",
    samsung: "8.2",
  },
  import_meta: {
    chrome: "64",
    edge: "79",
    firefox: "62",
    safari: "11.1",
    opera: "51",
    ios: "12",
    android: "9",
  },
  import_dynamic: {
    edge: "79",
    firefox: "67",
    chrome: "63",
    safari: "11.3",
    opera: "50",
    android: "8",
  },
  // https://caniuse.com/import-maps
  importmap: {
    edge: "89",
    chrome: "89",
    opera: "76",
    samsung: "15",
  },
  import_type_json: {
    chrome: "91",
    edge: "91",
  },
  import_type_css: {
    chrome: "93",
    edge: "93",
  },
  worker_type_module: {
    chrome: "80",
    edge: "80",
    opera: "67",
    android: "80",
  },
  worker_importmap: {},
  // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/globalThis#browser_compatibility
  global_this: {
    edge: "79",
    firefox: "65",
    chrome: "71",
    safari: "12.1",
    opera: "58",
    ios: "12.2",
    android: "94",
    node: "12",
  },
  async_generator_function: {
    chrome: "63",
    opera: "50",
    edge: "79",
    firefox: "57",
    safari: "12",
    node: "10",
    ios: "12",
    samsung: "8",
    electron: "3",
  },
  ...babelPluginCompatMap,
}
