// https://github.com/babel/babel/blob/99f4f6c3b03c7f3f67cf1b9f1a21b80cfd5b0224/packages/babel-core/src/tools/build-external-helpers.js
// the list of possible helpers:
// https://github.com/babel/babel/blob/99f4f6c3b03c7f3f67cf1b9f1a21b80cfd5b0224/packages/babel-helpers/src/helpers.js#L13
import { require } from "@jsenv/core/src/internal/require.js"

const babelHelperNameInsideJsenvCoreArray = [
  "applyDecoratedDescriptor",
  "arrayLikeToArray",
  "arrayWithHoles",
  "arrayWithoutHoles",
  "assertThisInitialized",
  "AsyncGenerator",
  "asyncGeneratorDelegate",
  "asyncIterator",
  "asyncToGenerator",
  "awaitAsyncGenerator",
  "AwaitValue",
  "classApplyDescriptorDestructureSet",
  "classApplyDescriptorGet",
  "classApplyDescriptorSet",
  "classCallCheck",
  "classCheckPrivateStaticAccess",
  "classCheckPrivateStaticFieldDescriptor",
  "classExtractFieldDescriptor",
  "classNameTDZError",
  "classPrivateFieldDestructureSet",
  "classPrivateFieldGet",
  "classPrivateFieldLooseBase",
  "classPrivateFieldLooseKey",
  "classPrivateFieldSet",
  "classPrivateMethodGet",
  "classPrivateMethodSet",
  "classStaticPrivateFieldSpecGet",
  "classStaticPrivateFieldSpecSet",
  "classStaticPrivateMethodGet",
  "classStaticPrivateMethodSet",
  "construct",
  "createClass",
  "createForOfIteratorHelper",
  "createForOfIteratorHelperLoose",
  "createSuper",
  "decorate",
  "defaults",
  "defineEnumerableProperties",
  "defineProperty",
  "extends",
  "get",
  "getPrototypeOf",
  "inherits",
  "inheritsLoose",
  "initializerDefineProperty",
  "initializerWarningHelper",
  "instanceof",
  "interopRequireDefault",
  "interopRequireWildcard",
  "isNativeFunction",
  "isNativeReflectConstruct",
  "iterableToArray",
  "iterableToArrayLimit",
  "iterableToArrayLimitLoose",
  "jsx",
  "newArrowCheck",
  "nonIterableRest",
  "nonIterableSpread",
  "objectDestructuringEmpty",
  "objectSpread",
  "objectSpread2",
  "objectWithoutProperties",
  "objectWithoutPropertiesLoose",
  "possibleConstructorReturn",
  "readOnlyError",
  "set",
  "setPrototypeOf",
  "skipFirstGeneratorNext",
  "slicedToArray",
  "slicedToArrayLoose",
  "superPropBase",
  "taggedTemplateLiteral",
  "taggedTemplateLiteralLoose",
  "tdz",
  "temporalRef",
  "temporalUndefined",
  "toArray",
  "toConsumableArray",
  "toPrimitive",
  "toPropertyKey",
  "typeof",
  "unsupportedIterableToArray",
  "wrapAsyncGenerator",
  "wrapNativeSuper",
  "wrapRegExp",
  "writeOnlyError",
]

const babelHelperScope = "@jsenv/core/helpers/babel/"
// maybe we can put back / in front of .jsenv here because we will
// "redirect" or at least transform everything inside .jsenv
// not only everything inside .dist
const babelHelperAbstractScope = `.jsenv/helpers/babel/`

export const listAbstractBabelHelpers = () => {
  const { list } = require("@babel/helpers")
  return list.filter(
    (babelHelperName) => !babelHelperIsInsideJsenvCore(babelHelperName),
  )
}

export const babelHelperNameToImportSpecifier = (babelHelperName) => {
  if (babelHelperNameInsideJsenvCoreArray.includes(babelHelperName)) {
    return `${babelHelperScope}${babelHelperName}/${babelHelperName}.js`
  }
  return `${babelHelperAbstractScope}${babelHelperName}/${babelHelperName}.js`
}

export const babelHelperNameFromUrl = (url) => {
  if (!url.startsWith("file://")) {
    return null
  }
  const babelHelperPrefix = "core/helpers/babel/"
  if (url.includes(babelHelperPrefix)) {
    const afterBabelHelper = url.slice(
      url.indexOf(babelHelperPrefix) + babelHelperPrefix.length,
    )
    const babelHelperName = afterBabelHelper.slice(
      0,
      afterBabelHelper.indexOf("/"),
    )
    return babelHelperName
  }
  if (url.includes(babelHelperAbstractScope)) {
    const afterBabelHelper = url.slice(
      url.indexOf(babelHelperAbstractScope) + babelHelperAbstractScope.length,
    )
    const babelHelperName = afterBabelHelper.slice(
      0,
      afterBabelHelper.indexOf("/"),
    )
    return babelHelperName
  }
  return null
}

export const babelHelperIsInsideJsenvCore = (babelHelperName) => {
  return babelHelperNameInsideJsenvCoreArray.includes(babelHelperName)
}
