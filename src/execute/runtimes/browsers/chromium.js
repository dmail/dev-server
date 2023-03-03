import { createRuntimeFromPlaywright } from "./from_playwright.js"

export const chromium = createRuntimeFromPlaywright({
  browserName: "chromium",
  // browserVersion will be set by "browser._initializer.version"
  // see also https://github.com/microsoft/playwright/releases
  browserVersion: "unset",
  coveragePlaywrightAPIAvailable: true,
})
export const chromiumIsolatedTab = chromium.isolatedTab
