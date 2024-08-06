# [add metric in server timing](../../headers.test.js#L192)

```js
assert({
  actual: new Headers({
    "server-timing": `cpu;dur=2.4, app;dur=47.2`,
  }),
  expect: new Headers({
    "server-timing": `cpu;dur=2.4`,
  }),
});
```

![img](throw.svg)

<details>
  <summary>see without style</summary>

```console
AssertionError: actual and expect are different

actual: Headers(
  "server-timing" => "cpu;dur=2.4, app;dur=47.2"
)
expect: Headers(
  "server-timing" => "cpu;dur=2.4"
)
```

</details>

---
<sub>
  Generated by <a href="https://github.com/jsenv/core/tree/main/packages/independent/snapshot">@jsenv/snapshot</a>
</sub>