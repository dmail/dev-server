"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
var normalizeSep = function normalizeSep(path) {
  return path.replace(/\\/g, "/");
};

var stripTrailingSep = function stripTrailingSep(thePath) {
  if (thePath[thePath.length - 1] === "/") {
    return thePath.slice(0, -1);
  }
  return thePath;
};

var pathIsInside = exports.pathIsInside = function pathIsInside(thePath, potentialParent) {
  thePath = normalizeSep(thePath);
  potentialParent = normalizeSep(potentialParent);

  // For inside-directory checking, we want to allow trailing slashes, so normalize.
  thePath = stripTrailingSep(thePath);
  potentialParent = stripTrailingSep(potentialParent);

  // Node treats only Windows as case-insensitive in its path module; we follow those conventions.
  if (process.platform === "win32") {
    thePath = thePath.toLowerCase();
    potentialParent = potentialParent.toLowerCase();
  }

  return thePath.lastIndexOf(potentialParent, 0) === 0 && (thePath[potentialParent.length] === "/" || thePath[potentialParent.length] === undefined);
};
//# sourceMappingURL=pathIsInside.js.map