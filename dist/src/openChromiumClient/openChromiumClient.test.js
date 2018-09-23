"use strict";

var _path = require("path");

var _path2 = _interopRequireDefault(_path);

var _openCompileServer = require("../openCompileServer/openCompileServer.js");

var _openChromiumClient = require("./openChromiumClient.js");

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { "default": obj }; }

// System.import('http://127.0.0.1:9656/compiled/src/__test__/file.js')

// retester
(0, _openCompileServer.openCompileServer)({
  url: "http://127.0.0.1:9656",
  rootLocation: _path2["default"].resolve(__dirname, "../../../"),
  instrument: false // apparently it breaks sourcempa, to be tested
}).then(function (server) {
  var cleanAll = false;

  return (0, _openChromiumClient.openChromiumClient)({
    server: server,
    compileURL: server.compileURL,
    headless: false
  }).then(function (chromiumClient) {
    chromiumClient.execute({
      file: "src/__test__/file.test.js",
      autoClose: cleanAll,
      collectCoverage: true
    }).then(function (_ref) {
      var promise = _ref.promise,
          close = _ref.close;

      promise.then(function (value) {
        if (cleanAll) {
          close();
          server.close();
        }
        console.log("execution done with", value);
      }, function (reason) {
        if (cleanAll) {
          close();
          server.close();
        }
        console.error("execution error", reason);
      });
    });
  });
});
//# sourceMappingURL=openChromiumClient.test.js.map