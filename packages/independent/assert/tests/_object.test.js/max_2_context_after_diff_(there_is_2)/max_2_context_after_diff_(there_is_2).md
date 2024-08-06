# [max 2 context after diff (there is 2)](../../object.test.js#L169)

```js
assert({
  actual: {
    a: true,
    b: true,
    c: true,
  },
  expect: {
    a: false,
    b: true,
    c: true,
  },
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
  a: false,
  b: true,
  c: true,
}
```

</details>

---
<sub>
  Generated by <a href="https://github.com/jsenv/core/tree/main/packages/independent/snapshot">@jsenv/snapshot</a>
</sub>