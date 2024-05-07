# url port

```js
assert({
  actual: new URL("http://example.com"),
  expect: new URL("http://example.com:8000"),
});
```

![img](<./url/url port.svg>)

# url string and url

```js
assert({
  actual: "http://example.com",
  expect: new URL("http://example.com:8000"),
});
```

![img](<./url/url string and url.svg>)

# url and url string

```js
assert({
  actual: new URL("http://example.com"),
  expect: "http://example.com:8000",
});
```

![img](<./url/url and url string.svg>)

# url string and url string

```js
assert({
  actual: "http://example.com",
  expect: "http://example.com:8000",
});
```

![img](<./url/url string and url string.svg>)

# url and non url string

```js
assert({
  actual: new URL("http://example.com"),
  expect: "totoabcexample.com",
});
```

![img](<./url/url and non url string.svg>)

# non url string and url

```js
assert({
  actual: "totoabcexample.com",
  expect: new URL("http://example.com"),
});
```

![img](<./url/non url string and url.svg>)

# url and boolean

```js
assert({
  actual: new URL("http://example.com"),
  expect: true,
});
```

![img](<./url/url and boolean.svg>)

# url string inside a prop

```js
assert({
  actual: {
    a: "http://example.com",
    b: true,
  },
  expect: {
    a: "http://example.com",
    b: false,
  },
});
```

![img](<./url/url string inside a prop.svg>)

# url string and object with href

```js
assert({
  actual: "http://example.com",
  expect: {
    href: "http://example.com",
  },
});
```

![img](<./url/url string and object with href.svg>)

# url object port and object with port

```js
assert({
  actual: new URL("http://example.com:45"),
  expect: {
    port: 45,
  },
});
```

![img](<./url/url object port and object with port.svg>)

# file protocol vs http protocol

```js
assert({
  actual: "http://example/file.txt",
  expect: "file://example/file.js",
});
```

![img](<./url/file protocol vs http protocol.svg>)

# quote test

```js
assert({
  actual: "http://example.com",
  expect: `test"quotes`,
});
```

![img](<./url/quote test.svg>)

# double quote in url string

```js
assert({
  actual: `http://a.com"`,
  expect: `http://b.com"`,
});
```

![img](<./url/double quote in url string.svg>)

# url origin is case insensitive

```js
assert({
  actual: {
    a: `http://example.com/page`,
    b: true,
  },
  expect: {
    a: `HTTP://EXAMPLE.COM/PAGE`,
    b: false,
  },
});
```

![img](<./url/url origin is case insensitive.svg>)

# internal string vs url object

```js
assert({
  actual: {
    [Symbol.toStringTag]: "Signal",
    valueOf: () => "toto",
  },
  expect: new URL("http://toto.com"),
});
```

![img](<./url/internal string vs url object.svg>)

# internal url string vs url string

```js
assert({
  actual: {
    [Symbol.toStringTag]: "Signal",
    valueOf: () => "http://a.com/",
  },
  expect: "http://b.com",
});
```

![img](<./url/internal url string vs url string.svg>)
