# js_throw_dev

<sub>
  Generated by <a href="https://github.com/jsenv/core/tree/main/packages/independent/snapshot">@jsenv/snapshot</a> executing <a href="../js_throw_dev.test.mjs">../js_throw_dev.test.mjs</a>
</sub>

## 0_chromium

```js
run({ browserLauncher: chromium })
```

### 1/2 write 4 files into "./.jsenv/chrome@127.00/"

see [./0_chromium/.jsenv/chrome@127.00/](./0_chromium/.jsenv/chrome@127.00/)

### 2/2 reject

```console
Error: chromium "pageerror" {
  [cause]: Error: SPECIAL_STRING_UNLIKELY_TO_COLLIDE
    at triggerError (http://localhost/trigger_error.js:2:9)
    at http://localhost/main.js:3:1,
}
```