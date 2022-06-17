// ESM version of "path-to-regexp@6.2.1"
// https://github.com/pillarjs/path-to-regexp/blob/master/package.json

/**
 * Tokenize input string.
 */
function lexer(str) {
  var tokens = []
  var i = 0
  while (i < str.length) {
    var char = str[i]
    if (char === "*" || char === "+" || char === "?") {
      tokens.push({ type: "MODIFIER", index: i, value: str[i++] })
      continue
    }
    if (char === "\\") {
      tokens.push({ type: "ESCAPED_CHAR", index: i++, value: str[i++] })
      continue
    }
    if (char === "{") {
      tokens.push({ type: "OPEN", index: i, value: str[i++] })
      continue
    }
    if (char === "}") {
      tokens.push({ type: "CLOSE", index: i, value: str[i++] })
      continue
    }
    if (char === ":") {
      var name = ""
      let j = i + 1
      while (j < str.length) {
        var code = str.charCodeAt(j)
        if (
          // `0-9`
          (code >= 48 && code <= 57) ||
          // `A-Z`
          (code >= 65 && code <= 90) ||
          // `a-z`
          (code >= 97 && code <= 122) ||
          // `_`
          code === 95
        ) {
          name += str[j++]
          continue
        }
        break
      }
      if (!name) throw new TypeError("Missing parameter name at ".concat(i))
      tokens.push({ type: "NAME", index: i, value: name })
      i = j
      continue
    }
    if (char === "(") {
      var count = 1
      var pattern = ""
      var j = i + 1
      if (str[j] === "?") {
        throw new TypeError('Pattern cannot start with "?" at '.concat(j))
      }
      while (j < str.length) {
        if (str[j] === "\\") {
          pattern += str[j++] + str[j++]
          continue
        }
        if (str[j] === ")") {
          count--
          if (count === 0) {
            j++
            break
          }
        } else if (str[j] === "(") {
          count++
          if (str[j + 1] !== "?") {
            throw new TypeError(
              "Capturing groups are not allowed at ".concat(j),
            )
          }
        }
        pattern += str[j++]
      }
      if (count) throw new TypeError("Unbalanced pattern at ".concat(i))
      if (!pattern) throw new TypeError("Missing pattern at ".concat(i))
      tokens.push({ type: "PATTERN", index: i, value: pattern })
      i = j
      continue
    }
    tokens.push({ type: "CHAR", index: i, value: str[i++] })
  }
  tokens.push({ type: "END", index: i, value: "" })
  return tokens
}
/**
 * Parse a string for the raw tokens.
 */
export function parse(str, { prefixes = "./", delimiter = "/#?" } = {}) {
  var tokens = lexer(str)

  var defaultPattern = "[^".concat(escapeString(delimiter), "]+?")
  var result = []
  var key = 0
  var i = 0
  var path = ""
  var tryConsume = function (type) {
    if (i < tokens.length && tokens[i].type === type) return tokens[i++].value
    return undefined
  }
  var mustConsume = function (type) {
    var value = tryConsume(type)
    if (value !== undefined) return value
    var _a = tokens[i]
    var nextType = _a.type
    var index = _a.inde
    throw new TypeError(
      "Unexpected "
        .concat(nextType, " at ")
        .concat(index, ", expected ")
        .concat(type),
    )
  }
  var consumeText = function () {
    var result = ""
    var value
    while ((value = tryConsume("CHAR") || tryConsume("ESCAPED_CHAR"))) {
      result += value
    }
    return result
  }
  while (i < tokens.length) {
    var char = tryConsume("CHAR")
    var name = tryConsume("NAME")
    var pattern = tryConsume("PATTERN")
    if (name || pattern) {
      let prefix = char || ""
      if (prefixes.indexOf(prefix) === -1) {
        path += prefix
        prefix = ""
      }
      if (path) {
        result.push(path)
        path = ""
      }
      result.push({
        name: name || key++,
        prefix,
        suffix: "",
        pattern: pattern || defaultPattern,
        modifier: tryConsume("MODIFIER") || "",
      })
      continue
    }
    var value = char || tryConsume("ESCAPED_CHAR")
    if (value) {
      path += value
      continue
    }
    if (path) {
      result.push(path)
      path = ""
    }
    var open = tryConsume("OPEN")
    if (open) {
      var prefix = consumeText()
      var name_1 = tryConsume("NAME") || ""
      var pattern_1 = tryConsume("PATTERN") || ""
      var suffix = consumeText()
      mustConsume("CLOSE")
      result.push({
        name: name_1 || (pattern_1 ? key++ : ""),
        pattern: name_1 && !pattern_1 ? defaultPattern : pattern_1,
        prefix,
        suffix,
        modifier: tryConsume("MODIFIER") || "",
      })
      continue
    }
    mustConsume("END")
  }
  return result
}
/**
 * Compile a string to a template function for the path.
 */
