const importMetaResolveReturnValue = import.meta.resolve("/js/foo.js");

const script = document.createElement("script");
script.src = importMetaResolveReturnValue;
const scriptLoadPromise = new Promise((resolve) => {
  script.onload = () => {
    resolve();
  };
});
document.head.appendChild(script);

await scriptLoadPromise;

window.resolveResultPromise({
  importMetaResolveReturnValue,
  __TEST__: window.__TEST__,
});
