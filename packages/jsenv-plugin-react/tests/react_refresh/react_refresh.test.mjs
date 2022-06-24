import { readFileSync, writeFileSync } from "node:fs"
import { chromium } from "playwright"
import { assert } from "@jsenv/assert"

import { startDevServer } from "@jsenv/core"
import { jsenvPluginReact } from "@jsenv/plugin-react"

const countLabelJsxFileUrl = new URL(
  "./client/count_label.jsx",
  import.meta.url,
)
const countLabelJsxFileContent = {
  beforeTest: readFileSync(countLabelJsxFileUrl),
  update: (content) => writeFileSync(countLabelJsxFileUrl, content),
  restore: () =>
    writeFileSync(countLabelJsxFileUrl, countLabelJsxFileContent.beforeTest),
}

const devServer = await startDevServer({
  logLevel: "warn",
  rootDirectoryUrl: new URL("./client/", import.meta.url),
  keepProcessAlive: false,
  plugins: [jsenvPluginReact()],
  clientFiles: {
    "./**": true,
  },
  cooldownBetweenFileEvents: 250,
})
const browser = await chromium.launch({
  headless: true,
})
try {
  const page = await browser.newPage({ ignoreHTTPSErrors: true })
  await page.goto(`${devServer.origin}/main.html`)
  await page.evaluate(
    /* eslint-disable no-undef */
    () => window.readyPromise,
    /* eslint-enable no-undef */
  )
  const getCountLabelText = () => {
    return page.evaluate(
      /* eslint-disable no-undef */
      () => document.querySelector("#count_label").innerHTML,
      /* eslint-enable no-undef */
    )
  }
  const increase = () => {
    return page.click("#button_increase")
  }

  {
    const actual = {
      countLabelText: await getCountLabelText(),
    }
    const expected = {
      countLabelText: "toto: 0",
    }
    assert({ actual, expected })
  }
  {
    await increase()
    const actual = {
      countLabelText: await getCountLabelText(),
    }
    const expected = {
      countLabelText: "toto: 1",
    }
    assert({ actual, expected })
  }
  await countLabelJsxFileContent.update(`export const CountLabel = ({ count }) => {
  return (
    <span id="count_label" style={{ color: "black" }}>
      tata: {count}
    </span>
  )
}
`)
  await new Promise((resolve) => setTimeout(resolve, 500))
  {
    const actual = {
      countLabelText: await getCountLabelText(),
    }
    const expected = {
      countLabelText: "tata: 1",
    }
    assert({ actual, expected })
  }
  {
    await increase()
    const actual = {
      countLabelText: await getCountLabelText(),
    }
    const expected = {
      countLabelText: "tata: 2",
    }
    assert({ actual, expected })
  }
} finally {
  browser.close()
  countLabelJsxFileContent.restore()
}
