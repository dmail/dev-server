import isUnicodeSupported from "is-unicode-supported";
import { createUnicode } from "./unicode_runtime_agnostic.js";
import { ANSI } from "../ansi/ansi_node.js";

export const UNICODE = createUnicode({
  supported: isUnicodeSupported() || process.env.FORCE_UNICODE === "1",
  ANSI,
});
