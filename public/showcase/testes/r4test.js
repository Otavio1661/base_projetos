/**
 * ============================================
 * r4test.js — mini framework de testes da libr4 (JavaScript puro, roda no NAVEGADOR)
 * ============================================
 * Sem Node, sem npm, sem terceiros. A página /vitrine/testes carrega este arquivo, as suítes
 * (suites/*.js) e a interface (runner-ui.js). Uso numa suíte:
 *
 *   const { suite, test, assert } = R4Test;
 *   suite('grid', () => {
 *     beforeEach(t => { ... });                      // opcional (também afterEach)
 *     test('ordena', async t => {
 *       const g = t.create({ xtype: 'grid', data: [...] });   // renderiza no t.box (contêiner limpo do teste)
 *       assert.eq(g.getView().length, 3);
 *     });
 *   });
 *
 * Cada teste recebe `t`: box, create(cfg), html(markup), sleep(ms), waitFor(fn), spy(fn), mockFetch(rotas),
 * cleanup(fn), skip(motivo), needLayout(), logs ({warn, error, take(tipo)}).
 * Isolamento: cada teste tem seu contêiner; ao fim, componentes criados são destruídos, fetch/console
 * restaurados, avisos/diálogos/notificações removidos. Erro num teste não derruba os outros.
 * console.error não consumido (t.logs.take('error')) e erros não tratados da página reprovam o teste.
 * ============================================
 */