export function compile(str, options) {
  return tokensToFunction(parse(str, options), options)
}
/**
 * Expose a method for transforming tokens into the path function.
 */
export function tokensToFunction(
  tokens,
  { sensitive, encode = (x) => x, validate = true },
) {
  // Compile all the tokens into regexps.
  var matches = tokens.map(function (token) {
    if (typeof token === "object") {
      return new RegExp(
        "^(?:".concat(token.pattern, ")$"),
        sensitive ? "" : "i",
      )
    }
    return undefined
  })
  return function (data) {
    var path = ""
    for (var i = 0; i < tokens.length; i++) {
      var token = tokens[i]
      if (typeof token === "string") {
        path += token
        continue
      }
      var value = data ? data[token.name] : undefined
      var optional = token.modifier === "?" || token.modifier === "*"
      var repeat = token.modifier === "*" || token.modifier === "+"
      if (Array.isArray(value)) {
        if (!repeat) {
          throw new TypeError(
            'Expected "'.concat(
              token.name,
              '" to not repeat, but got an array',
            ),
          )
        }
        if (value.length === 0) {
          if (optional) continue
          throw new TypeError(
            'Expected "'.concat(token.name, '" to not be empty'),
          )
        }
        for (var j = 0; j < value.length; j++) {
          let segment = encode(value[j], token)
          if (validate && !matches[i].test(segment)) {
            throw new TypeError(
              'Expected all "'
                .concat(token.name, '" to match "')
                .concat(token.pattern, '", but got "')
                .concat(segment, '"'),
            )
          }
          path += token.prefix + segment + token.suffix
        }
        continue
      }
      if (typeof value === "string" || typeof value === "number") {
        var segment = encode(String(value), token)
        if (validate && !matches[i].test(segment)) {
          throw new TypeError(
            'Expected "'
              .concat(token.name, '" to match "')
              .concat(token.pattern, '", but got "')
              .concat(segment, '"'),
          )
        }
        path += token.prefix + segment + token.suffix
        continue
      }
      if (optional) continue
      var typeOfMessage = repeat ? "an array" : "a string"
      throw new TypeError(
        'Expected "'.concat(token.name, '" to be ').concat(typeOfMessage),
      )
    }
    return path
  }
}
/**
 * Create path match function from `path-to-regexp` spec.
 */
export function match(str, options) {
  var keys = []
  var re = pathToRegexp(str, keys, options)
  return regexpToFunction(re, keys, options)
}
/**
 * Create a path match function from `path-to-regexp` output.
 */
export function regexpToFunction(re, keys, { decode = (x) => x }) {
  return function (pathname) {
    var m = re.exec(pathname)
    if (!m) return false
    var path = m[0]
    var index = m.index
    var params = Object.create(null)
    var _loop_1 = function (i) {
      if (m[i] === undefined) return "continue"
      var key = keys[i - 1]
      if (key.modifier === "*" || key.modifier === "+") {
        params[key.name] = m[i]
          .split(key.prefix + key.suffix)
          .map(function (value) {
            return decode(value, key)
          })
      } else {
        params[key.name] = decode(m[i], key)
      }
      return undefined
    }
    for (var i = 1; i < m.length; i++) {
      _loop_1(i)
    }
    return { path, index, params }
  }
}
/**
 * Escape a regular expression string.
 */
function escapeString(str) {
  return str.replace(/([.+*?=^!:${}()[\]|/\\])/g, "\\$1")
}
/**
 * Pull out keys from a regexp.
 */
