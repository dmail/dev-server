import { writeFileSync } from "@jsenv/filesystem";
import {
  snapshotFunctionSideEffects,
  takeDirectorySnapshot,
} from "@jsenv/snapshot";

const outputDirectorySnapshot = takeDirectorySnapshot(
  new URL("./output/", import.meta.url),
);
const test = (scenario, fn, options) => {
  return snapshotFunctionSideEffects(fn, import.meta.url, {
    sideEffectDirectoryName: `output/${scenario}/`,
    ...options,
  });
};
test("0_no_op", () => {});
test("1_return_undefined", () => undefined);
test("2_return_null", () => null);
test("3_return_hello_world", () => "hello world");
test("4_log_and_return_42", () => {
  console.log("Hello");
  return 42;
});
test("4_multiple_console_calls", () => {
  console.log("log_0");
  console.info("info_0");
  console.warn("warn_0");
  console.error("error_0");
  console.log("log_1");
  console.info("info_1");
  console.warn("warn_1");
  console.error("error_1");
});
test("5_throw_error", () => {
  throw new Error("here");
});
await test("6_async_resolving_to_42", async () => {
  const value = await Promise.resolve(42);
  return value;
});
await test("7_async_rejecting", async () => {
  await Promise.resolve();
  throw new Error("here");
});
await test(
  "8_async_complex",
  async () => {
    console.log("start");
    await new Promise((resolve) => {
      setTimeout(resolve, 50);
    });
    console.info("timeout done");
    await new Promise((resolve) => {
      setTimeout(resolve, 50);
    });
    console.warn("a warning after 2nd timeout");
    console.warn("and an other warning");
    writeFileSync(new URL("./toto.txt", import.meta.url), "toto");

    throw new Error("in the end we throw");
  },
  {
    filesystemRedirects: ["./toto.txt"],
  },
);
outputDirectorySnapshot.compare();
