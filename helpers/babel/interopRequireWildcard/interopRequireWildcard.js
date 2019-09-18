var cache = typeof WeakMap === "function" ? new WeakMap() : null

export default function(obj) {
  if (obj && obj.__esModule) {
    return obj
  }
  if (cache && cache.has(obj)) {
    return cache.get(obj)
  }
  var newObj = {}
  if (obj !== null) {
    var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor
    for (var key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null
        if (desc && (desc.get || desc.set)) {
          Object.defineProperty(newObj, key, desc)
        } else {
          newObj[key] = obj[key]
        }
      }
    }
  }
  newObj.default = obj
  if (cache) {
    cache.set(obj, newObj)
  }
  return newObj
}
