# new_url_and_js_module_fallback.md

<sub>
  Generated by <a href="https://github.com/jsenv/core/tree/main/packages/independent/snapshot">@jsenv/snapshot</a> executing <a href="../new_url_and_js_module_fallback.test.mjs">../new_url_and_js_module_fallback.test.mjs</a>
</sub>

## 0_basic

```js
build({
  sourceDirectoryUrl: new URL("./client/", import.meta.url),
  buildDirectoryUrl: new URL("./build/", import.meta.url),
  entryPoints: { "./main.html": "main.html" },
  bundling: false,
  minification: false,
  runtimeCompat: { chrome: "60" },
})
```

### 1/4 logs

![img](0_basic/log_group.svg)

<details>
  <summary>see without style</summary>

```console

build "./main.html"
⠋ generate source graph
✔ generate source graph (done in <X> second)
⠋ generate build graph
✔ generate build graph (done in <X> second)
⠋ resync resource hints
✔ resync resource hints (done in <X> second)
⠋ write files in build directory

```

</details>


### 2/4 write 2 files into "./build/"

see [./0_basic/build/](./0_basic/build/)

### 3/4 logs

![img](0_basic/log_group_1.svg)

<details>
  <summary>see without style</summary>

```console
✔ write files in build directory (done in <X> second)
--- build files ---  
- html : 1 (17.5 kB / 100 %)
- other: 1 (0 B / 0 %)
- total: 2 (17.5 kB / 100 %)
--------------------
```

</details>


### 4/4 resolve

```js
{}
```