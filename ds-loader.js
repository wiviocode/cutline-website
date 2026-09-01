// ds-loader.js — resolves the component namespace.
// Prefers the compiled _ds_bundle.js when present; otherwise fetches the .jsx sources and
// transpiles them with Babel (present on every card page). Usage:
//   const NS = await window.loadDS(['components/core/Button.jsx', ...], testFn)
// Paths are project-root-relative; pass window.__dsRoot (set by the card) as the prefix to root.
(function () {
  const cache = {};
  // jsx-runtime shim in case any transform still emits automatic-runtime calls
  window.__jsxRuntimeShim = {
    Fragment: (window.React || {}).Fragment,
    jsx: (type, props, key) => { const { children, ...rest } = props || {}; return window.React.createElement(type, key !== undefined ? { ...rest, key } : rest, children); },
    jsxs: (type, props, key) => { const { children, ...rest } = props || {}; return window.React.createElement(type, key !== undefined ? { ...rest, key } : rest, ...(Array.isArray(children) ? children : [children])); },
  };
  function tryBundle(root) {
    return new Promise((resolve) => {
      if (window.__dsBundleTried) return resolve();
      window.__dsBundleTried = true;
      const s = document.createElement('script');
      s.src = root + '_ds_bundle.js';
      s.onload = () => resolve();
      s.onerror = () => resolve();
      document.head.appendChild(s);
    });
  }
  function findNS(test) {
    for (const k of Object.keys(window).reverse()) {
      try { const v = window[k]; if (v && typeof v === 'object' && test(v)) return v; } catch (e) {}
    }
    return null;
  }
  async function loadModule(url) {
    if (cache[url]) return cache[url];
    const res = await fetch(url);
    if (!res.ok) throw new Error('fetch failed: ' + url);
    const src = await res.text();
    const deps = {};
    const re = /from\s+['"]([^'"]+)['"]/g;
    let m;
    const jobs = [];
    while ((m = re.exec(src))) {
      const spec = m[1];
      if (spec === 'react') continue;
      const depUrl = new URL(spec, url).href;
      jobs.push(loadModule(depUrl).then((mod) => { deps[spec] = mod; }));
    }
    await Promise.all(jobs);
    const out = Babel.transform(src, { presets: [['react', { runtime: 'classic' }]], plugins: [['transform-modules-commonjs']] }).code;
    const module = { exports: {} };
    const require = (spec) => {
      if (spec === 'react') return window.React;
      if (spec === 'react/jsx-runtime') return window.__jsxRuntimeShim;
      return deps[spec];
    };
    new Function('module', 'exports', 'require', out)(module, module.exports, require);
    cache[url] = module.exports;
    return module.exports;
  }
  window.loadDS = async function (paths, test) {
    const root = window.__dsRoot || './';
    await tryBundle(root);
    const fromBundle = test && findNS(test);
    if (fromBundle) return fromBundle;
    const ns = {};
    for (const p of paths) {
      const mod = await loadModule(new URL(root + p, location.href).href);
      Object.assign(ns, mod);
    }
    return ns;
  };
})();
