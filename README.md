# dev-server

todo list

- covering with error in the midlde of execution must not prevent next file execution
- covering when platform is disconnected in the middle of execution
- ensure logs are not a mess because files are execute in parallel
  ideally log should be captured and become part of an executionReport object
  that we can log properly once execution is done
  think the same than when creating a response for a request in a server
  -> in that case we wait for response before logging the request/response data
- nice log output a bit like the one from prettiest
- Avoid node_modules in coverageMap
- an api to bundle js into dist

Nice to have

- we should still try to collect coverageMap if file execution throw
  (this way we would have a partial coverage until error was thrown)
