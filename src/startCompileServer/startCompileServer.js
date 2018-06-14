// https://github.com/jsenv/core/blob/master/src/api/util/transpiler.js

/* eslint-disable import/max-dependencies */
import { createResponseGenerator } from "../startServer/createResponseGenerator.js"
import { createNodeRequestHandler, enableCORS } from "../startServer/createNodeRequestHandler.js"
import { startServer } from "../startServer/startServer.js"
import { createFileService } from "../createFileService/index.js"
import { URL } from "url"
import { createCompileService } from "../createCompileService/index.js"

import { passed } from "@dmail/action"
import { transformer as defaultTransformer } from "./transformer.js"
import { minifier as defaultMinifier } from "./minifier.js"
import { instrumenter as defaultInstrumenter } from "./instrumenter.js"
import { optimizer as defaultOptimizer } from "./optimizer.js"
import { identifier } from "./identifier.js"
import { sourceMapper } from "./sourceMapper.js"

const compiledFolderRelativeLocation = "compiled"
const cacheFolderRelativeLocation = "build"

export const startCompileServer = ({
  url,
  rootLocation,
  cors = true,
  createOptions = () => {},
  transformer = defaultTransformer,
  minifier = defaultMinifier,
  instrumenter = defaultInstrumenter,
  optimizer = defaultOptimizer,
}) => {
  const createCompiler = (compileContext) => {
    const context = {
      rootLocation,
      compiledFolderRelativeLocation,
      ...compileContext,
    }

    return passed(createOptions(context)).then(
      (
        {
          transform = true,
          minify = false,
          instrument = false,
          optimize = false,
          sourceMap = true,
          sourceMapLocation = "commment", // 'comment' or 'inline'
        } = {},
      ) => {
        const options = {
          transform,
          minify,
          instrument,
          optimize,
          sourceMap,
          sourceMapLocation,
        }

        const compile = (outputRelativeLocation) => {
          // if sourceMap are appended as comment do not put //#sourceURL=../../file.js
          // because chrome will not work with something like //#sourceMappingURL=../../file.js.map
          // thus breaking sourcemaps
          const identify = context.inputRelativeLocation && sourceMap !== "comment"
          // outputRelativeLocation dependent from options:
          // there is a 1/1 relationship between JSON.stringify(options) & outputRelativeLocation
          // it means we can get options from outputRelativeLocation & vice versa
          // this is how compile output gets cached
          context.outputRelativeLocation = outputRelativeLocation

          return passed({
            code: context.input,
            ast: null,
            map: null,
          })
            .then((result) => {
              return transform ? transformer(result, options, context) : result
            })
            .then((result) => {
              return instrument ? instrumenter(result, options, context) : result
            })
            .then((result) => {
              return minify ? minifier(result, options, context) : result
            })
            .then((result) => {
              return optimize ? optimizer(result, options, context) : result
            })
            .then((result) => {
              return identify ? identifier(result, options, context) : result
            })
            .then((result) => {
              return sourceMap ? sourceMapper(result, options, context) : result
            })
            .then(({ code, map, mapName }) => {
              if (mapName) {
                return {
                  output: code,
                  outputAssets: [
                    {
                      name: mapName,
                      content: JSON.stringify(map),
                    },
                  ],
                }
              }
              return {
                output: code,
                outputAssets: [],
              }
            })
        }

        return { options, compile }
      },
    )
  }

  const compileService = createCompileService({
    createCompiler,
    rootLocation,
    cacheFolderRelativeLocation,
    trackHit: true,
  })

  const handler = createResponseGenerator({
    services: [
      (request) => {
        // change pathname from 'compile/folder/file.js' to 'folder/file.js'
        // because only server need a way to differentiate request that needs to be compiled
        // from request that needs to be served as file
        // compileService does not have to know about this
        if (request.url.pathname.startsWith(`/${compiledFolderRelativeLocation}`)) {
          const compileURL = new URL(request.url)
          compileURL.pathname = request.url.pathname.slice(
            `/${compiledFolderRelativeLocation}`.length,
          )
          return compileService({
            ...request,
            url: compileURL,
          })
        }
      },
      createFileService({
        locate: ({ url }) => {
          const pathname = url.pathname.slice(1)
          const resolvedUrl = new URL(pathname, `file:///${rootLocation}/`)
          return resolvedUrl
        },
      }),
    ],
  })

  return startServer({ url }).then(({ url, addRequestHandler, close }) => {
    const nodeRequestHandler = createNodeRequestHandler({
      handler,
      url,
      transform: (response) => (cors ? enableCORS(response) : response),
    })
    addRequestHandler(nodeRequestHandler)

    return { close, url, compileURL: new URL(`${compiledFolderRelativeLocation}/`, url) }
  })
}

// if we want to use react we must start a compileServer like that
/*
import { startCompileServer, defaultTransformer, createBabelOptions } from "@dmail/dev-server"

startCompileServer({
	transformer: (result, options, context) => {
		const { inputRelativeLocation } = context
		if (inputRelativeLocation.endsWith('.jsx')) {
			const babelOptions = createBabelOptions(result, options, context)
			const babelOptionWithReact = {
				...babelOptions,
				plugins: [
					['babel-plugin-syntax-jsx', {}],
					['babel-plugin-transform-react-jsx', { "pragma": "React.createElement" }],
					...babelOptions.plugins
				],
			}
			return babel.transform(result.code, babelOptionWithReact)
		]
		return defaultTransformer(result, options, context)
	}
})
*/

// in order to support a build specific to a given browser swe could
/*
startCompileServer({
	createOptions: ({ request }) => {
		// we could run something client side to decide which
		// profile the client belongs to between a,b,c and send it by cookie or header
		// or decide this using user-agent
		const profile = request.headers.get('x-client-feature-profile')
		return {
			profile
		}
	},
	transformer: (result, options, context) => {
		if (options.profile === 'c') {
			return transformFewThings(result, options, context)
		}
		if (options.profile === 'b') {
			return transformSomeThings(result, options, context)
		}
		return transformAllThings(result, options, context)
	}
})
*/

// hot reloading https://github.com/dmail-old/es6-project/blob/master/lib/start.js#L62
// and https://github.com/dmail-old/project/blob/master/lib/sse.js
