import { answer } from "/node_modules/foo/index.js?v=1.0.1";

document.querySelector("#app").innerHTML = answer;
window.resolveResultPromise(answer);
