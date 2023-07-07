;(function() {
  var __versionMappings__ = {
    "/js/file.nomodule.js": "/js/file.nomodule.js?v=67382087"
  };
  window.__v__ = function (specifier) {
    return __versionMappings__[specifier] || specifier
  };
})();

/*
 * This file is a modified version of https://github.com/systemjs/systemjs/blob/main/dist/s.js
 * with the following changes:
 *
 * - Code can use aync/await, const, etc because this file is compiled (see dist/s.js)
 * - Can use document.currentScript because we don't support IE
 * - auto import inline System.register
 * - auto import first System.register in web workers
 * - queing events in web workers
 * - no support for importmap because jsenv don't need it
 */

(function () {
  /* eslint-env browser */

  const loadRegistry = Object.create(null);
  const registerRegistry = Object.create(null);
  let inlineScriptCount = 0;
  const System = {};

  const hasDocument = typeof document === "object";
  const envGlobal = self;
  const isWorker =
    !hasDocument &&
    typeof envGlobal.WorkerGlobalScope === "function" &&
    envGlobal instanceof envGlobal.WorkerGlobalScope;
  const isServiceWorker = isWorker && typeof self.skipWaiting === "function";
  envGlobal.System = System;

  let baseUrl = envGlobal.location.href.split("#")[0].split("?")[0];
  const lastSlashIndex = baseUrl.lastIndexOf("/");
  if (lastSlashIndex !== -1) {
    baseUrl = baseUrl.slice(0, lastSlashIndex + 1);
  }

  const resolveUrl = (specifier, baseUrl) => new URL(specifier, baseUrl).href;

  if (hasDocument) {
    const baseElement = document.querySelector("base[href]");
    if (baseElement) {
      baseUrl = baseElement.href;
    }
    System.register = (deps, declare) => {
      if (!document.currentScript) {
        throw new Error(
          "unexpected call to System.register (document.currentScript is undefined)",
        );
      }
      if (document.currentScript.__s__) {
        registerRegistry[document.currentScript.src] = [deps, declare];
        return null;
      }
      const url =
        document.currentScript.src ||
        `${window.location.href}__inline_script__${++inlineScriptCount}`;
      registerRegistry[url] = [deps, declare];
      return _import(url);
    };
    System.instantiate = (url) => {
      const script = createScript(url);
      return new Promise(function (resolve, reject) {
        let lastWindowErrorUrl;
        let lastWindowError;
        const windowErrorCallback = (event) => {
          lastWindowErrorUrl = event.filename;
          lastWindowError = event.error;
        };
        window.addEventListener("error", windowErrorCallback);
        script.addEventListener("error", () => {
          window.removeEventListener("error", windowErrorCallback);
          reject(`An error occured while loading url with <script> for ${url}`);
        });
        script.addEventListener("load", () => {
          window.removeEventListener("error", windowErrorCallback);
          document.head.removeChild(script);
          // Note that if an error occurs that isn't caught by this if statement,
          // that getRegister will return null and a "did not instantiate" error will be thrown.
          if (lastWindowErrorUrl === url) {
            reject(lastWindowError);
          } else {
            resolve();
          }
        });
        document.head.appendChild(script);
      });
    };
    const createScript = (url) => {
      const script = document.createElement("script");
      script.async = true;
      // Only add cross origin for actual cross origin
      // this is because Safari triggers for all
      // - https://bugs.webkit.org/show_bug.cgi?id=171566
      if (url.indexOf(`${self.location.origin}/`)) {
        script.crossOrigin = "anonymous";
      }
      script.__s__ = true;
      script.src = url;
      return script;
    };
  }
  if (isWorker) {
    /*
     * SystemJs loads X files before executing the worker/service worker main file
     * It mean events dispatched during this phase could be missed
     * A warning like the one below is displayed in chrome devtools:
     * "Event handler of 'install' event must be added on the initial evaluation of worker script"
     * To fix that code below listen for these events early and redispatch them later
     * once the worker file is executed (the listeners are installed)
     */
    const firstImportCallbacks = [];
    if (isServiceWorker) {
      // for service worker there is more events to listen
      // and, to get rid of the warning, we override self.addEventListener
      const eventsToCatch = ["message", "install", "activate", "fetch"];
      const eventCallbackProxies = {};
      const firstImportPromise = new Promise((resolve) => {
        firstImportCallbacks.push(resolve);
      });
      eventsToCatch.forEach((eventName) => {
        const eventsToDispatch = [];
        const eventCallback = (event) => {
          const eventCallbackProxy = eventCallbackProxies[event.type];
          if (eventCallbackProxy) {
            eventCallbackProxy(event);
          } else {
            eventsToDispatch.push(event);
            event.waitUntil(firstImportPromise);
          }
        };
        self.addEventListener(eventName, eventCallback);
        firstImportCallbacks.push(() => {
          if (eventsToDispatch.length) {
            const eventCallbackProxy =
              eventCallbackProxies[eventsToDispatch[0].type];
            if (eventCallbackProxy) {
              eventsToDispatch.forEach((event) => {
                eventCallbackProxy(event);
              });
            }
            eventsToDispatch.length = 0;
          }
        });
      });

      const addEventListener = self.addEventListener;
      self.addEventListener = function (eventName, callback, options) {
        if (eventsToCatch.indexOf(eventName) > -1) {
          eventCallbackProxies[eventName] = callback;
          return null;
        }
        return addEventListener.call(self, eventName, callback, options);
      };
    } else {
      const eventsToCatch = ["message"];
      eventsToCatch.forEach((eventName) => {
        var eventQueue = [];
        var eventCallback = (event) => {
          eventQueue.push(event);
        };
        self.addEventListener(eventName, eventCallback);
        firstImportCallbacks.push(() => {
          self.removeEventListener(eventName, eventCallback);
          eventQueue.forEach(function (event) {
            self.dispatchEvent(event);
          });
          eventQueue.length = 0;
        });
      });
    }

    System.register = async (deps, declare) => {
      System.register = () => {
        throw new Error(
          "unexpected call to System.register (called outside url instantiation)",
        );
      };
      const url = self.location.href;
      registerRegistry[url] = [deps, declare];
      const namespace = await _import(url);
      firstImportCallbacks.forEach((firstImportCallback) => {
        firstImportCallback();
      });
      firstImportCallbacks.length = 0;
      return namespace;
    };
    System.instantiate = async (url) => {
      const response = await self.fetch(url, {
        credentials: "same-origin",
      });
      if (!response.ok) {
        throw Error(`Failed to fetch module at ${url}`);
      }
      let source = await response.text();
      if (source.indexOf("//# sourceURL=") < 0) {
        source += `\n//# sourceURL=${url}`;
      }
      const register = System.register;
      System.register = (deps, declare) => {
        registerRegistry[url] = [deps, declare];
      };
      (0, self.eval)(source);
      System.register = register;
    };
  }

  const _import = (specifier, parentUrl) => {
    const url = resolveUrl(specifier, parentUrl);
    const load = getOrCreateLoad(url, parentUrl);
    if (load.completionPromise) {
      if (load.completionPromise === load.namespace) {
        return Promise.resolve(load.namespace);
      }
      return load.completionPromise;
    }
    return startExecution(load, parentUrl);
  };

  const getOrCreateLoad = (url, firstParentUrl) => {
    const existingLoad = loadRegistry[url];
    if (existingLoad) {
      return existingLoad;
    }
    const namespace = createNamespace();
    const load = {
      url,
      deps: [],
      dependencyLoads: [],
      instantiatePromise: null,
      linkPromise: null,
      executePromise: null,
      completionPromise: null,
      importerSetters: [],
      setters: [],
      execute: null,
      error: null,
      hoistedExports: false,
      namespace,
    };
    loadRegistry[url] = load;
    load.instantiatePromise = (async () => {
      try {
        let registration = registerRegistry[url];
        if (!registration) {
          const instantiateReturnValue = System.instantiate(
            url,
            firstParentUrl,
          );
          if (instantiateReturnValue) {
            await instantiateReturnValue;
          }
          registration = registerRegistry[url];
        }
        if (!registration) {
          throw new Error(
            `System.register() not called after executing ${url}`,
          );
        }

        const _export = (firstArg, secondArg) => {
          load.hoistedExports = true;
          let changed = false;
          if (typeof firstArg === "string") {
            const name = firstArg;
            const value = secondArg;
            if (!(name in namespace) || namespace[name] !== value) {
              namespace[name] = value;
              changed = true;
            }
          } else {
            Object.keys(firstArg).forEach((name) => {
              const value = firstArg[name];
              if (!(name in namespace) || namespace[name] !== value) {
                namespace[name] = value;
                changed = true;
              }
            });
            if (firstArg && firstArg.__esModule) {
              namespace.__esModule = firstArg.__esModule;
            }
          }
          if (changed) {
            load.importerSetters.forEach((importerSetter) => {
              if (importerSetter) {
                importerSetter(namespace);
              }
            });
          }
          return secondArg;
        };
        const [deps, declare] = registration;
        const { setters, execute = () => {} } = declare(_export, {
          import: (importId) => _import(importId, url),
          meta: createMeta(url),
        });
        load.deps = deps;
        load.setters = setters;
        load.execute = execute;
      } catch (e) {
        load.error = e;
        load.execute = null;
      }
    })();
    load.linkPromise = (async () => {
      await load.instantiatePromise;
      const dependencyLoads = await Promise.all(
        load.deps.map(async (dep, index) => {
          const setter = load.setters[index];
          const dependencyUrl = resolveUrl(dep, url);
          const dependencyLoad = getOrCreateLoad(dependencyUrl, url);
          if (dependencyLoad.instantiatePromise) {
            await dependencyLoad.instantiatePromise;
          }
          if (setter) {
            dependencyLoad.importerSetters.push(setter);
            if (
              dependencyLoad.hoistedExports ||
              !dependencyLoad.instantiatePromise
            ) {
              setter(dependencyLoad.namespace);
            }
          }
          return dependencyLoad;
        }),
      );
      load.dependencyLoads = dependencyLoads;
    })();
    return load;
  };

  const startExecution = async (load, importerUrl) => {
    load.completionPromise = (async () => {
      await instantiateAll(load, load, {});
      await postOrderExec(load, importerUrl ? [importerUrl] : []);
      return load.namespace;
    })();
    return load.completionPromise;
  };

  const instantiateAll = async (load, parent, loaded) => {
    if (loaded[load.url]) {
      return;
    }
    loaded[load.url] = true;
    try {
      if (load.linkPromise) {
        // load.linkPromise is null once instantiated
        await load.linkPromise;
      }
      await Promise.all(
        load.dependencyLoads.map((dependencyLoad) => {
          return instantiateAll(dependencyLoad, parent, loaded);
        }),
      );
    } catch (error) {
      if (load.error) {
        throw error;
      }
      load.execute = null;
      throw error;
    }
  };

  const postOrderExec = (load, importStack) => {
    if (importStack.indexOf(load.url) > -1) {
      return undefined;
    }
    if (!load.execute) {
      if (load.error) {
        throw load.error;
      }
      if (load.executePromise) {
        return load.executePromise;
      }
      return undefined;
    }

    // deps execute first, unless circular
    const execute = load.execute;
    load.execute = null;
    const depLoadPromises = [];
    load.dependencyLoads.forEach((dependencyLoad) => {
      try {
        const depImportStack = importStack.slice();
        depImportStack.push(load.url);
        const depLoadPromise = postOrderExec(dependencyLoad, depImportStack);
        if (depLoadPromise) {
          depLoadPromises.push(depLoadPromise);
        }
      } catch (err) {
        load.error = err;
        throw err;
      }
    });

    return (async () => {
      if (depLoadPromises.length) {
        const allDepPromise = Promise.all(depLoadPromises);
        await allDepPromise;
      }

      try {
        const executeReturnValue = execute.call(nullContext);
        if (executeReturnValue) {
          load.executePromise = executeReturnValue.then(
            () => {
              load.executePromise = null;
              load.completionPromise = load.namespace;
            },
            (error) => {
              load.executePromise = null;
              load.error = error;
              throw error;
            },
          );
          return;
        }
        load.instantiatePromise = null;
        load.linkPromise = null;
        load.completionPromise = load.namespace;
      } catch (error) {
        load.error = error;
        throw error;
      } finally {
        load.execute = null;
      }
    })();
  };

  // the closest we can get to call(undefined)
  const nullContext = Object.freeze(Object.create(null));

  const createMeta = (url) => {
    return {
      url,
      resolve: (id) => resolveUrl(id, url),
    };
  };

  const createNamespace =
    typeof Symbol !== "undefined" && Symbol.toStringTag
      ? () => {
          const namespace = Object.create(null);
          Object.defineProperty(namespace, Symbol.toStringTag, {
            value: "Module",
          });
          return namespace;
        }
      : () => Object.create(null);
})();


System.register([], function (_export, _context) {
  "use strict";

  var typeofCurrentScript, getResponse, answer;
  return {
    setters: [],
    execute: function () {
      typeofCurrentScript = typeof document.currentScript;
      /*
       * using spread + destructuring generate a dependency to babel helpers
       * making the code execute async and fails the test
       * How to fix:
       * 1. do not use anything requiring babel helpers (painful and hard to predict)
       * 2. put babel helpers on window/self instead of separate file to share them without having to load a js
       * (that would be great but it's hard to make it work right now)
       * 3. inline babel helpers when using ?js_module_fallback (or at least be able to force inline them)
       * in this scenario
       *
       * SOLUTION FOR NOW: 3
       */
      getResponse = () => {
        return [42];
      };
      [answer] = getResponse();
      console.log({
        ...{
          answer
        }
      });
      window.getResult = async () => {
        const {
          answer
        } = await _context.import(__v__("/js/file.nomodule.js"));
        await new Promise(resolve => {
          setTimeout(resolve, 100);
        });
        const url = _context.meta.url;
        return {
          typeofCurrentScript,
          answer,
          url
        };
      };
    }
  };
});