(function (global) {
  'use strict';
  const T = global.R4Test = { suites: [], stage: null, current: null };
  let cur = null, asserts = 0;   // suíte em definição / asserções do teste em curso

  class AssertionError extends Error { constructor(m) { super(m); this.name = 'AssertionError'; } }
  class Skip extends Error { constructor(m) { super(m); this.name = 'Skip'; } }
  const fail = m => { throw new AssertionError(m); };
  const show = v => {
    try {
      if (v === undefined) return 'undefined';
      if (typeof v === 'number' && v !== v) return 'NaN';
      if (typeof v === 'function') return 'function ' + (v.name || '');
      if (v && v.nodeType === 1) return '<' + v.localName + (v.className && typeof v.className === 'string' ? ' class="' + v.className + '"' : '') + '>';
      const s = JSON.stringify(v);
      return s === undefined ? String(v) : s.length > 200 ? s.slice(0, 200) + '…' : s;
    } catch (e) { return String(v); }
  };
  const same = (a, b) => a === b || (a !== a && b !== b);
  const deep = (a, b, seen = []) => {
    if (same(a, b)) return true;
    if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) return false;
    if (seen.includes(a)) return true;
    seen.push(a);
    if (a instanceof Date || b instanceof Date) return a instanceof Date && b instanceof Date && +a === +b;
    const ka = Object.keys(a), kb = Object.keys(b);
    return ka.length === kb.length && ka.every(k => Object.prototype.hasOwnProperty.call(b, k) && deep(a[k], b[k], seen));
  };
  const msgOf = e => (e && e.message !== undefined ? e.message : String(e));
  const matches = (e, m) => m == null || (typeof m === 'string' ? msgOf(e).includes(m) : m instanceof RegExp ? m.test(msgOf(e)) : typeof m === 'function' ? (m.prototype instanceof Error || m === Error ? e instanceof m : !!m(e)) : false);
  const pre = m => (m ? m + ': ' : '');

  /* ---------- asserções (cada chamada conta 1) ---------- */
  const assert = T.assert = {
    ok(v, m) { asserts++; if (!v) fail(pre(m) + 'esperava valor verdadeiro, recebeu ' + show(v)); },
    notOk(v, m) { asserts++; if (v) fail(pre(m) + 'esperava valor falso, recebeu ' + show(v)); },
    eq(a, e, m) { asserts++; if (!same(a, e)) fail(pre(m) + 'esperado ' + show(e) + ', recebido ' + show(a)); },
    notEq(a, e, m) { asserts++; if (same(a, e)) fail(pre(m) + 'esperava valor diferente de ' + show(e)); },
    deepEq(a, e, m) { asserts++; if (!deep(a, e)) fail(pre(m) + 'esperado ' + show(e) + ', recebido ' + show(a)); },
    near(a, e, tol, m) { asserts++; if (!(Math.abs(a - e) <= (tol ?? 1e-6))) fail(pre(m) + 'esperado ~' + e + ' (±' + (tol ?? 1e-6) + '), recebido ' + show(a)); },
    gt(a, b, m) { asserts++; if (!(a > b)) fail(pre(m) + 'esperava ' + show(a) + ' > ' + show(b)); },
    lt(a, b, m) { asserts++; if (!(a < b)) fail(pre(m) + 'esperava ' + show(a) + ' < ' + show(b)); },
    match(s, re, m) { asserts++; if (!re.test(String(s))) fail(pre(m) + show(s) + ' não casa com ' + re); },
    contains(h, n, m) {
      asserts++;
      const s = h && h.nodeType ? h.textContent : h;
      if (s == null || !(typeof s === 'string' ? s.includes(n) : s.includes && s.includes(n))) fail(pre(m) + show(s) + ' não contém ' + show(n));
    },
    notContains(h, n, m) {
      asserts++;
      const s = h && h.nodeType ? h.textContent : h;
      if (s != null && s.includes && s.includes(n)) fail(pre(m) + show(s) + ' não deveria conter ' + show(n));
    },
    throws(fn, matcher, m) {
      asserts++;
      let err, threw = false;
      try { fn(); } catch (e) { threw = true; err = e; }
      if (!threw) fail(pre(m) + 'esperava uma exceção, nada foi lançado');
      if (!matches(err, matcher)) fail(pre(m) + 'exceção ' + show(msgOf(err)) + ' não casa com ' + show(matcher));
      return err;
    },
    async rejects(p, matcher, m) {
      asserts++;
      let err, threw = false;
      try { await (typeof p === 'function' ? p() : p); } catch (e) { threw = true; err = e; }
      if (!threw) fail(pre(m) + 'esperava rejeição, a promessa resolveu');
      if (!matches(err, matcher)) fail(pre(m) + 'rejeição ' + show(msgOf(err)) + ' não casa com ' + show(matcher));
      return err;
    }
  };

  /* ---------- espiões e fetch simulado ---------- */
  T.spy = (impl) => {
    const f = function (...a) { f.calls.push(a); f.count = f.calls.length; f.lastArgs = a; return impl ? impl.apply(this, a) : undefined; };
    f.calls = []; f.count = 0; f.lastArgs = null;
    f.reset = () => { f.calls.length = 0; f.count = 0; f.lastArgs = null; };
    return f;
  };
  const respond = spec => {
    spec = spec || {};
    const status = spec.status ?? 200, hdr = {};
    let text = spec.body == null ? '' : typeof spec.body === 'string' ? spec.body : JSON.stringify(spec.body);
    Object.keys(spec.headers || {}).forEach(k => { hdr[k.toLowerCase()] = spec.headers[k]; });
    if (spec.body != null && typeof spec.body !== 'string' && !hdr['content-type']) hdr['content-type'] = 'application/json';
    return { ok: status >= 200 && status < 300, status, statusText: spec.statusText || '', headers: { get: k => hdr[String(k).toLowerCase()] ?? null },
      text: async () => text, json: async () => JSON.parse(text), blob: async () => new Blob([text]), clone: () => respond(spec) };
  };
  /** mockFetch({ '/api/x': {status, body, headers, delay}, 'POST /api/y': req => resp, '/api/*': ... }, {passthrough}) */
  T.mockFetch = (routes, opts = {}) => {
    const real = global.fetch, calls = [];
    const find = (method, u) => {
      const keys = Object.keys(routes), cands = [method + ' ' + u.pathname + u.search, method + ' ' + u.pathname, u.pathname + u.search, u.pathname];
      for (const c of cands) if (Object.prototype.hasOwnProperty.call(routes, c)) return routes[c];
      const k = keys.find(x => x.endsWith('*') && (u.pathname).startsWith(x.replace(/^[A-Z]+ /, '').slice(0, -1)) && (!/^[A-Z]+ /.test(x) || x.startsWith(method + ' ')));
      return k ? routes[k] : undefined;
    };
    const mock = async (input, init = {}) => {
      const u = new URL(String(input), global.location.href), method = String(init.method || 'GET').toUpperCase();
      let json; try { json = typeof init.body === 'string' ? JSON.parse(init.body) : undefined; } catch (e) { /* corpo não-JSON */ }
      const req = { url: u, href: u.href, path: u.pathname, method, headers: init.headers || {}, body: init.body, json, init };
      calls.push(req);
      let r = find(method, u);
      if (r === undefined) {
        if (opts.passthrough) return real.call(global, input, init);
        throw new TypeError('mockFetch: rota não simulada: ' + method + ' ' + u.pathname + u.search);
      }
      if (typeof r === 'function') r = await r(req);
      if (r instanceof Error) throw r;
      if (r && r.delay) await new Promise(ok => setTimeout(ok, r.delay));
      return respond(r);
    };
    global.fetch = mock;
    mock.calls = calls; mock.restore = () => { if (global.fetch === mock) global.fetch = real; };
    mock.count = path => calls.filter(c => c.path === path).length;
    T._onMock && T._onMock(mock);
    return mock;
  };

  /* ---------- vazamento de ouvintes ---------- */
  /**
   * Conta os ouvintes que ficam em document/window depois de rodar `fn` (substitui add/removeEventListener durante a
   * chamada): tudo o que o componente adicionou lá fora precisa ter sido removido pelo destroy().
   * Ouvintes de elementos do próprio componente somem junto com o elemento.
   */
  T.leaks = async function (fn) {
    const ids = new WeakMap(), vivos = new Map(), alvos = [document, window];
    let seq = 0;
    const id = f => { if (!ids.has(f)) ids.set(f, ++seq); return ids.get(f); };
    const chave = (alvo, tipo, f, o) => (alvo === window ? 'w' : 'd') + '|' + tipo + '|' + (o === true || (o && o.capture) ? 'c' : 'b') + '|' + id(f);
    const proprios = alvos.map(a => ({ add: Object.prototype.hasOwnProperty.call(a, 'addEventListener'), rem: Object.prototype.hasOwnProperty.call(a, 'removeEventListener') }));
    const reais = alvos.map(a => [a.addEventListener, a.removeEventListener]);
    alvos.forEach((a, i) => {
      a.addEventListener = function (tipo, f, o) { if (typeof f === 'function' && !(o && o.once)) vivos.set(chave(this, tipo, f, o), tipo); return reais[i][0].apply(this, arguments); };
      a.removeEventListener = function (tipo, f, o) { if (typeof f === 'function') vivos.delete(chave(this, tipo, f, o)); return reais[i][1].apply(this, arguments); };
    });
    try { await fn(); }
    finally {
      alvos.forEach((a, i) => {
        proprios[i].add ? (a.addEventListener = reais[i][0]) : delete a.addEventListener;
        proprios[i].rem ? (a.removeEventListener = reais[i][1]) : delete a.removeEventListener;
      });
    }
    return [...vivos.values()];
  };

  T.clean = () => dirty();   // exposto para a suíte lenta limpar entre os exemplos

  /* ---------- registro ---------- */
  T.suite = (name, fn, opts = {}) => {
    const s = { name, slow: !!opts.slow, tests: [], before: [], after: [], file: opts.file || '' };
    T.suites.push(s);
    cur = s;
    try { fn(); } finally { cur = null; }
    return s;
  };
  T.test = (name, fn, opts = {}) => {
    if (!cur) throw new Error('R4Test.test fora de uma suite');
    cur.tests.push({ name, fn, timeout: opts.timeout || 5000, skip: !!opts.skip, known: opts.known || '' });
  };
  T.beforeEach = fn => { if (!cur) throw new Error('beforeEach fora de uma suite'); cur.before.push(fn); };
  T.afterEach = fn => { if (!cur) throw new Error('afterEach fora de uma suite'); cur.after.push(fn); };
  global.beforeEach = T.beforeEach; global.afterEach = T.afterEach;

  /* ---------- contexto de cada teste ---------- */
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const waitFor = async (fn, ms = 2000, what = 'condição') => {
    const t0 = Date.now();
    for (;;) {
      let v; try { v = await fn(); } catch (e) { v = false; }
      if (v) return v;
      if (Date.now() - t0 > ms) throw new AssertionError('tempo esgotado esperando ' + what + ' (' + ms + ' ms)');
      await sleep(15);
    }
  };
  function ctx(box, st) {
    const logs = { warn: [], error: [], take(k) { const a = this[k].slice(); this[k].length = 0; return a; }, clear() { this.warn.length = 0; this.error.length = 0; } };
    const t = {
      box, logs, assert, sleep, waitFor, spy: T.spy,
      create(cfg, type) { return R4.create(Object.assign({ renderTo: box }, cfg), type); },
      html(markup) { box.innerHTML = markup; R4.scan(box); return box; },
      mockFetch(routes, o) { return T.mockFetch(routes, o); },
      cleanup(fn) { st.cleanups.push(fn); },
      skip(why) { throw new Skip(why || 'pulado'); },
      /** Pula o teste quando o ambiente não tem layout (ex.: jsdom): precisa de medidas reais. */
      hasLayout() {
        const p = document.createElement('div'); p.style.cssText = 'width:123px;height:45px'; box.append(p);
        const ok = p.offsetWidth === 123 && p.offsetHeight === 45 && box.getBoundingClientRect().width > 0;
        p.remove();
        return ok;
      },
      needLayout() { if (!t.hasLayout()) throw new Skip('sem layout real neste ambiente (rode no navegador)'); }
    };
    return t;
  }
  const dirty = () => {
    try { R4.notify && R4.notify.closeAll && R4.notify.closeAll(); } catch (e) { /* */ }
    try { R4.tip && R4.tip.hide && R4.tip.hide(); } catch (e) { /* */ }
    document.querySelectorAll('.r4-grid-menu, iframe.r4-print-frame, .r4-mask, .r4-dd-menu, .r4-toast').forEach(n => n.remove());
    try { R4.unmask && R4.unmask(document.body); } catch (e) { /* */ }
    document.documentElement.classList.remove('r4-masked');
  };

  async function runTest(s, test, o) {
    const res = { suite: s.name, name: test.name, status: 'pass', ms: 0, asserts: 0, error: '', stack: '' };
    if (test.skip) { res.status = 'skip'; res.error = 'marcado como pulado'; return res; }
    const stage = T.stage, box = document.createElement('div');
    box.className = 'r4t-box'; stage.append(box);
    const st = { cleanups: [] }, t = ctx(box, st);
    const before = new Set(Object.keys(R4.instances));
    const real = { warn: console.warn, error: console.error }, fetchBefore = global.fetch;
    const uncaught = [];
    const onErr = ev => { uncaught.push('erro não tratado: ' + (ev.message || msgOf(ev.error))); };
    const onRej = ev => { uncaught.push('promessa rejeitada sem tratamento: ' + msgOf(ev.reason)); };
    const fmt = a => a.map(x => (x && x.message !== undefined ? x.message : typeof x === 'string' ? x : show(x))).join(' ');
    console.warn = (...a) => { t.logs.warn.push(fmt(a)); };
    console.error = (...a) => { t.logs.error.push(fmt(a)); };
    global.addEventListener('error', onErr); global.addEventListener('unhandledrejection', onRej);
    T.current = t; asserts = 0;
    const t0 = performance.now();
    let timer;
    try {
      const body = async () => { for (const f of s.before) await f(t); await test.fn(t); };
      await Promise.race([body(), new Promise((_, no) => { timer = setTimeout(() => no(new Error('tempo esgotado (' + test.timeout + ' ms)')), test.timeout); })]);
    } catch (e) {
      if (e instanceof Skip) { res.status = 'skip'; res.error = e.message; }
      else { res.status = 'fail'; res.error = e && e.name === 'AssertionError' ? e.message : (e && e.name ? e.name + ': ' : '') + msgOf(e); res.stack = (e && e.stack) || ''; }
    } finally { clearTimeout(timer); }
    try { for (const f of s.after) await f(t); } catch (e) { if (res.status === 'pass') { res.status = 'fail'; res.error = 'afterEach: ' + msgOf(e); } }
    res.asserts = asserts; res.ms = Math.round((performance.now() - t0) * 10) / 10;
    // limpeza (sempre): ganchos do teste, fetch, console, componentes novos e restos no <body>
    for (const f of st.cleanups.reverse()) { try { await f(); } catch (e) { /* */ } }
    global.fetch = fetchBefore; console.warn = real.warn; console.error = real.error;
    await sleep(0);   // deixa avisos/erros assíncronos do próprio teste chegarem antes de desligar a escuta
    global.removeEventListener('error', onErr); global.removeEventListener('unhandledrejection', onRej);
    Object.keys(R4.instances).filter(id => !before.has(id)).forEach(id => { try { R4.instances[id] && R4.instances[id].destroy(); } catch (e) { /* */ } delete R4.instances[id]; });
    box.querySelectorAll('*').forEach(n => { if (n._r4) { try { n._r4.destroy(); } catch (e) { /* */ } } });
    box.remove(); dirty(); T.current = null;
    if (res.status === 'pass' && uncaught.length) { res.status = 'fail'; res.error = uncaught[0]; }
    if (res.status === 'pass' && t.logs.error.length) { res.status = 'fail'; res.error = 'console.error inesperado: ' + t.logs.error[0]; }
    // falha conhecida (bug real da lib documentado): não reprova a execução; se passar, avisa para tirar a marca
    if (test.known) {
      if (res.status === 'fail') { res.status = 'known'; res.error = test.known + ' | ' + res.error; }
      else if (res.status === 'pass') { res.status = 'fail'; res.error = 'a falha conhecida parece corrigida: remova { known } deste teste (' + test.known + ')'; }
    }
    return res;
  }

  /**
   * T.run({ only: ['grid', ...], failedOnly, slow: true, onTest(res, suite), onSuite(info), onStart(plan) }) → resumo
   * Suítes lentas rodam por último. Atualiza window.__R4_TESTS (done, passed, failed, skipped, known, total, asserts, ms, failures).
   * test(nome, fn, { known: 'descrição' }) marca um bug real já documentado: a falha vira status 'known' e não reprova a execução.
   */
  T.run = async (o = {}) => {
    if (!T.stage) { T.stage = document.createElement('div'); T.stage.style.cssText = 'position:fixed;left:-9999px;top:0;width:900px'; document.body.append(T.stage); }
    const list = T.suites.filter(s => (!o.only || o.only.includes(s.name)) && (o.slow !== false || !s.slow));
    const ordered = [...list.filter(s => !s.slow), ...list.filter(s => s.slow)];
    const pick = (s, x) => !o.failedOnly || (o.failedOnly[s.name] || []).includes(x.name);
    const sum = global.__R4_TESTS = { done: false, passed: 0, failed: 0, skipped: 0, known: 0, total: 0, asserts: 0, ms: 0, failures: [], results: [] };
    o.onStart && o.onStart(ordered.map(s => ({ name: s.name, slow: s.slow, tests: s.tests.filter(x => pick(s, x)).map(x => x.name) })));
    const t0 = performance.now(), heap0 = performance.memory ? performance.memory.usedJSHeapSize : 0;
    for (const s of ordered) {
      const s0 = performance.now(); let np = 0, nf = 0;
      for (const test of s.tests) {
        if (!pick(s, test)) continue;
        let r;
        try { r = await runTest(s, test, o); } catch (e) { r = { suite: s.name, name: test.name, status: 'fail', ms: 0, asserts: 0, error: 'falha do runner: ' + msgOf(e), stack: '' }; }
        sum.total++; sum.asserts += r.asserts; sum.results.push(r);
        if (r.status === 'pass') { sum.passed++; np++; } else if (r.status === 'skip') sum.skipped++; else if (r.status === 'known') sum.known++; else { sum.failed++; nf++; sum.failures.push({ suite: r.suite, name: r.name, error: r.error }); }
        o.onTest && o.onTest(r, s, sum);
      }
      o.onSuite && o.onSuite({ name: s.name, passed: np, failed: nf, ms: Math.round(performance.now() - s0) });
    }
    sum.ms = Math.round(performance.now() - t0);
    if (performance.memory) { sum.heapMB = +(performance.memory.usedJSHeapSize / 1048576).toFixed(1); sum.heapDeltaMB = +((performance.memory.usedJSHeapSize - heap0) / 1048576).toFixed(1); }
    sum.done = true;
    return sum;
  };
  T.sleep = sleep;
})(window);
