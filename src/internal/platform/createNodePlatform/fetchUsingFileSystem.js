import { urlToContentType } from "@jsenv/server"
import { readFile } from "@jsenv/util"

export const fetchUsingFileSystem = async (url) => {
  // if we found a symlink we should send 307 ?
  // nope but we should update the returned url: key to the symlink target

  const source = await readFile(url)

  // on pourrait ajouter des info dans headers comme le mtime, e-tag ?
  return {
    url,
    status: 200,
    statusText: "OK",
    headers: {
      "content-type": urlToContentType(url),
    },
    body: source,
  }
}
