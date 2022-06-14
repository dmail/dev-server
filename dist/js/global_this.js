// https://mathiasbynens.be/notes/globalthis

/* eslint-disable no-redeclare */

/* global globalThis */
let globalObject;

if (typeof globalThis === "object") {
  globalObject = globalThis;
} else {
  if (undefined) {
    globalObject = undefined;
  } else {
    // eslint-disable-next-line no-extend-native
    Object.defineProperty(Object.prototype, "__global__", {
      get() {
        return this;
      },

      configurable: true
    }); // eslint-disable-next-line no-undef

    globalObject = __global__;
    delete Object.prototype.__global__;
  }

  globalObject.globalThis = globalObject;
}

var globalObject$1 = globalObject;

export { globalObject$1 as default };
