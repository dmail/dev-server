"use strict";

System.register([], function (_export, _context) {
  "use strict";

  var fs, source;
  return {
    setters: [],
    execute: function execute() {
      global.System = {};
      global.System.register = function (stuff, callback) {
        var expose = function expose(name, value) {
          console.log("exported", value, "under", name);
        };
        var context = {};

        var result = callback(expose, context);

        result.execute();
      };

      fs = require("fs");
      source = fs.readFileSync(__dirname + "/file.es5.js").toString();

      eval(source);
    }
  };
});
//# sourceURL=/Users/d.maillard/Dev/Sandbox/npmlink/packages/dev-server/src/sourceMapTest/comment-absolute-system/index.js
//# sourceMappingURL=/Users/d.maillard/Dev/Sandbox/npmlink/packages/dev-server/src/sourceMapTest/comment-absolute-system/index.es5.js.map
//# sourceMappingURL=index.es5.js.map