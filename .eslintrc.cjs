const {
  composeEslintConfig,
  eslintConfigBase,
  eslintConfigForPrettier,
  eslintConfigToPreferExplicitGlobals,
  jsenvEslintRules,
  jsenvEslintRulesForImport,
} = require("@jsenv/eslint-config")

const eslintConfig = composeEslintConfig(
  eslintConfigBase,

  // use "@babel/eslint-parser" until top level await is supported by ESLint default parser
  // + to support import assertions in some files
  {
    parser: "@babel/eslint-parser",
    parserOptions: {
      requireConfigFile: false,
    },
  },

  // Files in this repository are all meant to be executed in Node.js
  // and we want to tell this to ESLint.
  // As a result ESLint can consider `window` as undefined
  // and `global` as an existing global variable.
  {
    env: {
      node: true,
    },
  },

  // Enable import plugin
  {
    plugins: ["import"],
    settings: {
      "import/resolver": {
        "@jsenv/eslint-import-resolver": {
          rootDirectoryUrl: __dirname,
          // logLevel: "debug",
          packageConditions: ["node", "development", "import"],
        },
      },
      "import/extensions": [".js", ".mjs"],
      // https://github.com/import-js/eslint-plugin-import/issues/1753
      "import/ignore": ["node_modules/playwright/"],
    },
    rules: jsenvEslintRulesForImport,
  },

  {
    plugins: ["html"],
    settings: {
      extensions: [".html"],
    },
  },

  // Reuse jsenv eslint rules
  {
    rules: {
      ...jsenvEslintRules,
      // Example of code changing the ESLint configuration to enable a rule:
      "camelcase": ["off"],
      "dot-notation": ["off"],
    },
  },

  // package is "type": "module" so:
  // 1. disable commonjs globals by default
  // 2. Re-enable commonjs into *.cjs files
  {
    globals: {
      __filename: "off",
      __dirname: "off",
      require: "off",
      exports: "off",
    },
    overrides: [
      {
        files: ["**/*.cjs"],
        env: {
          commonjs: true,
        },
        // inside *.cjs files. restore commonJS "globals"
        globals: {
          __filename: true,
          __dirname: true,
          require: true,
          exports: true,
        },
      },
    ],
  },

  // several files are written for browsers, not Node.js
  {
    overrides: [
      {
        files: [
          "**/**/*.html",
          "dev_exploring/**/*.js",
          "**/client/**/*.js",
          "**/browser/**/*.js",
          "**/babel_helpers/**/*.js",
          "test/dev_server/**/*.js",
        ],
        env: {
          browser: true,
          node: false,
        },
        settings: {
          "import/resolver": {
            "@jsenv/eslint-import-resolver": {
              rootDirectoryUrl: __dirname,
              packageConditions: ["browser", "import"],
              // logLevel: "debug",
            },
          },
        },
      },
    ],
  },

  // browser and node
  {
    overrides: [
      {
        files: ["./packages/assert/**/*.js"],
        env: {
          browser: true,
          node: true,
        },
      },
    ],
  },

  eslintConfigToPreferExplicitGlobals,

  // We are using prettier, disable all eslint rules
  // already handled by prettier.
  eslintConfigForPrettier,
)

module.exports = eslintConfig
