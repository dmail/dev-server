import path from "path"

// https://gist.github.com/dmail/54677cc3eae1661813e3a87840666f83#file-url-js

export const ressourceToPathname = (ressource) => {
  const searchSeparatorIndex = ressource.indexOf("?")
  return searchSeparatorIndex === -1 ? ressource : ressource.slice(0, searchSeparatorIndex)
}

export const ressourceToExtension = (ressource) => {
  return path.extname(ressourceToPathname(ressource)).slice(1)
}
