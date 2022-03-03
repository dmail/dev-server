import { startOmegaServer } from "@jsenv/core/src/omega/server.js"

import { jsenvPluginInlineRessources } from "@jsenv/core/src/omega/plugins/inline_ressources/jsenv_plugin_inline_ressources.js"
import { jsenvPluginAutoreload } from "@jsenv/core/src/omega/plugins/autoreload/jsenv_plugin_autoreload.js"
import { jsenvPluginHtmlSupervisor } from "@jsenv/core/src/omega/plugins/html_supervisor/jsenv_plugin_html_supervisor.js"
import { jsenvPluginDataUrls } from "@jsenv/core/src/omega/plugins/data_urls/jsenv_plugin_data_urls.js"
import { jsenvPluginFileSystem } from "@jsenv/core/src/omega/plugins/filesystem/jsenv_plugin_filesystem.js"
import { jsenvPluginCommonJsGlobals } from "@jsenv/core/src/omega/plugins/commonjs_globals/jsenv_plugin_commonjs_globals.js"
import { jsenvPluginBabel } from "@jsenv/core/src/omega/plugins/babel/jsenv_plugin_babel.js"
import { jsenvPluginUrlMentions } from "@jsenv/core/src/omega/plugins/url_mentions/jsenv_plugin_url_mentions.js"

export const startDevServer = async ({
  port,
  protocol,
  certificate,
  privateKey,

  projectDirectoryUrl,
  plugins = [],
}) => {
  const server = await startOmegaServer({
    keepProcessAlive: true,
    port,
    protocol,
    certificate,
    privateKey,
    projectDirectoryUrl,
    plugins: [
      ...plugins,
      jsenvPluginInlineRessources(),
      jsenvPluginAutoreload(),
      jsenvPluginHtmlSupervisor(),
      jsenvPluginCommonJsGlobals(),
      jsenvPluginBabel(),
      jsenvPluginDataUrls(),
      jsenvPluginFileSystem(),
      jsenvPluginUrlMentions(),
    ],
    scenario: "dev",
  })
  return server
}
