System.register([], function (_export, _context) {
  "use strict";

  var n, l, u, i, t, o, r, f, e, c, s, a, v;
  function h(n, l) {
    for (var u in l) n[u] = l[u];
    return n;
  }
  function p(n) {
    var l = n.parentNode;
    l && l.removeChild(n);
  }
  function y(l, u, i) {
    var t,
      o,
      r,
      f = {};
    for (r in u) "key" == r ? t = u[r] : "ref" == r ? o = u[r] : f[r] = u[r];
    if (arguments.length > 2 && (f.children = arguments.length > 3 ? n.call(arguments, 2) : i), "function" == typeof l && null != l.defaultProps) for (r in l.defaultProps) void 0 === f[r] && (f[r] = l.defaultProps[r]);
    return d(l, f, t, o, null);
  }
  function d(n, i, t, o, r) {
    var f = {
      type: n,
      props: i,
      key: t,
      ref: o,
      __k: null,
      __: null,
      __b: 0,
      __e: null,
      __d: void 0,
      __c: null,
      __h: null,
      constructor: void 0,
      __v: null == r ? ++u : r
    };
    return null == r && null != l.vnode && l.vnode(f), f;
  }
  function _() {
    return {
      current: null
    };
  }
  function k(n) {
    return n.children;
  }
  function b(n, l) {
    this.props = n, this.context = l;
  }
  function g(n, l) {
    if (null == l) return n.__ ? g(n.__, n.__.__k.indexOf(n) + 1) : null;
    for (var u; l < n.__k.length; l++) if (null != (u = n.__k[l]) && null != u.__e) return u.__e;
    return "function" == typeof n.type ? g(n) : null;
  }
  function m(n) {
    var l, u;
    if (null != (n = n.__) && null != n.__c) {
      for (n.__e = n.__c.base = null, l = 0; l < n.__k.length; l++) if (null != (u = n.__k[l]) && null != u.__e) {
        n.__e = n.__c.base = u.__e;
        break;
      }
      return m(n);
    }
  }
  function w(n) {
    (!n.__d && (n.__d = !0) && t.push(n) && !x.__r++ || o !== l.debounceRendering) && ((o = l.debounceRendering) || r)(x);
  }
  function x() {
    var n, l, u, i, o, r, e, c;
    for (t.sort(f); n = t.shift();) n.__d && (l = t.length, i = void 0, o = void 0, e = (r = (u = n).__v).__e, (c = u.__P) && (i = [], (o = h({}, r)).__v = r.__v + 1, L(c, r, o, u.__n, void 0 !== c.ownerSVGElement, null != r.__h ? [e] : null, i, null == e ? g(r) : e, r.__h), M(i, r), r.__e != e && m(r)), t.length > l && t.sort(f));
    x.__r = 0;
  }
  function P(n, l, u, i, t, o, r, f, e, a) {
    var h,
      p,
      y,
      _,
      b,
      m,
      w,
      x = i && i.__k || s,
      P = x.length;
    for (u.__k = [], h = 0; h < l.length; h++) if (null != (_ = u.__k[h] = null == (_ = l[h]) || "boolean" == typeof _ || "function" == typeof _ ? null : "string" == typeof _ || "number" == typeof _ || "bigint" == typeof _ ? d(null, _, null, null, _) : v(_) ? d(k, {
      children: _
    }, null, null, null) : _.__b > 0 ? d(_.type, _.props, _.key, _.ref ? _.ref : null, _.__v) : _)) {
      if (_.__ = u, _.__b = u.__b + 1, null === (y = x[h]) || y && _.key == y.key && _.type === y.type) x[h] = void 0;else for (p = 0; p < P; p++) {
        if ((y = x[p]) && _.key == y.key && _.type === y.type) {
          x[p] = void 0;
          break;
        }
        y = null;
      }
      L(n, _, y = y || c, t, o, r, f, e, a), b = _.__e, (p = _.ref) && y.ref != p && (w || (w = []), y.ref && w.push(y.ref, null, _), w.push(p, _.__c || b, _)), null != b ? (null == m && (m = b), "function" == typeof _.type && _.__k === y.__k ? _.__d = e = C(_, e, n) : e = $(n, _, y, x, b, e), "function" == typeof u.type && (u.__d = e)) : e && y.__e == e && e.parentNode != n && (e = g(y));
    }
    for (u.__e = m, h = P; h--;) null != x[h] && ("function" == typeof u.type && null != x[h].__e && x[h].__e == u.__d && (u.__d = A(i).nextSibling), q(x[h], x[h]));
    if (w) for (h = 0; h < w.length; h++) O(w[h], w[++h], w[++h]);
  }
  function C(n, l, u) {
    for (var i, t = n.__k, o = 0; t && o < t.length; o++) (i = t[o]) && (i.__ = n, l = "function" == typeof i.type ? C(i, l, u) : $(u, i, i, t, i.__e, l));
    return l;
  }
  function S(n, l) {
    return l = l || [], null == n || "boolean" == typeof n || (v(n) ? n.some(function (n) {
      S(n, l);
    }) : l.push(n)), l;
  }
  function $(n, l, u, i, t, o) {
    var r, f, e;
    if (void 0 !== l.__d) r = l.__d, l.__d = void 0;else if (null == u || t != o || null == t.parentNode) n: if (null == o || o.parentNode !== n) n.appendChild(t), r = null;else {
      for (f = o, e = 0; (f = f.nextSibling) && e < i.length; e += 1) if (f == t) break n;
      n.insertBefore(t, o), r = o;
    }
    return void 0 !== r ? r : t.nextSibling;
  }
  function A(n) {
    var l, u, i;
    if (null == n.type || "string" == typeof n.type) return n.__e;
    if (n.__k) for (l = n.__k.length - 1; l >= 0; l--) if ((u = n.__k[l]) && (i = A(u))) return i;
    return null;
  }
  function H(n, l, u, i, t) {
    var o;
    for (o in u) "children" === o || "key" === o || o in l || T(n, o, null, u[o], i);
    for (o in l) t && "function" != typeof l[o] || "children" === o || "key" === o || "value" === o || "checked" === o || u[o] === l[o] || T(n, o, l[o], u[o], i);
  }
  function I(n, l, u) {
    "-" === l[0] ? n.setProperty(l, null == u ? "" : u) : n[l] = null == u ? "" : "number" != typeof u || a.test(l) ? u : u + "px";
  }
  function T(n, l, u, i, t) {
    var o;
    n: if ("style" === l) {
      if ("string" == typeof u) n.style.cssText = u;else {
        if ("string" == typeof i && (n.style.cssText = i = ""), i) for (l in i) u && l in u || I(n.style, l, "");
        if (u) for (l in u) i && u[l] === i[l] || I(n.style, l, u[l]);
      }
    } else if ("o" === l[0] && "n" === l[1]) o = l !== (l = l.replace(/Capture$/, "")), l = l.toLowerCase() in n ? l.toLowerCase().slice(2) : l.slice(2), n.l || (n.l = {}), n.l[l + o] = u, u ? i || n.addEventListener(l, o ? z : j, o) : n.removeEventListener(l, o ? z : j, o);else if ("dangerouslySetInnerHTML" !== l) {
      if (t) l = l.replace(/xlink(H|:h)/, "h").replace(/sName$/, "s");else if ("width" !== l && "height" !== l && "href" !== l && "list" !== l && "form" !== l && "tabIndex" !== l && "download" !== l && "rowSpan" !== l && "colSpan" !== l && l in n) try {
        n[l] = null == u ? "" : u;
        break n;
      } catch (n) {}
      "function" == typeof u || (null == u || !1 === u && "-" !== l[4] ? n.removeAttribute(l) : n.setAttribute(l, u));
    }
  }
  function j(n) {
    return this.l[n.type + !1](l.event ? l.event(n) : n);
  }
  function z(n) {
    return this.l[n.type + !0](l.event ? l.event(n) : n);
  }
  function L(n, u, i, t, o, r, f, e, c) {
    var s,
      a,
      p,
      y,
      d,
      _,
      g,
      m,
      w,
      x,
      C,
      S,
      $,
      A,
      H,
      I = u.type;
    if (void 0 !== u.constructor) return null;
    null != i.__h && (c = i.__h, e = u.__e = i.__e, u.__h = null, r = [e]), (s = l.__b) && s(u);
    try {
      n: if ("function" == typeof I) {
        if (m = u.props, w = (s = I.contextType) && t[s.__c], x = s ? w ? w.props.value : s.__ : t, i.__c ? g = (a = u.__c = i.__c).__ = a.__E : ("prototype" in I && I.prototype.render ? u.__c = a = new I(m, x) : (u.__c = a = new b(m, x), a.constructor = I, a.render = B), w && w.sub(a), a.props = m, a.state || (a.state = {}), a.context = x, a.__n = t, p = a.__d = !0, a.__h = [], a._sb = []), null == a.__s && (a.__s = a.state), null != I.getDerivedStateFromProps && (a.__s == a.state && (a.__s = h({}, a.__s)), h(a.__s, I.getDerivedStateFromProps(m, a.__s))), y = a.props, d = a.state, a.__v = u, p) null == I.getDerivedStateFromProps && null != a.componentWillMount && a.componentWillMount(), null != a.componentDidMount && a.__h.push(a.componentDidMount);else {
          if (null == I.getDerivedStateFromProps && m !== y && null != a.componentWillReceiveProps && a.componentWillReceiveProps(m, x), !a.__e && null != a.shouldComponentUpdate && !1 === a.shouldComponentUpdate(m, a.__s, x) || u.__v === i.__v) {
            for (u.__v !== i.__v && (a.props = m, a.state = a.__s, a.__d = !1), a.__e = !1, u.__e = i.__e, u.__k = i.__k, u.__k.forEach(function (n) {
              n && (n.__ = u);
            }), C = 0; C < a._sb.length; C++) a.__h.push(a._sb[C]);
            a._sb = [], a.__h.length && f.push(a);
            break n;
          }
          null != a.componentWillUpdate && a.componentWillUpdate(m, a.__s, x), null != a.componentDidUpdate && a.__h.push(function () {
            a.componentDidUpdate(y, d, _);
          });
        }
        if (a.context = x, a.props = m, a.__P = n, S = l.__r, $ = 0, "prototype" in I && I.prototype.render) {
          for (a.state = a.__s, a.__d = !1, S && S(u), s = a.render(a.props, a.state, a.context), A = 0; A < a._sb.length; A++) a.__h.push(a._sb[A]);
          a._sb = [];
        } else do {
          a.__d = !1, S && S(u), s = a.render(a.props, a.state, a.context), a.state = a.__s;
        } while (a.__d && ++$ < 25);
        a.state = a.__s, null != a.getChildContext && (t = h(h({}, t), a.getChildContext())), p || null == a.getSnapshotBeforeUpdate || (_ = a.getSnapshotBeforeUpdate(y, d)), P(n, v(H = null != s && s.type === k && null == s.key ? s.props.children : s) ? H : [H], u, i, t, o, r, f, e, c), a.base = u.__e, u.__h = null, a.__h.length && f.push(a), g && (a.__E = a.__ = null), a.__e = !1;
      } else null == r && u.__v === i.__v ? (u.__k = i.__k, u.__e = i.__e) : u.__e = N(i.__e, u, i, t, o, r, f, c);
      (s = l.diffed) && s(u);
    } catch (n) {
      u.__v = null, (c || null != r) && (u.__e = e, u.__h = !!c, r[r.indexOf(e)] = null), l.__e(n, u, i);
    }
  }
  function M(n, u) {
    l.__c && l.__c(u, n), n.some(function (u) {
      try {
        n = u.__h, u.__h = [], n.some(function (n) {
          n.call(u);
        });
      } catch (n) {
        l.__e(n, u.__v);
      }
    });
  }
  function N(l, u, i, t, o, r, f, e) {
    var s,
      a,
      h,
      y = i.props,
      d = u.props,
      _ = u.type,
      k = 0;
    if ("svg" === _ && (o = !0), null != r) for (; k < r.length; k++) if ((s = r[k]) && "setAttribute" in s == !!_ && (_ ? s.localName === _ : 3 === s.nodeType)) {
      l = s, r[k] = null;
      break;
    }
    if (null == l) {
      if (null === _) return document.createTextNode(d);
      l = o ? document.createElementNS("http://www.w3.org/2000/svg", _) : document.createElement(_, d.is && d), r = null, e = !1;
    }
    if (null === _) y === d || e && l.data === d || (l.data = d);else {
      if (r = r && n.call(l.childNodes), a = (y = i.props || c).dangerouslySetInnerHTML, h = d.dangerouslySetInnerHTML, !e) {
        if (null != r) for (y = {}, k = 0; k < l.attributes.length; k++) y[l.attributes[k].name] = l.attributes[k].value;
        (h || a) && (h && (a && h.__html == a.__html || h.__html === l.innerHTML) || (l.innerHTML = h && h.__html || ""));
      }
      if (H(l, d, y, o, e), h) u.__k = [];else if (P(l, v(k = u.props.children) ? k : [k], u, i, t, o && "foreignObject" !== _, r, f, r ? r[0] : i.__k && g(i, 0), e), null != r) for (k = r.length; k--;) null != r[k] && p(r[k]);
      e || ("value" in d && void 0 !== (k = d.value) && (k !== l.value || "progress" === _ && !k || "option" === _ && k !== y.value) && T(l, "value", k, y.value, !1), "checked" in d && void 0 !== (k = d.checked) && k !== l.checked && T(l, "checked", k, y.checked, !1));
    }
    return l;
  }
  function O(n, u, i) {
    try {
      "function" == typeof n ? n(u) : n.current = u;
    } catch (n) {
      l.__e(n, i);
    }
  }
  function q(n, u, i) {
    var t, o;
    if (l.unmount && l.unmount(n), (t = n.ref) && (t.current && t.current !== n.__e || O(t, null, u)), null != (t = n.__c)) {
      if (t.componentWillUnmount) try {
        t.componentWillUnmount();
      } catch (n) {
        l.__e(n, u);
      }
      t.base = t.__P = null, n.__c = void 0;
    }
    if (t = n.__k) for (o = 0; o < t.length; o++) t[o] && q(t[o], u, i || "function" != typeof n.type);
    i || null == n.__e || p(n.__e), n.__ = n.__e = n.__d = void 0;
  }
  function B(n, l, u) {
    return this.constructor(n, u);
  }
  function D(u, i, t) {
    var o, r, f;
    l.__ && l.__(u, i), r = (o = "function" == typeof t) ? null : t && t.__k || i.__k, f = [], L(i, u = (!o && t || i).__k = y(k, null, [u]), r || c, c, void 0 !== i.ownerSVGElement, !o && t ? [t] : r ? null : i.firstChild ? n.call(i.childNodes) : null, f, !o && t ? t : r ? r.__e : i.firstChild, o), M(f, u);
  }
  function E(n, l) {
    D(n, l, E);
  }
  function F(l, u, i) {
    var t,
      o,
      r,
      f,
      e = h({}, l.props);
    for (r in l.type && l.type.defaultProps && (f = l.type.defaultProps), u) "key" == r ? t = u[r] : "ref" == r ? o = u[r] : e[r] = void 0 === u[r] && void 0 !== f ? f[r] : u[r];
    return arguments.length > 2 && (e.children = arguments.length > 3 ? n.call(arguments, 2) : i), d(l.type, e, t || l.key, o || l.ref, null);
  }
  function G(n, l) {
    var u = {
      __c: l = "__cC" + e++,
      __: n,
      Consumer: function Consumer(n, l) {
        return n.children(l);
      },
      Provider: function Provider(n) {
        var u, i;
        return this.getChildContext || (u = [], (i = {})[l] = this, this.getChildContext = function () {
          return i;
        }, this.shouldComponentUpdate = function (n) {
          this.props.value !== n.value && u.some(function (n) {
            n.__e = !0, w(n);
          });
        }, this.sub = function (n) {
          u.push(n);
          var l = n.componentWillUnmount;
          n.componentWillUnmount = function () {
            u.splice(u.indexOf(n), 1), l && l.call(n);
          };
        }), n.children;
      }
    };
    return u.Provider.__ = u.Consumer.contextType = u;
  }
  _export({
    Component: b,
    Fragment: k,
    cloneElement: F,
    createContext: G,
    createElement: y,
    createRef: _,
    h: y,
    hydrate: E,
    render: D,
    toChildArray: S,
    options: void 0,
    isValidElement: void 0
  });
  return {
    setters: [],
    execute: function () {
      c = {};
      s = [];
      a = /acit|ex(?:s|g|n|p|$)|rph|grid|ows|mnc|ntw|ine[ch]|zoo|^ord|itera/i;
      v = Array.isArray;
      n = s.slice, _export("options", l = {
        __e: function __e(n, l, u, i) {
          for (var t, o, r; l = l.__;) if ((t = l.__c) && !t.__) try {
            if ((o = t.constructor) && null != o.getDerivedStateFromError && (t.setState(o.getDerivedStateFromError(n)), r = t.__d), null != t.componentDidCatch && (t.componentDidCatch(n, i || {}), r = t.__d), r) return t.__E = t;
          } catch (l) {
            n = l;
          }
          throw n;
        }
      }), u = 0, _export("isValidElement", i = function i(n) {
        return null != n && void 0 === n.constructor;
      }), b.prototype.setState = function (n, l) {
        var u;
        u = null != this.__s && this.__s !== this.state ? this.__s : this.__s = h({}, this.state), "function" == typeof n && (n = n(h({}, u), this.props)), n && h(u, n), null != n && this.__v && (l && this._sb.push(l), w(this));
      }, b.prototype.forceUpdate = function (n) {
        this.__v && (this.__e = !0, n && this.__h.push(n), w(this));
      }, b.prototype.render = k, t = [], r = "function" == typeof Promise ? Promise.prototype.then.bind(Promise.resolve()) : setTimeout, f = function f(n, l) {
        return n.__v.__b - l.__v.__b;
      }, x.__r = 0, e = 0;
    }
  };
});