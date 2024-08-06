# [0_basic](../../coverage_browsers_and_node.test.mjs#L56)

```js
await run({
  testPlan: {
    "./client/main.test.html": {
      chromium: {
        runtime: chromium(),
      },
      firefox: {
        runtime: firefox({
          disableOnWindowsBecauseFlaky: false,
        }),
      },
      webkit: {
        runtime: webkit(),
      },
    },
    "./client/main.test.js": {
      node: {
        runtime: nodeWorkerThread(),
      },
      node2: {
        runtime: nodeWorkerThread(),
      },
    },
  },
});
```

# 1/2 write file "./file.js.png"

see [./file.js.png](./file.js.png)

# 2/2 resolve

```js
undefined
```
---

<sub>
  Generated by <a href="https://github.com/jsenv/core/tree/main/packages/independent/snapshot">@jsenv/snapshot</a>
</sub>