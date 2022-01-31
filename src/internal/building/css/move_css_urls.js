import { urlToRelativeUrl } from "@jsenv/filesystem"

import { applyPostCss } from "./apply_post_css.js"
import { postCssPluginUrlVisitor } from "./postcss_plugin_url_visitor.js"

export const moveCssUrls = async ({
  code,
  from,
  to,
  map,
  sourcemapMethod,
} = {}) => {
  const fromDirectoryUrl = new URL("./", from).href
  const toDirectoryUrl = new URL("./", to).href
  // same directory, nothing to do
  if (fromDirectoryUrl === toDirectoryUrl) {
    return { code, map }
  }

  const result = await applyPostCss({
    code,
    url: from,
    map,
    sourcemapMethod,
    plugins: [
      postCssPluginUrlVisitor({
        urlVisitor: ({ specifier }) => {
          if (specifier[0] === "#") {
            return null
          }
          const url = new URL(specifier, fromDirectoryUrl).href
          const relativeUrl = urlToRelativeUrl(url, toDirectoryUrl)
          return relativeUrl
        },
      }),
    ],
  })
  code = result.code
  map = result.map
  return {
    code,
    map,
  }
}
