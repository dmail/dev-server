# [side_effects_filesystem.test.mjs](../../side_effects_filesystem.test.mjs)

```js
writeFileSync(new URL("./out/a/a_1.txt", import.meta.url));
writeFileSync(new URL("./out/a/a_2.txt", import.meta.url));
writeFileSync(new URL("./out/b/b_1.txt", import.meta.url));
writeFileSync(new URL("./out/b/b_2.txt", import.meta.url));
writeFileSync(new URL("./out/b/b_3.txt", import.meta.url));
```

# 1/2 write 5 files into "./out/"

see [./1_write_in_2_dir/out/](./1_write_in_2_dir/out/)

# 2/2 return

```js
undefined
```

---

<sub>
  Generated by <a href="https://github.com/jsenv/core/tree/main/packages/independent/snapshot">@jsenv/snapshot</a>
</sub>