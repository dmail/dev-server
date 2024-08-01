# json_parse

<sub>
  Generated by <a href="https://github.com/jsenv/core/tree/main/packages/independent/snapshot">@jsenv/snapshot</a> executing <a href="../json_parse.test.mjs">../json_parse.test.mjs</a>
</sub>

## 0_basic

```js
build({
  sourceDirectoryUrl: new URL("./client/", import.meta.url),
  buildDirectoryUrl: new URL("./build/", import.meta.url),
  entryPoints: { "./main.html": "main.html" },
  bundling: false,
  minification: true,
  versioning: false,
  runtimeCompat: { chrome: "89" },
})
```

### 1/4 logs

![img](json_parse/0_basic/log_group.svg)

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


### 2/4 write 2 files into "./build/"

see [./json_parse/0_basic/build/](./json_parse/0_basic/build/)

### 3/4 logs

![img](json_parse/0_basic/log_group_1.svg)

<details>
  <summary>see without style</summary>

```console
✔ write files in build directory (done in <X> second)
--- build files ---  
- html : 1 (175 B / 79 %)
- js   : 1 (46 B / 21 %)
- total: 2 (221 B / 100 %)
--------------------
```

</details>


### 4/4 resolve

```js
{}
```