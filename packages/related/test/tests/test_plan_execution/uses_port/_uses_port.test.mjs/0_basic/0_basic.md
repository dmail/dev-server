# [0_basic](../../uses_port.test.mjs#L35)

```js
run({
  a: { uses: ["port:4"] },
  b: { uses: ["port:5"] },
  c: { uses: ["port:6"] },
})
```

```js
[
  "a_start",
  "b_start",
  "c_start",
  "a_end",
  "b_end",
  "c_end"
]
```

---

<sub>
  Generated by <a href="https://github.com/jsenv/core/tree/main/packages/independent/snapshot">@jsenv/snapshot</a>
</sub>