function regexpToRegexp(path, keys) {
  if (!keys) return path
  var groupsRegex = /\((?:\?<(.*?)>)?(?!\?)/g
  var index = 0
  var execResult = groupsRegex.exec(path.source)
  while (execResult) {
    keys.push({
      // Use parenthesized substring match if available, index otherwise
      name: execResult[1] || index++,
      prefix: "",
      suffix: "",
      modifier: "",
      pattern: "",
    })
    execResult = groupsRegex.exec(path.source)
  }
  return path
}
/**
 * Transform an array into a regexp.
 */
function arrayToRegexp(paths, keys, { sensitive }) {
  var parts = paths.map(function (path) {
    return pathToRegexp(path, keys, { sensitive }).source
  })
  return new RegExp("(?:".concat(parts.join("|"), ")"), sensitive ? "" : "i")
}
/**
 * Create a path regexp from string input.
 */
function stringToRegexp(path, keys, options) {
  return tokensToRegexp(parse(path, options), keys, options)
}
/**
 * Expose a function for taking tokens and returning a RegExp.
 */
export function tokensToRegexp(
  tokens,
  keys,
  {
    sensitive,
    strict = false,
    start = true,
    end = true,
    encode = (x) => x,
    delimiter = "/#?",
    endsWith = "",
  } = {},
) {
  var endsWithRe = "[".concat(escapeString(endsWith), "]|$")
  var delimiterRe = "[".concat(escapeString(delimiter), "]")
  var route = start ? "^" : ""
  // Iterate over the tokens and create our regexp string.
  for (var _i = 0, tokens_1 = tokens; _i < tokens_1.length; _i++) {
    var token = tokens_1[_i]
    if (typeof token === "string") {
      route += escapeString(encode(token))
    } else {
      var prefix = escapeString(encode(token.prefix))
      var suffix = escapeString(encode(token.suffix))
      if (token.pattern) {
        if (keys) keys.push(token)
        if (prefix || suffix) {
          if (token.modifier === "+" || token.modifier === "*") {
            var mod = token.modifier === "*" ? "?" : ""
            route += "(?:"
              .concat(prefix, "((?:")
              .concat(token.pattern, ")(?:")
              .concat(suffix)
              .concat(prefix, "(?:")
              .concat(token.pattern, "))*)")
              .concat(suffix, ")")
              .concat(mod)
          } else {
            route += "(?:"
              .concat(prefix, "(")
              .concat(token.pattern, ")")
              .concat(suffix, ")")
              .concat(token.modifier)
          }
        } else if (token.modifier === "+" || token.modifier === "*") {
          route += "((?:".concat(token.pattern, ")").concat(token.modifier, ")")
        } else {
          route += "(".concat(token.pattern, ")").concat(token.modifier)
        }
      } else {
        route += "(?:".concat(prefix).concat(suffix, ")").concat(token.modifier)
      }
    }
  }
  if (end) {
    if (!strict) route += "".concat(delimiterRe, "?")
    route += endsWith ? "(?=".concat(endsWithRe, ")") : "$"
  } else {
    var endToken = tokens[tokens.length - 1]
    var isEndDelimited =
      typeof endToken === "string"
        ? delimiterRe.indexOf(endToken[endToken.length - 1]) > -1
        : endToken === undefined
    if (!strict) {
      route += "(?:".concat(delimiterRe, "(?=").concat(endsWithRe, "))?")
    }
    if (!isEndDelimited) {
      route += "(?=".concat(delimiterRe, "|").concat(endsWithRe, ")")
    }
  }
  return new RegExp(route, sensitive ? "" : "i")
}
/**
 * Normalize the given path string, returning a regular expression.
 *
 * An empty array can be passed in for the keys, which will hold the
 * placeholder key descriptions. For example, using `/user/:id`, `keys` will
 * contain `[{ name: 'id', delimiter: '/', optional: false, repeat: false }]`.
 */
export function pathToRegexp(path, keys, options) {
  if (path instanceof RegExp) return regexpToRegexp(path, keys)
  if (Array.isArray(path)) return arrayToRegexp(path, keys, options)
  return stringToRegexp(path, keys, options)
}
