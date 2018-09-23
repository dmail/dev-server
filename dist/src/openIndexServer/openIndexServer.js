"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.openIndexServer = undefined;

var _openServer = require("../openServer/openServer.js");

var openIndexServer = exports.openIndexServer = function openIndexServer(_ref) {
  var url = _ref.url,
      body = _ref.body;

  return (0, _openServer.openServer)({ url: url }).then(function (server) {
    server.addRequestHandler(function () {
      return {
        status: 200,
        headers: {
          "content-type": "text/html",
          "content-length": Buffer.byteLength(body),
          "cache-control": "no-store"
        },
        body: body
      };
    });
    return { url: server.url, close: server.close };
  });
};
//# sourceMappingURL=openIndexServer.js.map