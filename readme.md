# @jsenv/core [![npm package](https://img.shields.io/npm/v/@jsenv/core.svg?logo=npm&label=package)](https://www.npmjs.com/package/@jsenv/core)

Jsenv was first created to write tests that could be executed in different runtimes. It has naturally evolved to cover the core needs of a JavaScript project.

- :exploding_head: Directly execute HTML files as tests
- :relieved: Consistent and integral developer experience (dev + test + build)
- :relieved: Same dev experience for source and test files
- :ok_hand: Seamless integration with standard HTML, CSS and JS

# Demo

Run the following command to create a demo of a jsenv project on your machine.

```console
npm create jsenv@latest
```

> "web" demos are running tests in headless browsers. If you never have installed playwright on your machine npm install can take a bit of time.

# Installation

```console
npm install --save-dev @jsenv/core
```

_@jsenv/core_ is tested on Mac, Windows, Linux on Node.js 16.14.0. Other operating systems and Node.js versions are not tested.

# Documentation

| Link                                               | Description                                    |
| -------------------------------------------------- | ---------------------------------------------- |
| [Browser support](./docs/browser_support.md)       | Documentation around browser support           |
| [Url resolution](./docs/url_resolution.md)         | Url resolution inside and outside js modules   |
| [Assets and workers](./docs/assets_and_workers.md) | How to use assets and workers                  |
| [NPM package](./docs/npm_package.md)               | How to use a NPM package (especially commonjs) |

# Name

The name "jsenv" stands for JavaScript environments. This is because the original purpose of jsenv was to bring closer two JavaScript runtimes: web browsers and Node.js.

Maybe "jsenv" should be written "JSEnv"? That makes typing the name too complex:

1. Hold `shift` on keyboard
2. While holding `shift`, type `JSE`
3. Release `shift`
4. Finally, type `nv`.

No one wants to do that: the prefered syntax is "jsenv".

# Logo

The logo is composed by the name at the center and two circles orbiting around it. One of the circle is web browsers, the other is Node.js. It represents the two JavaScript environments supported by jsenv.

![jsenv logo with legend](./docs/jsenv_logo_legend.png)

# See also

| Link                                                                                              | Description                                                  |
| ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| [@jsenv/assert](https://github.com/jsenv/assert)                                                  | NPM package to write assertions                              |
| [I am too lazy for a test framework](https://dev.to/dmail/i-am-too-lazy-for-a-test-framework-92f) | Article presenting a straightforward testing experience      |
| [@jsenv/template-pwa](https://github.com/jsenv/jsenv-template-pwa)                                | GitHub repository template for a progressive web application |
