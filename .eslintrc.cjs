const { createEslintConfig } = require("@jsenv/eslint-config")

const config = createEslintConfig({
  projectDirectoryUrl: __dirname,
  importResolutionMethod: "import-map",
  importMapFileRelativeUrl: "./import-map.importmap",
  // importResolverOptions: {
  //   logLevel: "debug",
  // },
  node: true,
  prettier: true,
})

// disable commonjs globals by default
// (package is "type": "module")
Object.assign(config.globals, {
  __filename: "off",
  __dirname: "off",
  require: "off",
})

config.overrides = [
  // inside *.cjs files. restore commonJS "globals"
  {
    files: ["**/*.cjs"],
    globals: {
      __filename: true,
      __dirname: true,
      require: true,
    },
  },
  // several files are written for browsers, not Node.js
  {
    files: [
      "**/createBrowserRuntime/**/*.js",
      "**/exploring/**/*.js",
      "**/toolbar/**/*.js",
      "**/browser-utils/**/*.js",
      "**/detectBrowser/**/*.js",
    ],
    env: {
      browser: true,
      node: false,
    },
  },
]

module.exports = config
