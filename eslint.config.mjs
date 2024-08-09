import babelParser from "@babel/eslint-parser";
import {
  composteEslintFlatConfig,
  eslintConfigBase,
  eslintConfigForPrettier,
  eslintConfigToPreferExplicitGlobals,
  jsenvEslintRules,
} from "@jsenv/eslint-config";
import html from "eslint-plugin-html";
import * as regexpPlugin from "eslint-plugin-regexp";
import globals from "globals";

export default composteEslintFlatConfig(
  eslintConfigBase,
  {
    files: ["**/*.js", "**/*.mjs"],
    ignores: [
      "**/.jsenv/",
      "**/.coverage/",
      "**/dist/",
      "**/node_modules/",
      "**/git_ignored/",
      // newline
      "!/.github/",
      "/dev_exploring/",
      "/experiments/",
      "/node_modules/",
      "/old/",
      // new line
      "**/babel_helpers/",
      "**/client/regenerator_runtime.js",
      "**/async-to-promises.js",
      // new line
      "**/tests/**/**syntax_error**.*",
      "!**/tests/**/**syntax_error**.test.*",
      "**/tests/**/**syntax_error**/main.html",
      "**/tests/**/snapshots/",
      "**/tests/**/output/",
      "**/tests/**/_*test.*/",
      // new line
      "/**/*.nomodule.js",
      "/**/*.jsx",
      "/**/*.noeslint.*",
      "source-map@*.js",
    ],
  },
  // use "@babel/eslint-parser" until top level await is supported by ESLint default parser
  // + to support import assertions in some files
  // node only
  {
    languageOptions: {
      parser: babelParser,
      parserOptions: {
        requireConfigFile: false,
      },
      // Files in this repository are all meant to be executed in Node.js
      // and we want to tell this to ESLint.
      // As a result ESLint can consider `window` as undefined
      // and `global` as an existing global variable.

      // package is "type": "module" so:
      // 1. disable commonjs globals by default
      // 2. Re-enable commonjs into *.cjs files
      globals: {
        ...globals.node,
        __filename: "off",
        __dirname: "off",
        require: "off",
        exports: "off",
      },
    },
  },
  {
    files: ["**/*.cjs"],
    languageOptions: {
      sourceType: "commonjs",
      // inside *.cjs files. restore commonJS "globals"
      globals: {
        __filename: true,
        __dirname: true,
        require: true,
        exports: true,
      },
    },
  },
  // browser only
  {
    files: [
      "**/*.html",
      "dev_exploring/**/*.js",
      "**/client/**/*.js",
      "**/browser/**/*.js",
      "./docs/**/*.js",
      "**/babel_helpers/**/*.js",
      "test/dev_server/**/*.js",
      "./packages/**/pwa/**/*.js",
      "./packages/**/custom-elements-redefine/**/*.js",
      "**/jsenv_service_worker.js",
    ],
    languageOptions: {
      globals: globals.browser,
    },
    settings: {
      "import/resolver": {
        "@jsenv/eslint-import-resolver": {
          rootDirectoryUrl: new URL("./", import.meta.url),
          packageConditions: ["browser", "import"],
          // logLevel: "debug",
        },
      },
    },
  },
  // browser and node
  {
    files: ["./packages/**/assert/**/*.js"],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.browser,
      },
    },
  },
  eslintConfigToPreferExplicitGlobals,
  // Reuse jsenv eslint rules
  {
    rules: {
      ...jsenvEslintRules,
      // Example of code changing the ESLint configuration to enable a rule:
      "camelcase": ["off"],
      "dot-notation": ["off"],
      "spaced-comment": ["off"],
    },
  },
  // We are using prettier, disable all eslint rules
  // already handled by prettier.
  eslintConfigForPrettier,
  // plugins
  // Enable import plugin
  // {
  //   plugins: ["import"],
  //   settings: {
  //     "import/resolver": {
  //       "@jsenv/eslint-import-resolver": {
  //         rootDirectoryUrl: __dirname,
  //         packageConditions: ["node", "development", "import"],
  //       },
  //     },
  //     "import/extensions": [".js", ".mjs"],
  //     // https://github.com/import-js/eslint-plugin-import/issues/1753
  //     "import/ignore": ["node_modules/playwright/"],
  //   },
  //   rules: {
  //     ...jsenvEslintRulesForImport,
  //     "import/no-duplicates": ["off"], // already handled by prettier-plugin-organize-imports
  //   },
  // },
  {
    plugins: { regexp: regexpPlugin },
    rules: {
      "regexp/prefer-d": ["off"],
      "regexp/prefer-w": ["off"],
      "regexp/use-ignore-case": ["off"],
    },
  },
  {
    files: ["**/*.html"],
    plugins: { html },
  },
);
