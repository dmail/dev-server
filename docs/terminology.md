# jsenv terminology

| term                  | description                                      |
| --------------------- | ------------------------------------------------ |
| project               | a folder containing the files you're working on  |
| importMap             | object used to remap import to an other location |
| platform              | browser, nodejs                                  |
| operating system      | linux, mac, windows                              |
| launcher              | function launching a platform to execute a file  |
| pathname              | pathname part of an url, always starts with `/`  |
| path                  | string leading to a ressource                    |
| facade path           | unresolved path to a ressource                   |
| operating system path | windows path or linux path                       |
| windows path          | `C:\\Users\\file.js`                             |
| linux path            | `/Users/file.js`                                 |
| relative path         | `/folder/file.js` path relative to an other      |
| jsenvception          | jsenv being devDependencies of jsenv itself      |
| service               | function returning a response for a request      |
