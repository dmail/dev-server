# [request with custom options](../../fetch.test.js#L21)

```js
assert({
  actual: new Request("http://example.com", {
    cache: "default",
    credentials: "same-origin",
    destination: "",
    method: "GET",
    mode: "cors",
    priority: "auto",
    redirect: "follow",
    referrerPolicy: "",
    referrer: "about:client",
  }),
  expect: new Request("http://example.com", {
    body: '{"foo": "bar"}',
    cache: "no-store",
    credentials: "omit",
    destination: "document",
    headers: { from: "developer@example.org" },
    method: "POST",
    mode: "same-origin",
    priority: "high",
    redirect: "manual",
    referrerPolicy: "strict-origin",
    referrer: "http://google.com",
  }),
  MAX_CONTEXT_AFTER_DIFF: 10,
  MAX_CONTEXT_BEFORE_DIFF: 10,
  MAX_DEPTH_INSIDE_DIFF: 5,
});
```

![img](throw.svg)

<details>
  <summary>see without style</summary>

```console
AssertionError: actual and expect are different

actual: Request("http://example.com/")
expect: Request("http://example.com/", {
  body: ReadableStream,
  cache: "no-store",
  credentials: "omit",
  headers: Headers(
    "from" => "developer@example.org",
  ),
  method: "POST",
  mode: "same-origin",
  redirect: "manual",
  referrerPolicy: "strict-origin",
  referrer: "http://google.com/",
})
```

</details>

---
<sub>
  Generated by <a href="https://github.com/jsenv/core/tree/main/packages/independent/snapshot">@jsenv/snapshot</a>
</sub>