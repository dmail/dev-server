# [1_firefox](../../console_calls_browsers.test.mjs#L35)

```js
run({
  runtime: firefox({ disableOnWindowsBecauseFlaky: false }),
})
```

```js
{
  "consoleCalls": [
    {
      "type": "log",
      "text": "foo\n"
    },
    {
      "type": "log",
      "text": "bar\n"
    }
  ]
}
```
---

<sub>
  Generated by <a href="https://github.com/jsenv/core/tree/main/packages/independent/snapshot">@jsenv/snapshot</a>
</sub>