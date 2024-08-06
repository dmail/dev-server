# [max 1 context around diff](../../object.test.js#L306)

```js
assert({
  actual: {
    a: true,
    b: true,
    c: true,
  },
  expect: {
    c: true,
    b: false,
    a: true,
  },
  MAX_CONTEXT_BEFORE_DIFF: 1,
  MAX_CONTEXT_AFTER_DIFF: 1,
});
```

![img](throw.svg)

<details>
  <summary>see without style</summary>

```console
AssertionError: actual and expect are different

actual: {
  a: true,
  b: true,
  c: true,
}
expect: {
  c: true,
  b: false,
  a: true,
}
```

</details>

---
<sub>
  Generated by <a href="https://github.com/jsenv/core/tree/main/packages/independent/snapshot">@jsenv/snapshot</a>
</sub>