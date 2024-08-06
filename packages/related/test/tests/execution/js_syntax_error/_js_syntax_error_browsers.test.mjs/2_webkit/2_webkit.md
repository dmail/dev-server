# [2_webkit](../../js_syntax_error_browsers.test.mjs#L31)

```js
run({
  runtime: webkit(),
})
```

# 1/2 logs

![img](log_group.svg)

<details>
  <summary>see without style</summary>

```console
⠋ start dev server
✔ start dev server (done in <X> second)

- http://localhost
- http://[::1]

Error while handling http://localhost/js_syntax_error.js:
PARSE_ERROR
base/client/js_syntax_error.js:1:11
1 | const a = (
              ^
```

</details>


# 2/2 reject

```console
SyntaxError: Unexpected end of script
```
---

<sub>
  Generated by <a href="https://github.com/jsenv/core/tree/main/packages/independent/snapshot">@jsenv/snapshot</a>
</sub>