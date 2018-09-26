"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.createSSERoom = void 0;

var _createBody = require("../openServer/createBody.js");

// https://github.com/dmail-old/project/commit/da7d2c88fc8273850812972885d030a22f9d7448
// https://github.com/dmail-old/project/commit/98b3ae6748d461ac4bd9c48944a551b1128f4459
// https://github.com/dmail-old/http-eventsource/blob/master/lib/event-source.js
// http://html5doctor.com/server-sent-events/
const stringifySourceEvent = ({
  data,
  type = "message",
  id,
  retry
}) => {
  let string = "";

  if (id !== undefined) {
    string += `id:${id}\n`;
  }

  if (retry) {
    string += `retry:${retry}\n`;
  }

  if (type !== "message") {
    string += `event:${type}\n`;
  }

  string += `data:${data}\n\n`;
  return string;
};

const createEventHistory = ({
  limit
} = {}) => {
  const events = [];
  let removedCount = 0;

  const add = data => {
    events.push(data);

    if (events.length >= limit) {
      events.shift();
      removedCount++;
    }
  };

  const since = index => {
    index = parseInt(index);

    if (isNaN(index)) {
      throw new TypeError("history.since() expect a number");
    }

    index -= removedCount;
    return index < 0 ? [] : events.slice(index);
  };

  const reset = () => {
    events.length = 0;
    removedCount = 0;
  };

  return {
    add,
    since,
    reset
  };
}; // https://www.html5rocks.com/en/tutorials/eventsource/basics/


const createSSERoom = ({
  keepaliveDuration = 30000,
  retryDuration = 1000,
  historyLength = 1000,
  maxLength = 100 // max 100 users accepted

} = {}) => {
  const connections = new Set();
  const history = createEventHistory(historyLength);
  let lastEventId = 0;
  let state = "closed";
  let interval;

  const connect = lastEventId => {
    if (connections.size > maxLength) {
      return {
        status: 503
      };
    }

    if (state === "closed") {
      return {
        status: 204
      };
    }

    const joinEvent = {
      id: lastEventId,
      retry: retryDuration,
      type: "join",
      data: new Date().toLocaleTimeString()
    };
    lastEventId++;
    history.add(joinEvent);
    const events = [joinEvent, // send events which occured between lastEventId & now
    ...(lastEventId === undefined ? [] : history.since(lastEventId))];
    const connection = (0, _createBody.createBody)();
    connections.add(connection);
    connection.closed.listen(() => {
      console.log(`client disconnected, number of client connected to event source: ${connections.size}`);
      connections.delete(connection);
    });
    console.log(`client joined, number of client connected to event source: ${connections.size}, max allowed: ${maxLength}`);
    events.forEach(event => {
      console.log(`send ${event.type} event to this new client`);
      connection.write(stringifySourceEvent(event));
    });
    return {
      status: 200,
      headers: {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        connection: "keep-alive"
      },
      body: connection
    };
  };

  const write = data => {
    connections.forEach(connection => {
      connection.write(data);
    });
  };

  const sendEvent = event => {
    if (event.type !== "comment") {
      console.log(`send ${event.type} event, number of client listening event source: ${connections.size}`);
      event.id = lastEventId;
      lastEventId++;
      history.add(event);
    }

    write(stringifySourceEvent(event));
  };

  const keepAlive = () => {
    // maybe that, when an event occurs, we can delay the keep alive event
    console.log(`send keep alive event, number of client listening event source: ${connections.size}`);
    sendEvent({
      type: "comment",
      data: new Date().toLocaleTimeString()
    });
  };

  const open = () => {
    interval = setInterval(keepAlive, keepaliveDuration);
    state = "opened";
  };

  const close = () => {
    // it should close every connection no?
    clearInterval(interval);
    history.reset();
    state = "closed";
  };

  return {
    open,
    close,
    connect,
    sendEvent
  };
};

exports.createSSERoom = createSSERoom;
//# sourceMappingURL=createSSERoom.js.map