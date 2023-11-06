System.register([], function (_export, _context) {
  "use strict";

  var n, l, u, t, i, o, r, f, e, c, s, a, v;
  function h(n, l) {
    for (var u in l) n[u] = l[u];
    return n;
  }
  function p(n) {
    var l = n.parentNode;
    l && l.removeChild(n);
  }
  function y(l, u, t) {
    var i,
      o,
      r,
      f = {};
    for (r in u) "key" == r ? i = u[r] : "ref" == r ? o = u[r] : f[r] = u[r];
    if (arguments.length > 2 && (f.children = arguments.length > 3 ? n.call(arguments, 2) : t), "function" == typeof l && null != l.defaultProps) for (r in l.defaultProps) void 0 === f[r] && (f[r] = l.defaultProps[r]);
    return d(l, f, i, o, null);
  }
  function d(n, t, i, o, r) {
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
      __h: null,
      constructor: void 0,
      __v: null == r ? ++u : r,
      __i: -1
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
  function m(n, l) {
    this.props = n, this.context = l;
  }
  function b(n, l) {
    if (null == l) return n.__ ? b(n.__, n.__i + 1) : null;
    for (var u; l < n.__k.length; l++) if (null != (u = n.__k[l]) && null != u.__e) return u.__e;
    return "function" == typeof n.type ? b(n) : null;
  }
  function g(n) {
    var l, u;
    if (null != (n = n.__) && null != n.__c) {
      for (n.__e = n.__c.base = null, l = 0; l < n.__k.length; l++) if (null != (u = n.__k[l]) && null != u.__e) {
        n.__e = n.__c.base = u.__e;
        break;
      }
      return g(n);
    }
  }
  function w(n) {
    (!n.__d && (n.__d = !0) && i.push(n) && !x.__r++ || o !== l.debounceRendering) && ((o = l.debounceRendering) || r)(x);
  }
  function x() {
    var n, l, u, t, o, r, e, c, s;
    for (i.sort(f); n = i.shift();) n.__d && (l = i.length, t = void 0, o = void 0, r = void 0, c = (e = (u = n).__v).__e, (s = u.__P) && (t = [], o = [], (r = h({}, e)).__v = e.__v + 1, z(s, r, e, u.__n, void 0 !== s.ownerSVGElement, null != e.__h ? [c] : null, t, null == c ? b(e) : c, e.__h, o), r.__.__k[r.__i] = r, L(t, r, o), r.__e != c && g(r)), i.length > l && i.sort(f));
    x.__r = 0;
  }
  function C(n, l, u, t, i, o, r, f, e, a, h) {
    var p,
      y,
      _,
      m,
      g,
      w,
      x,
      C,
      $,
      D = 0,
      H = t && t.__k || s,
      I = H.length,
      T = I,
      j = l.length;
    for (u.__k = [], p = 0; p < j; p++) null != (m = u.__k[p] = null == (m = l[p]) || "boolean" == typeof m || "function" == typeof m ? null : m.constructor == String || "number" == typeof m || "bigint" == typeof m ? d(null, m, null, null, m) : v(m) ? d(k, {
      children: m
    }, null, null, null) : m.__b > 0 ? d(m.type, m.props, m.key, m.ref ? m.ref : null, m.__v) : m) ? (m.__ = u, m.__b = u.__b + 1, m.__i = p, -1 === (C = A(m, H, x = p + D, T)) ? _ = c : (_ = H[C] || c, H[C] = void 0, T--), z(n, m, _, i, o, r, f, e, a, h), g = m.__e, (y = m.ref) && _.ref != y && (_.ref && N(_.ref, null, m), h.push(y, m.__c || g, m)), null == w && null != g && (w = g), ($ = _ === c || null === _.__v) ? -1 == C && D-- : C !== x && (C === x + 1 ? D++ : C > x ? T > j - x ? D += C - x : D-- : D = C < x && C == x - 1 ? C - x : 0), x = p + D, "function" == typeof m.type ? (C !== x || _.__k === m.__k ? e = P(m, e, n) : void 0 !== m.__d ? e = m.__d : g && (e = g.nextSibling), m.__d = void 0) : g && (e = C !== x || $ ? S(n, g, e) : g.nextSibling), "function" == typeof u.type && (u.__d = e)) : (_ = H[p]) && null == _.key && _.__e && (_.__e == e && (e = b(_), "function" == typeof u.type && (u.__d = e)), O(_, _, !1), H[p] = null);
    for (u.__e = w, p = I; p--;) null != H[p] && ("function" == typeof u.type && null != H[p].__e && H[p].__e == e && (u.__d = H[p].__e.nextSibling), O(H[p], H[p]));
  }
  function P(n, l, u) {
    for (var t, i = n.__k, o = 0; i && o < i.length; o++) (t = i[o]) && (t.__ = n, l = "function" == typeof t.type ? P(t, l, u) : S(u, t.__e, l));
    return l;
  }
  function $(n, l) {
    return l = l || [], null == n || "boolean" == typeof n || (v(n) ? n.some(function (n) {
      $(n, l);
    }) : l.push(n)), l;
  }
  function S(n, l, u) {
    return l != u && n.insertBefore(l, u || null), l.nextSibling;
  }
  function A(n, l, u, t) {
    var i = n.key,
      o = n.type,
      r = u - 1,
      f = u + 1,
      e = l[u];
    if (null === e || e && i == e.key && o === e.type) return u;
    if (t > (null != e ? 1 : 0)) for (; r >= 0 || f < l.length;) {
      if (r >= 0) {
        if ((e = l[r]) && i == e.key && o === e.type) return r;
        r--;
      }
      if (f < l.length) {
        if ((e = l[f]) && i == e.key && o === e.type) return f;
        f++;
      }
    }
    return -1;
  }
  function D(n, l, u, t, i) {
    var o;
    for (o in u) "children" === o || "key" === o || o in l || I(n, o, null, u[o], t);
    for (o in l) i && "function" != typeof l[o] || "children" === o || "key" === o || "value" === o || "checked" === o || u[o] === l[o] || I(n, o, l[o], u[o], t);
  }
  function H(n, l, u) {
    "-" === l[0] ? n.setProperty(l, null == u ? "" : u) : n[l] = null == u ? "" : "number" != typeof u || a.test(l) ? u : u + "px";
  }
  function I(n, l, u, t, i) {
    var o;
    n: if ("style" === l) {
      if ("string" == typeof u) n.style.cssText = u;else {
        if ("string" == typeof t && (n.style.cssText = t = ""), t) for (l in t) u && l in u || H(n.style, l, "");
        if (u) for (l in u) t && u[l] === t[l] || H(n.style, l, u[l]);
      }
    } else if ("o" === l[0] && "n" === l[1]) o = l !== (l = l.replace(/(PointerCapture)$|Capture$/, "$1")), l = l.toLowerCase() in n ? l.toLowerCase().slice(2) : l.slice(2), n.l || (n.l = {}), n.l[l + o] = u, u ? t ? u.u = t.u : (u.u = Date.now(), n.addEventListener(l, o ? j : T, o)) : n.removeEventListener(l, o ? j : T, o);else if ("dangerouslySetInnerHTML" !== l) {
      if (i) l = l.replace(/xlink(H|:h)/, "h").replace(/sName$/, "s");else if ("width" !== l && "height" !== l && "href" !== l && "list" !== l && "form" !== l && "tabIndex" !== l && "download" !== l && "rowSpan" !== l && "colSpan" !== l && "role" !== l && l in n) try {
        n[l] = null == u ? "" : u;
        break n;
      } catch (n) {}
      "function" == typeof u || (null == u || !1 === u && "-" !== l[4] ? n.removeAttribute(l) : n.setAttribute(l, u));
    }
  }
  function T(n) {
    var u = this.l[n.type + !1];
    if (n.t) {
      if (n.t <= u.u) return;
    } else n.t = Date.now();
    return u(l.event ? l.event(n) : n);
  }
  function j(n) {
    return this.l[n.type + !0](l.event ? l.event(n) : n);
  }
  function z(n, u, t, i, o, r, f, e, c, s) {
    var a,
      p,
      y,
      d,
      _,
      b,
      g,
      w,
      x,
      P,
      $,
      S,
      A,
      D,
      H,
      I = u.type;
    if (void 0 !== u.constructor) return null;
    null != t.__h && (c = t.__h, e = u.__e = t.__e, u.__h = null, r = [e]), (a = l.__b) && a(u);
    n: if ("function" == typeof I) try {
      if (w = u.props, x = (a = I.contextType) && i[a.__c], P = a ? x ? x.props.value : a.__ : i, t.__c ? g = (p = u.__c = t.__c).__ = p.__E : ("prototype" in I && I.prototype.render ? u.__c = p = new I(w, P) : (u.__c = p = new m(w, P), p.constructor = I, p.render = q), x && x.sub(p), p.props = w, p.state || (p.state = {}), p.context = P, p.__n = i, y = p.__d = !0, p.__h = [], p._sb = []), null == p.__s && (p.__s = p.state), null != I.getDerivedStateFromProps && (p.__s == p.state && (p.__s = h({}, p.__s)), h(p.__s, I.getDerivedStateFromProps(w, p.__s))), d = p.props, _ = p.state, p.__v = u, y) null == I.getDerivedStateFromProps && null != p.componentWillMount && p.componentWillMount(), null != p.componentDidMount && p.__h.push(p.componentDidMount);else {
        if (null == I.getDerivedStateFromProps && w !== d && null != p.componentWillReceiveProps && p.componentWillReceiveProps(w, P), !p.__e && (null != p.shouldComponentUpdate && !1 === p.shouldComponentUpdate(w, p.__s, P) || u.__v === t.__v)) {
          for (u.__v !== t.__v && (p.props = w, p.state = p.__s, p.__d = !1), u.__e = t.__e, u.__k = t.__k, u.__k.forEach(function (n) {
            n && (n.__ = u);
          }), $ = 0; $ < p._sb.length; $++) p.__h.push(p._sb[$]);
          p._sb = [], p.__h.length && f.push(p);
          break n;
        }
        null != p.componentWillUpdate && p.componentWillUpdate(w, p.__s, P), null != p.componentDidUpdate && p.__h.push(function () {
          p.componentDidUpdate(d, _, b);
        });
      }
      if (p.context = P, p.props = w, p.__P = n, p.__e = !1, S = l.__r, A = 0, "prototype" in I && I.prototype.render) {
        for (p.state = p.__s, p.__d = !1, S && S(u), a = p.render(p.props, p.state, p.context), D = 0; D < p._sb.length; D++) p.__h.push(p._sb[D]);
        p._sb = [];
      } else do {
        p.__d = !1, S && S(u), a = p.render(p.props, p.state, p.context), p.state = p.__s;
      } while (p.__d && ++A < 25);
      p.state = p.__s, null != p.getChildContext && (i = h(h({}, i), p.getChildContext())), y || null == p.getSnapshotBeforeUpdate || (b = p.getSnapshotBeforeUpdate(d, _)), C(n, v(H = null != a && a.type === k && null == a.key ? a.props.children : a) ? H : [H], u, t, i, o, r, f, e, c, s), p.base = u.__e, u.__h = null, p.__h.length && f.push(p), g && (p.__E = p.__ = null);
    } catch (n) {
      u.__v = null, c || null != r ? (u.__e = e, u.__h = !!c, r[r.indexOf(e)] = null) : (u.__e = t.__e, u.__k = t.__k), l.__e(n, u, t);
    } else null == r && u.__v === t.__v ? (u.__k = t.__k, u.__e = t.__e) : u.__e = M(t.__e, u, t, i, o, r, f, c, s);
    (a = l.diffed) && a(u);
  }
  function L(n, u, t) {
    u.__d = void 0;
    for (var i = 0; i < t.length; i++) N(t[i], t[++i], t[++i]);
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
  function M(l, u, t, i, o, r, f, e, s) {
    var a,
      h,
      y,
      d = t.props,
      _ = u.props,
      k = u.type,
      m = 0;
    if ("svg" === k && (o = !0), null != r) for (; m < r.length; m++) if ((a = r[m]) && "setAttribute" in a == !!k && (k ? a.localName === k : 3 === a.nodeType)) {
      l = a, r[m] = null;
      break;
    }
    if (null == l) {
      if (null === k) return document.createTextNode(_);
      l = o ? document.createElementNS("http://www.w3.org/2000/svg", k) : document.createElement(k, _.is && _), r = null, e = !1;
    }
    if (null === k) d === _ || e && l.data === _ || (l.data = _);else {
      if (r = r && n.call(l.childNodes), h = (d = t.props || c).dangerouslySetInnerHTML, y = _.dangerouslySetInnerHTML, !e) {
        if (null != r) for (d = {}, m = 0; m < l.attributes.length; m++) d[l.attributes[m].name] = l.attributes[m].value;
        (y || h) && (y && (h && y.__html == h.__html || y.__html === l.innerHTML) || (l.innerHTML = y && y.__html || ""));
      }
      if (D(l, _, d, o, e), y) u.__k = [];else if (C(l, v(m = u.props.children) ? m : [m], u, t, i, o && "foreignObject" !== k, r, f, r ? r[0] : t.__k && b(t, 0), e, s), null != r) for (m = r.length; m--;) null != r[m] && p(r[m]);
      e || ("value" in _ && void 0 !== (m = _.value) && (m !== l.value || "progress" === k && !m || "option" === k && m !== d.value) && I(l, "value", m, d.value, !1), "checked" in _ && void 0 !== (m = _.checked) && m !== l.checked && I(l, "checked", m, d.checked, !1));
    }
    return l;
  }
  function N(n, u, t) {
    try {
      "function" == typeof n ? n(u) : n.current = u;
    } catch (n) {
      l.__e(n, t);
    }
  }
  function O(n, u, t) {
    var i, o;
    if (l.unmount && l.unmount(n), (i = n.ref) && (i.current && i.current !== n.__e || N(i, null, u)), null != (i = n.__c)) {
      if (i.componentWillUnmount) try {
        i.componentWillUnmount();
      } catch (n) {
        l.__e(n, u);
      }
      i.base = i.__P = null, n.__c = void 0;
    }
    if (i = n.__k) for (o = 0; o < i.length; o++) i[o] && O(i[o], u, t || "function" != typeof n.type);
    t || null == n.__e || p(n.__e), n.__ = n.__e = n.__d = void 0;
  }
  function q(n, l, u) {
    return this.constructor(n, u);
  }
  function B(u, t, i) {
    var o, r, f, e;
    l.__ && l.__(u, t), r = (o = "function" == typeof i) ? null : i && i.__k || t.__k, f = [], e = [], z(t, u = (!o && i || t).__k = y(k, null, [u]), r || c, c, void 0 !== t.ownerSVGElement, !o && i ? [i] : r ? null : t.firstChild ? n.call(t.childNodes) : null, f, !o && i ? i : r ? r.__e : t.firstChild, o, e), L(f, u, e);
  }
  function E(n, l) {
    B(n, l, E);
  }
  function F(l, u, t) {
    var i,
      o,
      r,
      f,
      e = h({}, l.props);
    for (r in l.type && l.type.defaultProps && (f = l.type.defaultProps), u) "key" == r ? i = u[r] : "ref" == r ? o = u[r] : e[r] = void 0 === u[r] && void 0 !== f ? f[r] : u[r];
    return arguments.length > 2 && (e.children = arguments.length > 3 ? n.call(arguments, 2) : t), d(l.type, e, i || l.key, o || l.ref, null);
  }
  function G(n, l) {
    var u = {
      __c: l = "__cC" + e++,
      __: n,
      Consumer: function Consumer(n, l) {
        return n.children(l);
      },
      Provider: function Provider(n) {
        var u, t;
        return this.getChildContext || (u = [], (t = {})[l] = this, this.getChildContext = function () {
          return t;
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
    Component: m,
    Fragment: k,
    cloneElement: F,
    createContext: G,
    createElement: y,
    createRef: _,
    h: y,
    hydrate: E,
    render: B,
    toChildArray: $,
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
        __e: function __e(n, l, u, t) {
          for (var i, o, r; l = l.__;) if ((i = l.__c) && !i.__) try {
            if ((o = i.constructor) && null != o.getDerivedStateFromError && (i.setState(o.getDerivedStateFromError(n)), r = i.__d), null != i.componentDidCatch && (i.componentDidCatch(n, t || {}), r = i.__d), r) return i.__E = i;
          } catch (l) {
            n = l;
          }
          throw n;
        }
      }), u = 0, _export("isValidElement", t = function t(n) {
        return null != n && null == n.constructor;
      }), m.prototype.setState = function (n, l) {
        var u;
        u = null != this.__s && this.__s !== this.state ? this.__s : this.__s = h({}, this.state), "function" == typeof n && (n = n(h({}, u), this.props)), n && h(u, n), null != n && this.__v && (l && this._sb.push(l), w(this));
      }, m.prototype.forceUpdate = function (n) {
        this.__v && (this.__e = !0, n && this.__h.push(n), w(this));
      }, m.prototype.render = k, i = [], r = "function" == typeof Promise ? Promise.prototype.then.bind(Promise.resolve()) : setTimeout, f = function f(n, l) {
        return n.__v.__b - l.__v.__b;
      }, x.__r = 0, e = 0;
    }
  };
});