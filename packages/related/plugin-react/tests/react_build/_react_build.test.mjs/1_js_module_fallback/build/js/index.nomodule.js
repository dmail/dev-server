System.register([],(function(e,t){"use strict";var n,r,o,u,i,s,a,c,f,l,p,d,y,h,m,_,b,v,E,S,w,T,g;function R(){throw new Error("setTimeout has not been defined")}function C(){throw new Error("clearTimeout has not been defined")}function k(e){if(o===setTimeout)return setTimeout(e,0);if((o===R||!o)&&setTimeout)return o=setTimeout,setTimeout(e,0);try{return o(e,0)}catch(t){try{return o.call(null,e,0)}catch(t){return o.call(this,e,0)}}}function H(){a&&i&&(a=!1,i.length?s=i.concat(s):c=-1,s.length&&N())}function N(){if(!a){var e=k(H);a=!0;for(var t=s.length;t;){for(i=s,s=[];++c<t;)i&&i[c].run();c=-1,t=s.length}i=null,a=!1,function(e){if(u===clearTimeout)return clearTimeout(e);if((u===C||!u)&&clearTimeout)return u=clearTimeout,clearTimeout(e);try{return u(e)}catch(t){try{return u.call(null,e)}catch(t){return u.call(this,e)}}}(e)}}function A(e,t){this.fun=e,this.array=t}function O(){}return{setters:[],execute:function(){n={exports:{}},r="undefined"!=typeof globalThis?globalThis:"undefined"!=typeof self?self:"undefined"!=typeof window?window:{},o=R,u=C,"function"==typeof r.setTimeout&&(o=setTimeout),"function"==typeof r.clearTimeout&&(u=clearTimeout),s=[],a=!1,c=-1,A.prototype.run=function(){this.fun.apply(null,this.array)},f=O,l=O,p=O,d=O,y=O,h=O,m=O,_=r.performance||{},b=_.now||_.mozNow||_.msNow||_.oNow||_.webkitNow||function(){return(new Date).getTime()},v=new Date,w={nextTick:function(e){var t=new Array(arguments.length-1);if(arguments.length>1)for(var n=1;n<arguments.length;n++)t[n-1]=arguments[n];s.push(new A(e,t)),1!==s.length||a||k(N)},title:"browser",browser:!0,env:{},argv:[],version:"",versions:{},on:f,addListener:l,once:p,off:d,removeListener:y,removeAllListeners:h,emit:m,binding:function(e){throw new Error("process.binding is not supported")},cwd:function(){return"/"},chdir:function(e){throw new Error("process.chdir is not supported")},umask:function(){return 0},hrtime:function(e){var t=.001*b.call(_),n=Math.floor(t),r=Math.floor(t%1*1e9);return e&&(n-=e[0],(r-=e[1])<0&&(n--,r+=1e9)),[n,r]},platform:"browser",release:{},config:{},uptime:function(){return(new Date-v)/1e3}},T={},S||(S=1,n.exports=function(){if(E)return T;E=1;var e=Symbol.for("react.transitional.element"),t=Symbol.for("react.portal"),n=Symbol.for("react.fragment"),r=Symbol.for("react.strict_mode"),o=Symbol.for("react.profiler"),u=Symbol.for("react.consumer"),i=Symbol.for("react.context"),s=Symbol.for("react.forward_ref"),a=Symbol.for("react.suspense"),c=Symbol.for("react.memo"),f=Symbol.for("react.lazy"),l=Symbol.iterator,p={isMounted:function(){return!1},enqueueForceUpdate:function(){},enqueueReplaceState:function(){},enqueueSetState:function(){}},d=Object.assign,y={};function h(e,t,n){this.props=e,this.context=t,this.refs=y,this.updater=n||p}function m(){}function _(e,t,n){this.props=e,this.context=t,this.refs=y,this.updater=n||p}h.prototype.isReactComponent={},h.prototype.setState=function(e,t){if("object"!=typeof e&&"function"!=typeof e&&null!=e)throw Error("takes an object of state variables to update or a function which returns an object of state variables.");this.updater.enqueueSetState(this,e,t,"setState")},h.prototype.forceUpdate=function(e){this.updater.enqueueForceUpdate(this,e,"forceUpdate")},m.prototype=h.prototype;var b=_.prototype=new m;b.constructor=_,d(b,h.prototype),b.isPureReactComponent=!0;var v=Array.isArray,S={H:null,A:null,T:null,S:null},g=Object.prototype.hasOwnProperty;function R(t,n,r,o,u,i){return r=i.ref,{$$typeof:e,type:t,key:n,ref:void 0!==r?r:null,props:i}}function C(t){return"object"==typeof t&&null!==t&&t.$$typeof===e}var k=/\/+/g;function H(e,t){return"object"==typeof e&&null!==e&&null!=e.key?(n=""+e.key,r={"=":"=0",":":"=2"},"$"+n.replace(/[=:]/g,(function(e){return r[e]}))):t.toString(36);var n,r}function N(){}function A(n,r,o,u,i){var s=typeof n;"undefined"!==s&&"boolean"!==s||(n=null);var a,c,p=!1;if(null===n)p=!0;else switch(s){case"bigint":case"string":case"number":p=!0;break;case"object":switch(n.$$typeof){case e:case t:p=!0;break;case f:return A((p=n._init)(n._payload),r,o,u,i)}}if(p)return i=i(n),p=""===u?"."+H(n,0):u,v(i)?(o="",null!=p&&(o=p.replace(k,"$&/")+"/"),A(i,r,o,"",(function(e){return e}))):null!=i&&(C(i)&&(a=i,c=o+(null==i.key||n&&n.key===i.key?"":(""+i.key).replace(k,"$&/")+"/")+p,i=R(a.type,c,void 0,0,0,a.props)),r.push(i)),1;p=0;var d,y=""===u?".":u+":";if(v(n))for(var h=0;h<n.length;h++)p+=A(u=n[h],r,o,s=y+H(u,h),i);else if("function"==typeof(h=null===(d=n)||"object"!=typeof d?null:"function"==typeof(d=l&&d[l]||d["@@iterator"])?d:null))for(n=h.call(n),h=0;!(u=n.next()).done;)p+=A(u=u.value,r,o,s=y+H(u,h++),i);else if("object"===s){if("function"==typeof n.then)return A(function(e){switch(e.status){case"fulfilled":return e.value;case"rejected":throw e.reason;default:switch("string"==typeof e.status?e.then(N,N):(e.status="pending",e.then((function(t){"pending"===e.status&&(e.status="fulfilled",e.value=t)}),(function(t){"pending"===e.status&&(e.status="rejected",e.reason=t)}))),e.status){case"fulfilled":return e.value;case"rejected":throw e.reason}}throw e}(n),r,o,u,i);throw r=String(n),Error("Objects are not valid as a React child (found: "+("[object Object]"===r?"object with keys {"+Object.keys(n).join(", ")+"}":r)+"). If you meant to render a collection of children, use an array instead.")}return p}function O(e,t,n){if(null==e)return e;var r=[],o=0;return A(e,r,"","",(function(e){return t.call(n,e,o++)})),r}function j(e){if(-1===e._status){var t=e._result;(t=t()).then((function(t){0!==e._status&&-1!==e._status||(e._status=1,e._result=t)}),(function(t){0!==e._status&&-1!==e._status||(e._status=2,e._result=t)})),-1===e._status&&(e._status=0,e._result=t)}if(1===e._status)return e._result.default;throw e._result}var x="function"==typeof reportError?reportError:function(e){if("object"==typeof window&&"function"==typeof window.ErrorEvent){var t=new window.ErrorEvent("error",{bubbles:!0,cancelable:!0,message:"object"==typeof e&&null!==e&&"string"==typeof e.message?String(e.message):String(e),error:e});if(!window.dispatchEvent(t))return}else if("function"==typeof w.emit)return;console.error(e)};function I(){}return T.Children={map:O,forEach:function(e,t,n){O(e,(function(){t.apply(this,arguments)}),n)},count:function(e){var t=0;return O(e,(function(){t++})),t},toArray:function(e){return O(e,(function(e){return e}))||[]},only:function(e){if(!C(e))throw Error("React.Children.only expected to receive a single React element child.");return e}},T.Component=h,T.Fragment=n,T.Profiler=o,T.PureComponent=_,T.StrictMode=r,T.Suspense=a,T.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE=S,T.act=function(){throw Error("act(...) is not supported in production builds of React.")},T.cache=function(e){return function(){return e.apply(null,arguments)}},T.cloneElement=function(e,t,n){if(null==e)throw Error("The argument must be a React element, but you passed "+e+".");var r=d({},e.props),o=e.key;if(null!=t)for(u in t.ref,void 0!==t.key&&(o=""+t.key),t)!g.call(t,u)||"key"===u||"__self"===u||"__source"===u||"ref"===u&&void 0===t.ref||(r[u]=t[u]);var u=arguments.length-2;if(1===u)r.children=n;else if(1<u){for(var i=Array(u),s=0;s<u;s++)i[s]=arguments[s+2];r.children=i}return R(e.type,o,void 0,0,0,r)},T.createContext=function(e){return(e={$$typeof:i,_currentValue:e,_currentValue2:e,_threadCount:0,Provider:null,Consumer:null}).Provider=e,e.Consumer={$$typeof:u,_context:e},e},T.createElement=function(e,t,n){var r,o={},u=null;if(null!=t)for(r in void 0!==t.key&&(u=""+t.key),t)g.call(t,r)&&"key"!==r&&"__self"!==r&&"__source"!==r&&(o[r]=t[r]);var i=arguments.length-2;if(1===i)o.children=n;else if(1<i){for(var s=Array(i),a=0;a<i;a++)s[a]=arguments[a+2];o.children=s}if(e&&e.defaultProps)for(r in i=e.defaultProps)void 0===o[r]&&(o[r]=i[r]);return R(e,u,void 0,0,0,o)},T.createRef=function(){return{current:null}},T.forwardRef=function(e){return{$$typeof:s,render:e}},T.isValidElement=C,T.lazy=function(e){return{$$typeof:f,_payload:{_status:-1,_result:e},_init:j}},T.memo=function(e,t){return{$$typeof:c,type:e,compare:void 0===t?null:t}},T.startTransition=function(e){var t=S.T,n={};S.T=n;try{var r=e(),o=S.S;null!==o&&o(n,r),"object"==typeof r&&null!==r&&"function"==typeof r.then&&r.then(I,x)}catch(e){x(e)}finally{S.T=t}},T.unstable_useCacheRefresh=function(){return S.H.useCacheRefresh()},T.use=function(e){return S.H.use(e)},T.useActionState=function(e,t,n){return S.H.useActionState(e,t,n)},T.useCallback=function(e,t){return S.H.useCallback(e,t)},T.useContext=function(e){return S.H.useContext(e)},T.useDebugValue=function(){},T.useDeferredValue=function(e,t){return S.H.useDeferredValue(e,t)},T.useEffect=function(e,t){return S.H.useEffect(e,t)},T.useId=function(){return S.H.useId()},T.useImperativeHandle=function(e,t,n){return S.H.useImperativeHandle(e,t,n)},T.useInsertionEffect=function(e,t){return S.H.useInsertionEffect(e,t)},T.useLayoutEffect=function(e,t){return S.H.useLayoutEffect(e,t)},T.useMemo=function(e,t){return S.H.useMemo(e,t)},T.useOptimistic=function(e,t){return S.H.useOptimistic(e,t)},T.useReducer=function(e,t,n){return S.H.useReducer(e,t,n)},T.useRef=function(e){return S.H.useRef(e)},T.useState=function(e){return S.H.useState(e)},T.useSyncExternalStore=function(e,t,n){return S.H.useSyncExternalStore(e,t,n)},T.useTransition=function(){return S.H.useTransition()},T.version="19.0.0",T}()),g=n.exports,e("default",function(e){return e&&e.__esModule&&Object.prototype.hasOwnProperty.call(e,"default")?e.default:e}(g)),e("Children",g.Children),e("Component",g.Component),e("Fragment",g.Fragment),e("Profiler",g.Profiler),e("PureComponent",g.PureComponent),e("StrictMode",g.StrictMode),e("Suspense",g.Suspense),e("__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE",g.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE),e("act",g.act),e("cache",g.cache),e("cloneElement",g.cloneElement),e("createContext",g.createContext),e("createElement",g.createElement),e("createRef",g.createRef),e("forwardRef",g.forwardRef),e("isValidElement",g.isValidElement),e("lazy",g.lazy),e("memo",g.memo),e("startTransition",g.startTransition),e("unstable_useCacheRefresh",g.unstable_useCacheRefresh),e("use",g.use),e("useActionState",g.useActionState),e("useCallback",g.useCallback),e("useContext",g.useContext),e("useDebugValue",g.useDebugValue),e("useDeferredValue",g.useDeferredValue),e("useEffect",g.useEffect),e("useId",g.useId),e("useImperativeHandle",g.useImperativeHandle),e("useInsertionEffect",g.useInsertionEffect),e("useLayoutEffect",g.useLayoutEffect),e("useMemo",g.useMemo),e("useOptimistic",g.useOptimistic),e("useReducer",g.useReducer),e("useRef",g.useRef),e("useState",g.useState),e("useSyncExternalStore",g.useSyncExternalStore),e("useTransition",g.useTransition),e("version",g.version)}}}));