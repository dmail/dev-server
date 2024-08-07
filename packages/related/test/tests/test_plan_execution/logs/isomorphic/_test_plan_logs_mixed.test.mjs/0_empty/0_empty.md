# [0_empty](../../test_plan_logs_mixed.test.mjs#L109)

```js
run({
  testPlan: {
    "./client/empty.spec.js": {
      node: {
        runtime: nodeWorkerThread(),
      },
      node_2: {
        runtime: nodeChildProcess(),
      },
    },
    "./client/empty.spec.html": {
      chrome: {
        runtime: chromium(),
      },
      firefox: {
        runtime: firefox(),
      },
      webkit: {
        runtime: webkit(),
      },
    },
  },
})
```

# 1/2 write 2 files into "./output/"

see [./output/](./output/)

# 2/2 resolve

```js
undefined
```
---

<sub>
  Generated by <a href="https://github.com/jsenv/core/tree/main/packages/independent/snapshot">@jsenv/snapshot</a>
</sub>