System.register([], function (_export, _context) {
  "use strict";

  var n, l, u, t, i, o, r, f, e, c, s, a, h, v, p, y;
  function d(n, l) {
    for (var u in l) n[u] = l[u];
    return n;
  }
  function w(n) {
    n && n.parentNode && n.parentNode.removeChild(n);
  }
  function _(l, u, t) {
    var i,
      o,
      r,
      f = {};
    for (r in u) "key" == r ? i = u[r] : "ref" == r ? o = u[r] : f[r] = u[r];
    if (arguments.length > 2 && (f.children = arguments.length > 3 ? n.call(arguments, 2) : t), "function" == typeof l && null != l.defaultProps) for (r in l.defaultProps) void 0 === f[r] && (f[r] = l.defaultProps[r]);
    return g(l, f, i, o, null);
  }
  function g(n, t, i, o, r) {
    var f = {
      type: n,
      props: t,
      key: i,
      ref: o,
      __k: null,
      __: null,
      __b: 0,
      __e: null,
      __d: void 0,
      __c: null,
      constructor: void 0,
      __v: null == r ? ++u : r,
      __i: -1,
      __u: 0
    };
    return null == r && null != l.vnode && l.vnode(f), f;
  }
  function m() {
    return {
      current: null
    };
  }
  function b(n) {
    return n.children;
  }
  function k(n, l) {
    this.props = n, this.context = l;
  }
  function x(n, l) {
    if (null == l) return n.__ ? x(n.__, n.__i + 1) : null;
    for (var u; l < n.__k.length; l++) if (null != (u = n.__k[l]) && null != u.__e) return u.__e;
    return "function" == typeof n.type ? x(n) : null;
  }
  function C(n) {
    var l, u;
    if (null != (n = n.__) && null != n.__c) {
      for (n.__e = n.__c.base = null, l = 0; l < n.__k.length; l++) if (null != (u = n.__k[l]) && null != u.__e) {
        n.__e = n.__c.base = u.__e;
        break;
      }
      return C(n);
    }
  }
  function S(n) {
    (!n.__d && (n.__d = !0) && i.push(n) && !M.__r++ || o !== l.debounceRendering) && ((o = l.debounceRendering) || r)(M);
  }
  function M() {
    var n, u, t, o, r, e, c, s;
    for (i.sort(f); n = i.shift();) n.__d && (u = i.length, o = void 0, e = (r = (t = n).__v).__e, c = [], s = [], t.__P && ((o = d({}, r)).__v = r.__v + 1, l.vnode && l.vnode(o), O(t.__P, o, r, t.__n, t.__P.namespaceURI, 32 & r.__u ? [e] : null, c, null == e ? x(r) : e, !!(32 & r.__u), s), o.__v = r.__v, o.__.__k[o.__i] = o, j(c, o, s), o.__e != e && C(o)), i.length > u && i.sort(f));
    M.__r = 0;
  }
  function P(n, l, u, t, i, o, r, f, e, c, s) {
    var a,
      p,
      y,
      d,
      w,
      _ = t && t.__k || v,
      g = l.length;
    for (u.__d = e, $(u, l, _), e = u.__d, a = 0; a < g; a++) null != (y = u.__k[a]) && (p = -1 === y.__i ? h : _[y.__i] || h, y.__i = a, O(n, y, p, i, o, r, f, e, c, s), d = y.__e, y.ref && p.ref != y.ref && (p.ref && E(p.ref, null, y), s.push(y.ref, y.__c || d, y)), null == w && null != d && (w = d), 65536 & y.__u || p.__k === y.__k ? e = I(y, e, n) : "function" == typeof y.type && void 0 !== y.__d ? e = y.__d : d && (e = d.nextSibling), y.__d = void 0, y.__u &= -196609);
    u.__d = e, u.__e = w;
  }
  function $(n, l, u) {
    var t,
      i,
      o,
      r,
      f,
      e = l.length,
      c = u.length,
      s = c,
      a = 0;
    for (n.__k = [], t = 0; t < e; t++) null != (i = l[t]) && "boolean" != typeof i && "function" != typeof i ? (r = t + a, (i = n.__k[t] = "string" == typeof i || "number" == typeof i || "bigint" == typeof i || i.constructor == String ? g(null, i, null, null, null) : y(i) ? g(b, {
      children: i
    }, null, null, null) : void 0 === i.constructor && i.__b > 0 ? g(i.type, i.props, i.key, i.ref ? i.ref : null, i.__v) : i).__ = n, i.__b = n.__b + 1, o = null, -1 !== (f = i.__i = L(i, u, r, s)) && (s--, (o = u[f]) && (o.__u |= 131072)), null == o || null === o.__v ? (-1 == f && a--, "function" != typeof i.type && (i.__u |= 65536)) : f !== r && (f == r - 1 ? a-- : f == r + 1 ? a++ : (f > r ? a-- : a++, i.__u |= 65536))) : i = n.__k[t] = null;
    if (s) for (t = 0; t < c; t++) null != (o = u[t]) && 0 == (131072 & o.__u) && (o.__e == n.__d && (n.__d = x(o)), N(o, o));
  }
  function I(n, l, u) {
    var t, i;
    if ("function" == typeof n.type) {
      for (t = n.__k, i = 0; t && i < t.length; i++) t[i] && (t[i].__ = n, l = I(t[i], l, u));
      return l;
    }
    n.__e != l && (l && n.type && !u.contains(l) && (l = x(n)), u.insertBefore(n.__e, l || null), l = n.__e);
    do {
      l = l && l.nextSibling;
    } while (null != l && 8 === l.nodeType);
    return l;
  }
  function H(n, l) {
    return l = l || [], null == n || "boolean" == typeof n || (y(n) ? n.some(function (n) {
      H(n, l);
    }) : l.push(n)), l;
  }
  function L(n, l, u, t) {
    var i = n.key,
      o = n.type,
      r = u - 1,
      f = u + 1,
      e = l[u];
    if (null === e || e && i == e.key && o === e.type && 0 == (131072 & e.__u)) return u;
    if (("function" != typeof o || o === b || i) && t > (null != e && 0 == (131072 & e.__u) ? 1 : 0)) for (; r >= 0 || f < l.length;) {
      if (r >= 0) {
        if ((e = l[r]) && 0 == (131072 & e.__u) && i == e.key && o === e.type) return r;
        r--;
      }
      if (f < l.length) {
        if ((e = l[f]) && 0 == (131072 & e.__u) && i == e.key && o === e.type) return f;
        f++;
      }
    }
    return -1;
  }
  function T(n, l, u) {
    "-" === l[0] ? n.setProperty(l, null == u ? "" : u) : n[l] = null == u ? "" : "number" != typeof u || p.test(l) ? u : u + "px";
  }
  function A(n, l, u, t, i) {
    var o;
    n: if ("style" === l) {
      if ("string" == typeof u) n.style.cssText = u;else {
        if ("string" == typeof t && (n.style.cssText = t = ""), t) for (l in t) u && l in u || T(n.style, l, "");
        if (u) for (l in u) t && u[l] === t[l] || T(n.style, l, u[l]);
      }
    } else if ("o" === l[0] && "n" === l[1]) o = l !== (l = l.replace(/(PointerCapture)$|Capture$/i, "$1")), l = l.toLowerCase() in n || "onFocusOut" === l || "onFocusIn" === l ? l.toLowerCase().slice(2) : l.slice(2), n.l || (n.l = {}), n.l[l + o] = u, u ? t ? u.u = t.u : (u.u = e, n.addEventListener(l, o ? s : c, o)) : n.removeEventListener(l, o ? s : c, o);else {
      if ("http://www.w3.org/2000/svg" == i) l = l.replace(/xlink(H|:h)/, "h").replace(/sName$/, "s");else if ("width" != l && "height" != l && "href" != l && "list" != l && "form" != l && "tabIndex" != l && "download" != l && "rowSpan" != l && "colSpan" != l && "role" != l && "popover" != l && l in n) try {
        n[l] = null == u ? "" : u;
        break n;
      } catch (n) {}
      "function" == typeof u || (null == u || !1 === u && "-" !== l[4] ? n.removeAttribute(l) : n.setAttribute(l, "popover" == l && 1 == u ? "" : u));
    }
  }
  function F(n) {
    return function (u) {
      if (this.l) {
        var t = this.l[u.type + n];
        if (null == u.t) u.t = e++;else if (u.t < t.u) return;
        return l.event && (u = l.event(u)), "handleEvent" in t ? t.handleEvent(u) : t(u);
      }
    };
  }
  function O(n, u, t, i, o, r, f, e, c, s) {
    var a,
      h,
      v,
      p,
      w,
      _,
      g,
      m,
      x,
      C,
      S,
      M,
      $,
      I,
      H,
      L,
      T = u.type;
    if (void 0 !== u.constructor) return null;
    128 & t.__u && (c = !!(32 & t.__u), r = [e = u.__e = t.__e]), (a = l.__b) && a(u);
    n: if ("function" == typeof T) try {
      if (m = u.props, x = "prototype" in T && T.prototype.render, C = (a = T.contextType) && i[a.__c], S = a ? C ? C.props.value : a.__ : i, t.__c ? g = (h = u.__c = t.__c).__ = h.__E : (x ? u.__c = h = new T(m, S) : (u.__c = h = new k(m, S), h.constructor = T, h.render = V), C && C.sub(h), h.props = m, h.state || (h.state = {}), h.context = S, h.__n = i, v = h.__d = !0, h.__h = [], h._sb = []), x && null == h.__s && (h.__s = h.state), x && null != T.getDerivedStateFromProps && (h.__s == h.state && (h.__s = d({}, h.__s)), d(h.__s, T.getDerivedStateFromProps(m, h.__s))), p = h.props, w = h.state, h.__v = u, v) x && null == T.getDerivedStateFromProps && null != h.componentWillMount && h.componentWillMount(), x && null != h.componentDidMount && h.__h.push(h.componentDidMount);else {
        if (x && null == T.getDerivedStateFromProps && m !== p && null != h.componentWillReceiveProps && h.componentWillReceiveProps(m, S), !h.__e && (null != h.shouldComponentUpdate && !1 === h.shouldComponentUpdate(m, h.__s, S) || u.__v === t.__v)) {
          for (u.__v !== t.__v && (h.props = m, h.state = h.__s, h.__d = !1), u.__e = t.__e, u.__k = t.__k, u.__k.some(function (n) {
            n && (n.__ = u);
          }), M = 0; M < h._sb.length; M++) h.__h.push(h._sb[M]);
          h._sb = [], h.__h.length && f.push(h);
          break n;
        }
        null != h.componentWillUpdate && h.componentWillUpdate(m, h.__s, S), x && null != h.componentDidUpdate && h.__h.push(function () {
          h.componentDidUpdate(p, w, _);
        });
      }
      if (h.context = S, h.props = m, h.__P = n, h.__e = !1, $ = l.__r, I = 0, x) {
        for (h.state = h.__s, h.__d = !1, $ && $(u), a = h.render(h.props, h.state, h.context), H = 0; H < h._sb.length; H++) h.__h.push(h._sb[H]);
        h._sb = [];
      } else do {
        h.__d = !1, $ && $(u), a = h.render(h.props, h.state, h.context), h.state = h.__s;
      } while (h.__d && ++I < 25);
      h.state = h.__s, null != h.getChildContext && (i = d(d({}, i), h.getChildContext())), x && !v && null != h.getSnapshotBeforeUpdate && (_ = h.getSnapshotBeforeUpdate(p, w)), P(n, y(L = null != a && a.type === b && null == a.key ? a.props.children : a) ? L : [L], u, t, i, o, r, f, e, c, s), h.base = u.__e, u.__u &= -161, h.__h.length && f.push(h), g && (h.__E = h.__ = null);
    } catch (n) {
      if (u.__v = null, c || null != r) {
        for (u.__u |= c ? 160 : 128; e && 8 === e.nodeType && e.nextSibling;) e = e.nextSibling;
        r[r.indexOf(e)] = null, u.__e = e;
      } else u.__e = t.__e, u.__k = t.__k;
      l.__e(n, u, t);
    } else null == r && u.__v === t.__v ? (u.__k = t.__k, u.__e = t.__e) : u.__e = z(t.__e, u, t, i, o, r, f, c, s);
    (a = l.diffed) && a(u);
  }
  function j(n, u, t) {
    u.__d = void 0;
    for (var i = 0; i < t.length; i++) E(t[i], t[++i], t[++i]);
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
  function z(u, t, i, o, r, f, e, c, s) {
    var a,
      v,
      p,
      d,
      _,
      g,
      m,
      b = i.props,
      k = t.props,
      C = t.type;
    if ("svg" === C ? r = "http://www.w3.org/2000/svg" : "math" === C ? r = "http://www.w3.org/1998/Math/MathML" : r || (r = "http://www.w3.org/1999/xhtml"), null != f) for (a = 0; a < f.length; a++) if ((_ = f[a]) && "setAttribute" in _ == !!C && (C ? _.localName === C : 3 === _.nodeType)) {
      u = _, f[a] = null;
      break;
    }
    if (null == u) {
      if (null === C) return document.createTextNode(k);
      u = document.createElementNS(r, C, k.is && k), c && (l.__m && l.__m(t, f), c = !1), f = null;
    }
    if (null === C) b === k || c && u.data === k || (u.data = k);else {
      if (f = f && n.call(u.childNodes), b = i.props || h, !c && null != f) for (b = {}, a = 0; a < u.attributes.length; a++) b[(_ = u.attributes[a]).name] = _.value;
      for (a in b) if (_ = b[a], "children" == a) ;else if ("dangerouslySetInnerHTML" == a) p = _;else if (!(a in k)) {
        if ("value" == a && "defaultValue" in k || "checked" == a && "defaultChecked" in k) continue;
        A(u, a, null, _, r);
      }
      for (a in k) _ = k[a], "children" == a ? d = _ : "dangerouslySetInnerHTML" == a ? v = _ : "value" == a ? g = _ : "checked" == a ? m = _ : c && "function" != typeof _ || b[a] === _ || A(u, a, _, b[a], r);
      if (v) c || p && (v.__html === p.__html || v.__html === u.innerHTML) || (u.innerHTML = v.__html), t.__k = [];else if (p && (u.innerHTML = ""), P(u, y(d) ? d : [d], t, i, o, "foreignObject" === C ? "http://www.w3.org/1999/xhtml" : r, f, e, f ? f[0] : i.__k && x(i, 0), c, s), null != f) for (a = f.length; a--;) w(f[a]);
      c || (a = "value", "progress" === C && null == g ? u.removeAttribute("value") : void 0 !== g && (g !== u[a] || "progress" === C && !g || "option" === C && g !== b[a]) && A(u, a, g, b[a], r), a = "checked", void 0 !== m && m !== u[a] && A(u, a, m, b[a], r));
    }
    return u;
  }
  function E(n, u, t) {
    try {
      if ("function" == typeof n) {
        var i = "function" == typeof n.__u;
        i && n.__u(), i && null == u || (n.__u = n(u));
      } else n.current = u;
    } catch (n) {
      l.__e(n, t);
    }
  }
  function N(n, u, t) {
    var i, o;
    if (l.unmount && l.unmount(n), (i = n.ref) && (i.current && i.current !== n.__e || E(i, null, u)), null != (i = n.__c)) {
      if (i.componentWillUnmount) try {
        i.componentWillUnmount();
      } catch (n) {
        l.__e(n, u);
      }
      i.base = i.__P = null;
    }
    if (i = n.__k) for (o = 0; o < i.length; o++) i[o] && N(i[o], u, t || "function" != typeof n.type);
    t || w(n.__e), n.__c = n.__ = n.__e = n.__d = void 0;
  }
  function V(n, l, u) {
    return this.constructor(n, u);
  }
  function q(u, t, i) {
    var o, r, f, e;
    l.__ && l.__(u, t), r = (o = "function" == typeof i) ? null : i && i.__k || t.__k, f = [], e = [], O(t, u = (!o && i || t).__k = _(b, null, [u]), r || h, h, t.namespaceURI, !o && i ? [i] : r ? null : t.firstChild ? n.call(t.childNodes) : null, f, !o && i ? i : r ? r.__e : t.firstChild, o, e), j(f, u, e);
  }
  function B(n, l) {
    q(n, l, B);
  }
  function D(l, u, t) {
    var i,
      o,
      r,
      f,
      e = d({}, l.props);
    for (r in l.type && l.type.defaultProps && (f = l.type.defaultProps), u) "key" == r ? i = u[r] : "ref" == r ? o = u[r] : e[r] = void 0 === u[r] && void 0 !== f ? f[r] : u[r];
    return arguments.length > 2 && (e.children = arguments.length > 3 ? n.call(arguments, 2) : t), g(l.type, e, i || l.key, o || l.ref, null);
  }
  function G(n, l) {
    var u = {
      __c: l = "__cC" + a++,
      __: n,
      Consumer: function (n, l) {
        return n.children(l);
      },
      Provider: function (n) {
        var u, t;
        return this.getChildContext || (u = new Set(), (t = {})[l] = this, this.getChildContext = function () {
          return t;
        }, this.componentWillUnmount = function () {
          u = null;
        }, this.shouldComponentUpdate = function (n) {
          this.props.value !== n.value && u.forEach(function (n) {
            n.__e = !0, S(n);
          });
        }, this.sub = function (n) {
          u.add(n);
          var l = n.componentWillUnmount;
          n.componentWillUnmount = function () {
            u && u.delete(n), l && l.call(n);
          };
        }), n.children;
      }
    };
    return u.Provider.__ = u.Consumer.contextType = u;
  }
  _export({
    Component: k,
    Fragment: b,
    cloneElement: D,
    createContext: G,
    createElement: _,
    createRef: m,
    h: _,
    hydrate: B,
    render: q,
    toChildArray: H,
    options: void 0,
    isValidElement: void 0
  });
  return {
    setters: [],
    execute: function () {
      h = {}, v = [], p = /acit|ex(?:s|g|n|p|$)|rph|grid|ows|mnc|ntw|ine[ch]|zoo|^ord|itera/i, y = Array.isArray;
      n = v.slice, _export("options", l = {
        __e: function (n, l, u, t) {
          for (var i, o, r; l = l.__;) if ((i = l.__c) && !i.__) try {
            if ((o = i.constructor) && null != o.getDerivedStateFromError && (i.setState(o.getDerivedStateFromError(n)), r = i.__d), null != i.componentDidCatch && (i.componentDidCatch(n, t || {}), r = i.__d), r) return i.__E = i;
          } catch (l) {
            n = l;
          }
          throw n;
        }
      }), u = 0, _export("isValidElement", t = function (n) {
        return null != n && null == n.constructor;
      }), k.prototype.setState = function (n, l) {
        var u;
        u = null != this.__s && this.__s !== this.state ? this.__s : this.__s = d({}, this.state), "function" == typeof n && (n = n(d({}, u), this.props)), n && d(u, n), null != n && this.__v && (l && this._sb.push(l), S(this));
      }, k.prototype.forceUpdate = function (n) {
        this.__v && (this.__e = !0, n && this.__h.push(n), S(this));
      }, k.prototype.render = b, i = [], r = "function" == typeof Promise ? Promise.prototype.then.bind(Promise.resolve()) : setTimeout, f = function (n, l) {
        return n.__v.__b - l.__v.__b;
      }, M.__r = 0, e = 0, c = F(!1), s = F(!0), a = 0;
    }
  };
});