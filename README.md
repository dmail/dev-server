# @jsenv/core [![npm package](https://img.shields.io/npm/v/@jsenv/core.svg?logo=npm&label=package)](https://www.npmjs.com/package/@jsenv/core)

Jsenv is a suite of tools that can be used in projects involving JavaScript.

`@jsenv/core` goal is too provide the following tools:

1. **dev server**; a server for source files
2. **build**; generate an optimized version of source files into a directory
3. **build server**; a server for build files
4. **test runner**; execute all test files at once

It favors standards and simplicity.  
As a result it can be enjoyed by people without much experience in tooling or seeking for simple tools without hidden complexities

Now what do you want to do?

| Scenario                                              | Action                                               |
| ----------------------------------------------------- | ---------------------------------------------------- |
| I want to try a demo on my machine                    | Go to [./demos](#demos)                              |
| I want to try jsenv on a project I have on my machine | Go to [./cli](#cli)                                  |
| I want to learn how to use jsenv                      | Go to [./docs/users/users.md](./docs/users/users.md) |

# Demos

A demo is a project pre-configured with jsenv.  
The following command can be used to install and try a demo:

```console
npm create jsenv@latest
```

It will prompt to choose one of the available demo:

```console
? Select a demo: › - Use arrow-keys. Return to submit.
❯   web
    web-components
    web-react
    web-preact
    node-package
```

Selecting "web" will copy [create-jsenv/demo-web/](./packages/related/create-jsenv/demo-web/) files into a directory:

```console
✔ Select a demo: › web
✔ copy demo files into "[...]jsenv-demo-web/" (done in 0.1 second)
----- commands to run -----
cd jsenv-demo-web
npm install
npm start
---------------------------
```

After running the suggested commands the demo is ready.

The demo contains preconfigured scripts:

- `npm run dev`: starts a server for source files; Documented in [B) Dev](./docs/users/b_dev/b_dev.md).
- `npm run build`: generate build files; Documented in [C) Build](./docs/users/c_build/c_build.md).
- `npm run build:serve`: start a server for build files; Documented in [C) Build#how-to-serve-build-files](./docs/users/c_build/c_build.md#3-how-to-serve-build-files).
- `npm run test`: execute test files; Documented in [D) Test](./docs/users/d_test/d_test.md).

# The best parts

- Test files are [executed like standard files](./docs/users/d_test/d_test.md#14-executing-a-single-test)
- [Isolated environment](./docs/users/d_test/d_test.md#33-isolated-environment) for each test file
- Execute [tests in multiple browsers](./docs/users/d_test/d_test.md#32-execute-on-more-browsers>): Chrome, Safari, Firefox
- [Large browser support during dev](./docs/users/b_dev/b_dev.md#21-browser-support>). Because some people might be happy to use an other browser than the latest chrome during dev. Moreover it is useful to reproduce bug specific to certain browsers.
- [Large browser support after build](./docs/users/c_build/c_build.md#211-maximal-browser-support). Because some product still needs to support old versions of Firefox, Chrome and Safari.
- [Single set of files after build](./docs/users/c_build/c_build.md#212-same-build-for-all-browsers). Because a single one is simpler to properly support in every aspects.
- Versioning during build is robust and <a href="https://bundlers.tooling.report/hashing/avoid-cascade/" target="_blank">avoids cascading hash changes</a><sup>↗</sup>
- Advanced support of top level await, allowing to use it everywhere
- Advanced support of web workers including worker type module
- Unlock [js module features on a classic `<script>`](./docs/users/g_plugins/g_plugins.md#22-asjsclassic>).

<!--
The following commands can be used to skip the prompt

| Command                                     |
| ------------------------------------------- |
| `npm create jsenv@latest -- --web`          |
| `npm create jsenv@latest -- --web-preact`   |
| `npm create jsenv@latest -- --web-react`    |
| `npm create jsenv@latest -- --node-package` |
-->

<!-- # Installation

```console
npm install --save-dev @jsenv/core
```

_@jsenv/core_ is tested on Mac, Windows, Linux with Node.js 20.
Other operating systems and Node.js versions are not tested. -->
