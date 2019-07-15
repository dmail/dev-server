import { firstService } from "@dmail/server"
import { serveExploringPageHTML } from "./serve-exploring-page-html.js"
import { serveBrowserSelfExecute } from "./serve-browser-self-execute.js"
import { DEFAULT_COMPILE_INTO_RELATIVE_PATH } from "../compile-server/index.js"

export const serveExploringPage = ({
  compileServerOrigin,
  projectPathname,
  compileIntoRelativePath = DEFAULT_COMPILE_INTO_RELATIVE_PATH,
  importMapRelativePath,
  browserClientRelativePath,
  browserSelfExecuteTemplateRelativePath,
  babelPluginMap,
  browsableMetaMap,
  request,
  livereloading,
}) =>
  firstService(
    () =>
      serveExploringPageHTML({
        projectPathname,
        browserClientRelativePath,
        browsableMetaMap,
        request,
      }),
    () =>
      serveBrowserSelfExecute({
        compileServerOrigin,
        projectPathname,
        importMapRelativePath,
        compileIntoRelativePath,
        browserSelfExecuteTemplateRelativePath,
        babelPluginMap,
        request,
        livereloading,
      }),
  )
