/*
 * Test the following:
 * - a script[hot-accept] can hot reload when supervised
 * - Introducing a syntax error displays the error overlay
 * - Fixing the syntax error removes the error overlay
 */

import { replaceFileStructureSync, writeFileSync } from "@jsenv/filesystem";
import { readFileSync } from "node:fs";
import { chromium } from "playwright";

import { startDevServer } from "@jsenv/core";
import {
  assertErrorOverlayDisplayed,
  assertErrorOverlayNotDisplayed,
} from "../error_overlay_test_helpers.js";

let debug = false;
const sourceDirectoryUrl = new URL("./git_ignored/", import.meta.url);
replaceFileStructureSync({
  from: new URL("./0_at_start/", import.meta.url),
  to: sourceDirectoryUrl,
});
const devServer = await startDevServer({
  logLevel: "off",
  serverLogLevel: "off",
  sourceDirectoryUrl,
  keepProcessAlive: !debug,
  port: 0,
});

const browser = await chromium.launch({ headless: !debug });
const page = await browser.newPage({ ignoreHTTPSErrors: true });

try {
  const mainJsFileUrl = new URL("./main.js", sourceDirectoryUrl);
  await page.goto(`${devServer.origin}/main.html`);
  await assertErrorOverlayNotDisplayed(page);
  writeFileSync(
    mainJsFileUrl,
    readFileSync(
      new URL("./1_syntax_error/js_syntax_error.js", import.meta.url),
    ),
  );
  await new Promise((resolve) => setTimeout(resolve, 500));
  await assertErrorOverlayDisplayed(page, "after_syntax_error");
  writeFileSync(
    mainJsFileUrl,
    readFileSync(new URL("./2_fix_syntax_error/main.js", import.meta.url)),
  );
  await new Promise((resolve) => setTimeout(resolve, 500));
  await assertErrorOverlayNotDisplayed(page, "after_fix_and_autoreload");
} finally {
  if (!debug) {
    browser.close();
    devServer.stop(); // required because for some reason the rooms are kept alive
  }
}
