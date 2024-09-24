System.register([],(function(e,t){"use strict";var r,n,o,u,c,a,f,i,s,l,p,y,d,_,m,h,b,v,S,E,w,R,k,$,j,x,O,g,C,P,I,T,F,D,L;function U(e,t,r){this.props=e,this.context=t,this.refs=S,this.updater=r||b}function A(){}function N(e,t,r){this.props=e,this.context=t,this.refs=S,this.updater=r||b}function V(e,t,r){var n,o={},u=null,a=null;if(null!=t)for(n in void 0!==t.ref&&(a=t.ref),void 0!==t.key&&(u=""+t.key),t)R.call(t,n)&&!$.hasOwnProperty(n)&&(o[n]=t[n]);var f=arguments.length-2;if(1===f)o.children=r;else if(1<f){for(var i=Array(f),s=0;s<f;s++)i[s]=arguments[s+2];o.children=i}if(e&&e.defaultProps)for(n in f=e.defaultProps)void 0===o[n]&&(o[n]=f[n]);return{$$typeof:c,type:e,key:u,ref:a,props:o,_owner:k.current}}function q(e){return"object"==typeof e&&null!==e&&e.$$typeof===c}function M(e,t){return"object"==typeof e&&null!==e&&null!=e.key?function(e){var t={"=":"=0",":":"=2"};return"$"+e.replace(/[=:]/g,(function(e){return t[e]}))}(""+e.key):t.toString(36)}function B(e,t,r,n,o){var u=typeof e;"undefined"!==u&&"boolean"!==u||(e=null);var f=!1;if(null===e)f=!0;else switch(u){case"string":case"number":f=!0;break;case"object":switch(e.$$typeof){case c:case a:f=!0}}if(f)return o=o(f=e),e=""===n?"."+M(f,0):n,w(o)?(r="",null!=e&&(r=e.replace(j,"$&/")+"/"),B(o,t,r,"",(function(e){return e}))):null!=o&&(q(o)&&(o=function(e,t){return{$$typeof:c,type:e.type,key:t,ref:e.ref,props:e.props,_owner:e._owner}}(o,r+(!o.key||f&&f.key===o.key?"":(""+o.key).replace(j,"$&/")+"/")+e)),t.push(o)),1;if(f=0,n=""===n?".":n+":",w(e))for(var i=0;i<e.length;i++){var s=n+M(u=e[i],i);f+=B(u,t,r,s,o)}else if(s=function(e){return null===e||"object"!=typeof e?null:"function"==typeof(e=h&&e[h]||e["@@iterator"])?e:null}(e),"function"==typeof s)for(e=s.call(e),i=0;!(u=e.next()).done;)f+=B(u=u.value,t,r,s=n+M(u,i++),o);else if("object"===u)throw t=String(e),Error("Objects are not valid as a React child (found: "+("[object Object]"===t?"object with keys {"+Object.keys(e).join(", ")+"}":t)+"). If you meant to render a collection of children, use an array instead.");return f}function z(e,t,r){if(null==e)return e;var n=[],o=0;return B(e,n,"","",(function(e){return t.call(r,e,o++)})),n}function H(e){if(-1===e._status){var t=e._result;(t=t()).then((function(t){0!==e._status&&-1!==e._status||(e._status=1,e._result=t)}),(function(t){0!==e._status&&-1!==e._status||(e._status=2,e._result=t)})),-1===e._status&&(e._status=0,e._result=t)}if(1===e._status)return e._result.default;throw e._result}function W(){throw Error("act(...) is not supported in production builds of React.")}
/**
   * @license React
   * react-jsx-runtime.production.min.js
   *
   * Copyright (c) Facebook, Inc. and its affiliates.
   *
   * This source code is licensed under the MIT license found in the
   * LICENSE file in the root directory of this source tree.
   */function Y(e,t,r){var n,o={},u=null,c=null;for(n in void 0!==r&&(u=""+r),void 0!==t.key&&(u=""+t.key),void 0!==t.ref&&(c=t.ref),t)T.call(t,n)&&!D.hasOwnProperty(n)&&(o[n]=t[n]);if(e&&e.defaultProps)for(n in t=e.defaultProps)void 0===o[n]&&(o[n]=t[n]);return{$$typeof:P,type:e,key:u,ref:c,props:o,_owner:F.current}}return{setters:[],execute:function(){r={exports:{}},n={},o={exports:{}},u={},c=Symbol.for("react.element"),a=Symbol.for("react.portal"),f=Symbol.for("react.fragment"),i=Symbol.for("react.strict_mode"),s=Symbol.for("react.profiler"),l=Symbol.for("react.provider"),p=Symbol.for("react.context"),y=Symbol.for("react.forward_ref"),d=Symbol.for("react.suspense"),_=Symbol.for("react.memo"),m=Symbol.for("react.lazy"),h=Symbol.iterator,b={isMounted:function(){return!1},enqueueForceUpdate:function(){},enqueueReplaceState:function(){},enqueueSetState:function(){}},v=Object.assign,S={},U.prototype.isReactComponent={},U.prototype.setState=function(e,t){if("object"!=typeof e&&"function"!=typeof e&&null!=e)throw Error("setState(...): takes an object of state variables to update or a function which returns an object of state variables.");this.updater.enqueueSetState(this,e,t,"setState")},U.prototype.forceUpdate=function(e){this.updater.enqueueForceUpdate(this,e,"forceUpdate")},A.prototype=U.prototype,(E=N.prototype=new A).constructor=N,v(E,U.prototype),E.isPureReactComponent=!0,w=Array.isArray,R=Object.prototype.hasOwnProperty,$={key:!0,ref:!0,__self:!0,__source:!0},j=/\/+/g,g={ReactCurrentDispatcher:x={current:null},ReactCurrentBatchConfig:O={transition:null},ReactCurrentOwner:k={current:null}},u.Children={map:z,forEach:function(e,t,r){z(e,(function(){t.apply(this,arguments)}),r)},count:function(e){var t=0;return z(e,(function(){t++})),t},toArray:function(e){return z(e,(function(e){return e}))||[]},only:function(e){if(!q(e))throw Error("React.Children.only expected to receive a single React element child.");return e}},u.Component=U,u.Fragment=f,u.Profiler=s,u.PureComponent=N,u.StrictMode=i,u.Suspense=d,u.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED=g,u.act=W,u.cloneElement=function(e,t,r){if(null==e)throw Error("React.cloneElement(...): The argument must be a React element, but you passed "+e+".");var n=v({},e.props),o=e.key,u=e.ref,a=e._owner;if(null!=t){if(void 0!==t.ref&&(u=t.ref,a=k.current),void 0!==t.key&&(o=""+t.key),e.type&&e.type.defaultProps)var f=e.type.defaultProps;for(i in t)R.call(t,i)&&!$.hasOwnProperty(i)&&(n[i]=void 0===t[i]&&void 0!==f?f[i]:t[i])}var i=arguments.length-2;if(1===i)n.children=r;else if(1<i){f=Array(i);for(var s=0;s<i;s++)f[s]=arguments[s+2];n.children=f}return{$$typeof:c,type:e.type,key:o,ref:u,props:n,_owner:a}},u.createContext=function(e){return(e={$$typeof:p,_currentValue:e,_currentValue2:e,_threadCount:0,Provider:null,Consumer:null,_defaultValue:null,_globalName:null}).Provider={$$typeof:l,_context:e},e.Consumer=e},u.createElement=V,u.createFactory=function(e){var t=V.bind(null,e);return t.type=e,t},u.createRef=function(){return{current:null}},u.forwardRef=function(e){return{$$typeof:y,render:e}},u.isValidElement=q,u.lazy=function(e){return{$$typeof:m,_payload:{_status:-1,_result:e},_init:H}},u.memo=function(e,t){return{$$typeof:_,type:e,compare:void 0===t?null:t}},u.startTransition=function(e){var t=O.transition;O.transition={};try{e()}finally{O.transition=t}},u.unstable_act=W,u.useCallback=function(e,t){return x.current.useCallback(e,t)},u.useContext=function(e){return x.current.useContext(e)},u.useDebugValue=function(){},u.useDeferredValue=function(e){return x.current.useDeferredValue(e)},u.useEffect=function(e,t){return x.current.useEffect(e,t)},u.useId=function(){return x.current.useId()},u.useImperativeHandle=function(e,t,r){return x.current.useImperativeHandle(e,t,r)},u.useInsertionEffect=function(e,t){return x.current.useInsertionEffect(e,t)},u.useLayoutEffect=function(e,t){return x.current.useLayoutEffect(e,t)},u.useMemo=function(e,t){return x.current.useMemo(e,t)},u.useReducer=function(e,t,r){return x.current.useReducer(e,t,r)},u.useRef=function(e){return x.current.useRef(e)},u.useState=function(e){return x.current.useState(e)},u.useSyncExternalStore=function(e,t,r){return x.current.useSyncExternalStore(e,t,r)},u.useTransition=function(){return x.current.useTransition()},u.version="18.3.1",o.exports=u,C=o.exports,P=Symbol.for("react.element"),I=Symbol.for("react.fragment"),T=Object.prototype.hasOwnProperty,F=C.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED.ReactCurrentOwner,D={key:!0,ref:!0,__self:!0,__source:!0},n.Fragment=I,n.jsx=Y,n.jsxs=Y,r.exports=n,L=r.exports,e("default",function(e){return e&&e.__esModule&&Object.prototype.hasOwnProperty.call(e,"default")?e.default:e}(L)),e("Fragment",L.Fragment),e("jsx",L.jsx),e("jsxs",L.jsxs)}}}));