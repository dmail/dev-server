import { ressourceToPathname } from "../urlHelper.js"

export const createRoute = ({ method, path = "*", handler }) => {
  const regexp = new RegExp(`^${path.replace(/\*/g, ".*?")}$`)
  const matchPath = (requestPathname) => {
    return regexp.test(requestPathname)
  }

  const lowserCaseMethod = method.toLowerCase()
  const matchMethod = (requestMethod) => {
    if (lowserCaseMethod === "*") {
      return true
    }
    return requestMethod.toLowerCase() === lowserCaseMethod
  }

  return (request) => {
    if (matchMethod(request.method) === false) {
      return false
    }
    if (matchPath(ressourceToPathname(request.ressource)) === false) {
      return false
    }
    return handler(request)
  }
}
