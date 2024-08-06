# [well known symbol diff](../../symbol.test.js#L95)

```js
assert({
  actual: Symbol.iterator,
  expect: Symbol.toStringTag,
});
```

![img](throw.svg)

<details>
  <summary>see without style</summary>

```console
AssertionError: actual and expect are different

actual: Symbol.iterator
expect: Symbol.toStringTag
```

</details>

---
<sub>
  Generated by <a href="https://github.com/jsenv/core/tree/main/packages/independent/snapshot">@jsenv/snapshot</a>
</sub>