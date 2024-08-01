# import_circular_build

<sub>
  Generated by <a href="https://github.com/jsenv/core/tree/main/packages/independent/snapshot">@jsenv/snapshot</a> executing <a href="../import_circular_build.test.mjs">../import_circular_build.test.mjs</a>
</sub>

## 0_with_bundling

```js
build({
  ...testParams,
  bundling: true,
})
```

### 1/4 logs

![img](import_circular_build/0_with_bundling/log_group.svg)

<details>
  <summary>see without style</summary>

```console

build "./main.js"
⠋ generate source graph
✔ generate source graph (done in <X> second)
⠋ bundle "js_module"
✔ bundle "js_module" (done in <X> second)
⠋ generate build graph
✔ generate build graph (done in <X> second)
⠋ write files in build directory

```

</details>


### 2/4 write file "./build/main.js"

see [./import_circular_build/0_with_bundling/build/main.js](./import_circular_build/0_with_bundling/build/main.js)

### 3/4 logs

![img](import_circular_build/0_with_bundling/log_group_1.svg)

<details>
  <summary>see without style</summary>

```console
✔ write files in build directory (done in <X> second)
--- build files ---  
- js   : 1 (403 B / 100 %)
- total: 1 (403 B / 100 %)
--------------------
```

</details>


### 4/4 resolve

```js
{}
```

## 1_without_bundling

```js
build({
  ...testParams,
  bundling: false,
})
```

### 1/4 logs

![img](import_circular_build/1_without_bundling/log_group.svg)

<details>
  <summary>see without style</summary>

```console

build "./main.js"
⠋ generate source graph
✔ generate source graph (done in <X> second)
⠋ generate build graph
✔ generate build graph (done in <X> second)
⠋ write files in build directory

```

</details>


### 2/4 write 5 files into "./build/"

see [./import_circular_build/1_without_bundling/build/](./import_circular_build/1_without_bundling/build/)

### 3/4 logs

![img](import_circular_build/1_without_bundling/log_group_1.svg)

<details>
  <summary>see without style</summary>

```console
✔ write files in build directory (done in <X> second)
--- build files ---  
- js   : 5 (1 kB / 100 %)
- total: 5 (1 kB / 100 %)
--------------------
```

</details>


### 4/4 resolve

```js
{}
```