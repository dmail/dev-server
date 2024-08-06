# [string and signal(string)](../../wrapped_value.test.js#L278)

```js
assert({
  actual: "a",
  expect: {
    [Symbol.toStringTag]: "Signal",
    valueOf: () => "a",
  },
});
```

![img](throw.svg)

<details>
  <summary>see without style</summary>

```console
AssertionError: actual and expect are different

actual: "a"
expect: Signal("a")
```

</details>

---
<sub>
  Generated by <a href="https://github.com/jsenv/core/tree/main/packages/independent/snapshot">@jsenv/snapshot</a>
</sub>