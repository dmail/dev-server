# console_calls_browsers

<sub>
  Generated by <a href="https://github.com/jsenv/core/tree/main/packages/independent/snapshot">@jsenv/snapshot</a> executing <a href="../console_calls_browsers.test.mjs">../console_calls_browsers.test.mjs</a>
</sub>

## 0_chromium

```js
run({
  runtime: chromium(),
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

## 1_firefox

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

## 2_webkit

```js
run({
  runtime: webkit(),
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