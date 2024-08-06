# [diff on collapsed array](../../array.test.js#L111)

```js
assert({
  actual: {
    a: {
      same: [true],
      a: [false, false],
      r: [],
      ma: [false, true],
      mr: [false],
      m: [false, false],
    },
  },
  expect: {
    a: {
      same: [true],
      a: [],
      r: [true, true, true],
      ma: [true],
      mr: [true],
      m: [true, true],
    },
  },
  MAX_DEPTH_INSIDE_DIFF: 0,
});
```

![img](throw.svg)

<details>
  <summary>see without style</summary>

```console
AssertionError: actual and expect are different

actual: {
  a: {
    same: [true],
    a: [
      false,
      false,
    ],
    r: [],
    ↓ 3 props ↓
  },
}
expect: {
  a: {
    same: [true],
    a: [],
    r: [
      true,
      true,
      true,
    ],
    ↓ 3 props ↓
  },
}
```

</details>

---
<sub>
  Generated by <a href="https://github.com/jsenv/core/tree/main/packages/independent/snapshot">@jsenv/snapshot</a>
</sub>