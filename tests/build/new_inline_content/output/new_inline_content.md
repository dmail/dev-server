# new_inline_content.md

<sub>
  Generated by <a href="https://github.com/jsenv/core/tree/main/packages/independent/snapshot">@jsenv/snapshot</a> executing <a href="../new_inline_content.test.mjs">../new_inline_content.test.mjs</a>
</sub>

## 0_js_module

```js
build({
  sourceDirectoryUrl: new URL("./client/", import.meta.url),
  buildDirectoryUrl: new URL("./build/", import.meta.url),
  entryPoints: { "./main.html": "main.html" },
  bundling: false,
  minification: false,
  transpilation: { css: false },
  runtimeCompat: { chrome: "89" },
  assetManifest: true,
})
```

### 1/4 logs

![img](0_js_module/log_group.svg)

<details>
  <summary>see without style</summary>

```console

build "./main.html"
⠋ generate source graph
✔ generate source graph (done in <X> second)
⠋ generate build graph
✔ generate build graph (done in <X> second)
⠋ write files in build directory

```

</details>


### 2/4 write 5 files into "./build/"

see [./0_js_module/build/](./0_js_module/build/)

### 3/4 logs

![img](0_js_module/log_group_1.svg)

<details>
  <summary>see without style</summary>

```console
✔ write files in build directory (done in <X> second)
--- build files ---  
- html : 1 (632 B / 6 %)
- js   : 2 (2.8 kB / 27 %)
- other: 1 (6.8 kB / 67 %)
- total: 4 (10.3 kB / 100 %)
--------------------
```

</details>


### 4/4 resolve

```js
{}
```