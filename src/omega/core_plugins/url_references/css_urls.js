/*
 * https://github.com/parcel-bundler/parcel/blob/v2/packages/transformers/css/src/CSSTransformer.js
 */

import { applyPostCss } from "@jsenv/utils/css_ast/apply_post_css.js"
import { postCssPluginUrlVisitor } from "@jsenv/utils/css_ast/postcss_plugin_url_visitor.js"
import { replaceCssUrls } from "@jsenv/utils/css_ast/replace_css_urls.js"

export const parseAndTransformCssUrls = async (urlInfo, context) => {
  const url = urlInfo.data.sourceUrl || urlInfo.url
  const content = urlInfo.content
  const { referenceUtils } = context
  const referencePerUrls = {}
  await applyPostCss({
    sourcemaps: false,
    plugins: [
      postCssPluginUrlVisitor({
        urlVisitor: ({ url, type, specifier, urlNode }) => {
          const [reference] = referenceUtils.found({
            type: `css_${type}`,
            start: urlNode.sourceIndex,
            end: urlNode.sourceEndIndex,
            specifier,
          })
          referencePerUrls[url] = reference
        },
      }),
    ],
    url,
    content,
  })

  // we can't use magic source because urlMention.start/end do not match the url specifier
  // const magicSource = createMagicSource({ url, content })
  // cssUrlMentions.forEach((urlMention) => {
  //   magicSource.replace({
  //     start: urlMention.start,
  //     end: urlMention.end,
  //     replacement: JSON.stringify(transformUrlMention(urlMention)),
  //   })
  // })
  // return magicSource.toContentAndSourcemap()

  await Promise.all(
    urlInfo.references.map(async (reference) => {
      await referenceUtils.readGeneratedSpecifier(reference)
    }),
  )
  const result = await replaceCssUrls({
    url,
    content,
    urlVisitor: ({ url, replace }) => {
      const reference = referencePerUrls[url]
      if (reference) {
        replace(reference.generatedSpecifier)
      }
    },
  })
  return {
    content: result.content,
    sourcemap: result.map,
  }
}
