```js
writeFileSync(new URL("./shared/a/a_1.txt", import.meta.url));
writeFileSync(new URL("./shared/a/a_2.txt", import.meta.url));
writeFileSync(new URL("./shared/b/b_1.txt", import.meta.url));
writeFileSync(new URL("./shared/b/b_2.txt", import.meta.url));
writeFileSync(new URL("./shared/b/b_3.txt", import.meta.url));
```

# 1/2 write 5 files into "./shared/" (see [./12_write_in_one_dir/shared/](outDirectoryUrlDisplayed))

# 2/2 return

```js
undefined
```

Generated by [@jsenv/snapshot](https://github.com/jsenv/core/tree/main/packages/independent/snapshot)