/**
 * ============================================
 * libr4 / store.js  —  R4 dev
 * ============================================
 * R4.store: o ÚNICO jeito da lib de guardar algo no navegador (localStorage) — com validade (TTL),
 * validação na entrada e na saída, limites de tamanho e uma "lixeira" (coleta de lixo) que apaga sozinha
 * o que expirou, está corrompido, sobrou de versões antigas ou passou do limite (LRU).
 *
 *   R4.store.set('prefs', { cor: 'azul' }, { ttl: '30d', sliding: true });
 *   R4.store.get('prefs', { schema: { cor: 'string' }, fallback: {} });
 *
 * Nunca guarde token, senha, CPF, cartão ou qualquer dado pessoal aqui (o localStorage é legível por
 * qualquer script da página e por extensões). Chaves com esses nomes são recusadas.
 * Detalhes, limites e privacidade: docs/CACHE.md.
 *
 * Falha segura: sem localStorage (bloqueado, modo privado, cheio) tudo continua funcionando em memória,
 * com o mesmo TTL e os mesmos limites; nenhuma função lança exceção.
 * ============================================
 */
(function (R4) {
  'use strict';
  const NS = 'r4:', META = NS + '__meta';
  const KEY_RE = /^[A-Za-z0-9._:-]{1,64}$/;
  const SENS = /token|senha|password|secret|cpf|cartao|card|jwt|auth/i;
  const BADK = new Set(['__proto__', 'constructor', 'prototype']);
  const MAXD = 8, MAXN = 20000, MIN = 60000, HOUR = 3600000, DAY = 86400000, MAXTTL = 365 * DAY;
  const DEF = { maxBytes: 262144, maxItemBytes: 32768, defaultTtl: 7 * DAY, sweepEvery: HOUR, maxKeys: 200 };
  const UNIT = { ms: 1, s: 1e3, m: MIN, h: HOUR, d: DAY, w: 7 * DAY };
  const NOPE = {};            // sentinela: "dado inválido"
  let root = null;            // armazenamento principal (localStorage); serve de relógio padrão aos demais
  const warn = m => { try { console.warn('[R4.store] ' + m); } catch (e) { /* ignora */ } };
  const num = x => typeof x === 'number' && isFinite(x);
  const okKey = k => typeof k === 'string' && KEY_RE.test(k) && k.slice(0, 2) !== '__';
  /** bytes UTF-8 de uma string */
  const u8 = s => { let n = 0; for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); n += c < 128 ? 1 : c < 2048 ? 2 : c >= 0xd800 && c < 0xdc00 ? (i++, 4) : 3; } return n; };
  const idle = fn => { try { if (typeof requestIdleCallback === 'function') return requestIdleCallback(fn, { timeout: 2000 }); } catch (e) { /* cai no timer */ } return setTimeout(fn, 50); };
  const quota = e => !!e && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED' || e.code === 22 || e.code === 1014 || /quota/i.test(e.message || ''));

  /** 30000 | '30m' | '12h' | '7d' | '2w' | '500ms' → ms (entre 1 ms e 365 dias); inválido → reserva */
  function ttlMs(v, fb) {
    let n = NaN;
    if (typeof v === 'number') n = v;
    else if (typeof v === 'string') { const m = /^\s*(\d+(?:\.\d+)?)\s*(ms|s|m|h|d|w)?\s*$/.exec(v); if (m) n = +m[1] * UNIT[m[2] || 'ms']; }
    return isFinite(n) && n > 0 ? Math.min(Math.floor(n), MAXTTL) : fb;
  }

  /**
   * Cópia "JSON puro" do valor: só null, boolean, string, número finito, array e objeto simples.
   * Recusa (lança) função, símbolo, undefined em array, NaN/Infinity, Date/Map/classes, profundidade > 8
   * (inclui referência circular) e estrutura enorme. Chaves __proto__/constructor/prototype são ignoradas.
   */
  function clean(v, depth, ctx) {
    if (++ctx.n > MAXN) throw new Error('estrutura grande demais');
    if (v === null || typeof v === 'string' || typeof v === 'boolean') return v;
    if (typeof v === 'number') { if (!isFinite(v)) throw new Error('número inválido (NaN/Infinity)'); return v; }
    if (typeof v !== 'object') throw new Error('tipo não suportado (' + typeof v + ')');
    if (depth >= MAXD) throw new Error('profundidade acima de ' + MAXD + ' (ou referência circular)');
    if (Array.isArray(v)) { const a = []; for (let i = 0; i < v.length; i++) a.push(clean(v[i], depth + 1, ctx)); return a; }
    const p = Object.getPrototypeOf(v);
    if (p !== null && Object.getPrototypeOf(p) !== null) throw new Error('só objetos simples (nada de Date, Map, classes)');
    const o = {};
    for (const k of Object.keys(v)) { if (BADK.has(k) || v[k] === undefined) continue; o[k] = clean(v[k], depth + 1, ctx); }
    return o;
  }
  const copy = v => clean(v, 0, { n: 0 });

  /** esquema simples: { campo: 'string' | 'number' | 'boolean' | 'array' | 'object' | 'tipo?' | { t, max, min, in, re, opt } } */
  function typeOk(s, x) {
    switch (s.t) {
      case 'string': return typeof x === 'string' && x.length <= (s.max ?? 1000) && x.length >= (s.min ?? 0) && (!s.in || s.in.includes(x)) && (!s.re || s.re.test(x));
      case 'number': return num(x) && x >= (s.min ?? -Infinity) && x <= (s.max ?? Infinity);
      case 'boolean': return typeof x === 'boolean';
      case 'array': return Array.isArray(x) && x.length <= (s.max ?? 100);
      case 'object': return !!x && typeof x === 'object' && !Array.isArray(x) && Object.keys(x).length <= (s.max ?? 100);
      default: return false;
    }
  }
  function applySchema(sc, v) {
    try {
      if (typeof sc === 'function') { const r = sc(v); return r === undefined ? NOPE : r; }
      if (!sc || typeof sc !== 'object') return v;
      if (!v || typeof v !== 'object' || Array.isArray(v)) return NOPE;
      const out = {};
      for (const k of Object.keys(sc)) {
        if (BADK.has(k)) continue;
        let s = sc[k];
        s = typeof s === 'string' ? { t: s.replace(/\?$/, ''), opt: /\?$/.test(s) } : Object.assign({}, s);
        const x = Object.prototype.hasOwnProperty.call(v, k) ? v[k] : undefined;
        if (x === undefined || x === null) { if (s.opt) continue; return NOPE; }
        if (!typeOk(s, x)) return NOPE;
        out[k] = x;
      }
      return out;
    } catch (e) { return NOPE; }
  }

  /** Cria um armazenamento: `area` = Storage (ou objeto com getItem/setItem/removeItem[/key/length]); null = só memória. */
  function make(area, init) {
    const me = {}, cache = new Map(), dirty = new Set(), subs = new Set(), cfg = Object.assign({}, DEF);
    const st = { expired: 0, corrupt: 0, orphan: 0, schema: 0, evictions: 0, sweeps: 0 };
    let timer = 0, lastSweep = 0, job = null, warned = false, bad = false;

    const now = () => { let t; try { const f = me._agora || (root && root._agora); t = f ? f() : Date.now(); } catch (e) { /* relógio ruim */ } return isFinite(t) ? Math.floor(t) : Date.now(); };
    const rd = k => { try { return area ? area.getItem(k) : null; } catch (e) { return null; } };
    const rm = k => { try { if (area) area.removeItem(k); } catch (e) { /* ignora */ } };
    const due = () => now() - lastSweep >= cfg.sweepEvery;

    /** apaga a chave (cache + armazenamento); com `why` conta e avisa os ouvintes de onEvict */
    function drop(n, why) {
      const had = cache.delete(n); dirty.delete(n); rm(NS + n);
      if (why) {
        if (why === 'lru' || why === 'quota') st.evictions++; else st[why]++;
        subs.forEach(f => { try { f(n, why); } catch (e) { /* ouvinte não derruba a lixeira */ } });
      }
      return had;
    }
    /** texto do armazenamento → registro validado, ou o motivo do descarte ('corrupt' | 'orphan') */
    function parse(n, raw) {
      if (typeof raw !== 'string' || raw.length > cfg.maxItemBytes + 512) return 'corrupt';
      let o; try { o = JSON.parse(raw); } catch (e) { return 'corrupt'; }
      if (!o || typeof o !== 'object' || Array.isArray(o) || o.v !== 1) return 'orphan';   // versão antiga ou valor sem envelope
      if (!('d' in o) || !num(o.e) || o.e <= 0 || !num(o.a) || o.a < 0 || !num(o.b) || (o.s !== undefined && (!num(o.s) || o.s <= 0))) return 'corrupt';   // e=0 ("eterno") não é aceito
      let d; try { d = copy(o.d); } catch (e) { return 'corrupt'; }
      const t = now(), j = JSON.stringify(d), b = u8(j);
      if (b > cfg.maxItemBytes) return 'corrupt';
      return { d, j, b, e: Math.min(o.e, t + MAXTTL), a: Math.min(o.a, t), s: o.s ? Math.min(o.s, MAXTTL) : 0, w: Math.min(o.a, t), size: b + n.length + 40 };
    }
    /** registro válido e dentro da validade (expirado é apagado na hora) */
    function load(n) {
      let r = cache.get(n);
      if (!r) {
        const raw = rd(NS + n);
        if (raw == null) return null;
        r = parse(n, raw);
        if (typeof r === 'string') { drop(n, r); return null; }
        cache.set(n, r);
      }
      if (r.e <= now()) { drop(n, 'expired'); return null; }
      return r;
    }
    const mark = n => { dirty.add(n); if (!timer) timer = setTimeout(flush, 200); };
    function touch(n, r) {   // a leitura renova `a` (LRU) e, se sliding, a validade; a escrita é limitada (1/min; sem sliding, 1/h)
      const t = now(); r.a = t;
      if (r.s) r.e = t + r.s;
      if (t - r.w >= (r.s ? MIN : HOUR)) { r.w = t; mark(n); }
    }

    /* ---------- gravação (em lote) ---------- */
    function put(n, r) {
      const raw = '{"v":1,"d":' + r.j + ',"e":' + r.e + ',"a":' + r.a + ',"b":' + r.b + (r.s ? ',"s":' + r.s : '') + '}';
      for (let tentativa = 0; tentativa < 2; tentativa++) {
        try { area.setItem(NS + n, raw); r.mem = r.fresh = bad = false; r.w = now(); return true; }
        catch (e) {
          if (tentativa || !quota(e)) break;
          sweepCore(n); evictOldest(0.25, n);      // cota estourada: varre, expulsa os menos usados e tenta de novo UMA vez
        }
      }
      r.mem = bad = true;
      if (!warned) { warned = true; warn('armazenamento cheio ou indisponível: os dados ficam só em memória (nada é perdido na página atual).'); }
      return false;
    }
    function flush() {
      if (timer) { clearTimeout(timer); timer = 0; }
      if (!dirty.size) return me;
      const l = [...dirty]; dirty.clear();
      if (area) l.forEach(n => { const r = cache.get(n); if (r) put(n, r); });
      return me;
    }

    /* ---------- lixeira (coleta de lixo) ---------- */
    function names() {
      const s = new Set(cache.keys());
      if (area) {
        try {
          if (typeof area.key === 'function' && typeof area.length === 'number') { for (let i = 0, L = area.length; i < L; i++) { const k = area.key(i); if (typeof k === 'string' && k.startsWith(NS) && k !== META) s.add(k.slice(NS.length)); } }
          else Object.keys(area).forEach(k => { if (k.startsWith(NS) && k !== META) s.add(k.slice(NS.length)); });
        } catch (e) { /* ignora */ }
      }
      return [...s];
    }
    const newJob = protect => ({ list: names(), i: 0, live: [], protect, base: Object.assign({}, st) });
    function step(j, max) {   // processa até `max` chaves; true = terminou
      for (; j.i < j.list.length && max-- > 0; j.i++) {
        const n = j.list[j.i];
        if (!okKey(n)) { drop(n, 'orphan'); continue; }
        const r = load(n);
        if (r) j.live.push({ n, a: r.a, size: r.size });
      }
      return j.i >= j.list.length;
    }
    const total = live => live.reduce((s, x) => s + x.size, 0);
    function trim(live, protect) {   // passou do limite: expulsa os MENOS recentemente usados até ficar em ≤ 80%
      if (total(live) <= cfg.maxBytes && live.length <= cfg.maxKeys) return;
      let bytes = total(live), count = live.length;
      const tb = cfg.maxBytes * 0.8, tk = Math.max(1, Math.floor(cfg.maxKeys * 0.8));
      live.sort((x, y) => x.a - y.a);
      for (const x of live) {
        if (bytes <= tb && count <= tk) break;
        if (x.n === protect) continue;
        drop(x.n, 'lru'); bytes -= x.size; count--; x.gone = true;
      }
    }
    function finish(j) {
      trim(j.live, j.protect);
      lastSweep = now(); st.sweeps++;
      try { if (area) area.setItem(META, '{"v":1,"t":' + lastSweep + '}'); } catch (e) { /* meta é só otimização */ }
      const live = j.live.filter(x => !x.gone);
      const d = k => st[k] - j.base[k];
      return { expired: d('expired'), corrupt: d('corrupt'), orphan: d('orphan'), rejected: d('schema'), evicted: d('evictions'), items: live.length, bytes: total(live) };
    }
    function sweepCore(protect) { if (job) job = null; const j = newJob(protect); step(j, Infinity); return finish(j); }
    function evictOldest(frac, protect) {
      const j = newJob(); step(j, Infinity);
      j.live.sort((x, y) => x.a - y.a);
      let k = Math.ceil(j.live.length * frac);
      for (const x of j.live) { if (k <= 0) break; if (x.n !== protect) { drop(x.n, 'quota'); k--; } }
    }
    function autoSweep() {   // em fatias, quando o navegador estiver ocioso
      if (job) return;
      const j = job = newJob();
      const run = () => { if (job !== j) return; if (step(j, 25)) { job = null; finish(j); } else idle(run); };
      idle(run);
    }
    /** depois de gravar: passou do limite? varre agora; senão, se já deu o intervalo, agenda a varredura ociosa */
    function guard(protect) {
      let bytes = 0; cache.forEach(r => { bytes += r.size; });
      if (cache.size > cfg.maxKeys || bytes > cfg.maxBytes) sweepCore(protect);
      else if (!job && due()) autoSweep();
    }
    function start() {   // lê a hora da última varredura; se já deu o intervalo, agenda uma (ao carregar)
      let t = 0;
      try { const m = JSON.parse(rd(META) || 'null'); if (m && m.v === 1 && num(m.t) && m.t <= now()) t = m.t; } catch (e) { /* meta ruim: varre */ }
      lastSweep = t;
      if (area && due()) autoSweep();
    }

    /* ---------- API ---------- */
    Object.assign(me, {
      /** set(chave, valor, { ttl, sliding, permitirSensivel, now }) → true se guardou */
      set(k, v, o) {
        o = o || {};
        try {
          if (!okKey(k)) { warn('chave inválida: "' + String(k).slice(0, 40) + '" (use A-Z a-z 0-9 . _ : - , 1 a 64 caracteres, sem começar com "__").'); return false; }
          if (SENS.test(k) && !o.permitirSensivel) { warn('chave "' + k + '" parece guardar dado sensível (token, senha, CPF, cartão...). Recusado: NUNCA guarde isso no navegador.'); return false; }
          let d; try { d = copy(v); } catch (e) { warn('valor de "' + k + '" recusado: ' + e.message + ' (só JSON puro).'); return false; }
          const j = JSON.stringify(d), b = u8(j);
          if (b > cfg.maxItemBytes) { warn('valor de "' + k + '" recusado: ' + b + ' bytes (limite ' + cfg.maxItemBytes + ').'); return false; }
          const t = now(), ttl = ttlMs(o.ttl, cfg.defaultTtl);
          cache.set(k, { d, j, b, e: t + ttl, a: t, s: o.sliding ? ttl : 0, w: t, size: b + k.length + 40, fresh: true });   // fresh = ainda não gravado
          mark(k);
          if (o.now) flush();
          guard(k);
          return true;
        } catch (e) { return false; }
      },
      /** get(chave, { schema, fallback }) → valor (cópia) ou fallback; expirado/corrompido/fora do esquema é apagado */
      get(k, o) {
        const fb = o && o.fallback;
        try {
          if (!okKey(k)) return fb;
          const r = load(k);
          if (!r) return fb;
          let v = copy(r.d);
          if (o && o.schema !== undefined) { v = applySchema(o.schema, v); if (v === NOPE) { drop(k, 'schema'); return fb; } }
          touch(k, r);
          return v;
        } catch (e) { return fb; }
      },
      has(k) { try { return okKey(k) && !!load(k); } catch (e) { return false; } },
      del(k) { try { return okKey(k) ? drop(k) : false; } catch (e) { return false; } },
      keys(p) { try { p = typeof p === 'string' ? p : ''; return names().filter(n => n.startsWith(p) && okKey(n) && load(n)).sort(); } catch (e) { return []; } },
      clear(p) { try { p = typeof p === 'string' ? p : ''; let c = 0; names().forEach(n => { if (n.startsWith(p) && drop(n)) c++; }); return c; } catch (e) { return 0; } },
      /** varre agora (expirados, corrompidos, órfãos, excedente LRU). sweep({ auto: true }) só roda se já passou `sweepEvery`. */
      sweep(o) { try { return o && o.auto && !due() ? null : sweepCore(); } catch (e) { return null; } },
      stats() {
        try {
          const j = newJob(); step(j, Infinity);
          return { items: j.live.length, bytes: total(j.live), maxBytes: cfg.maxBytes, maxKeys: cfg.maxKeys, expired: st.expired, corrupt: st.corrupt, orphan: st.orphan, rejected: st.schema, evictions: st.evictions, sweeps: st.sweeps, lastSweep, pending: dirty.size, memory: !area || bad || [...cache.values()].some(r => r.mem) };
        } catch (e) { return { items: 0, bytes: 0, memory: true }; }
      },
      configure(o) {
        if (o && typeof o === 'object') {
          const lim = (v, lo, hi, cur) => (isFinite(v) && v !== null && v !== '' ? Math.min(hi, Math.max(lo, Math.floor(+v))) : cur);
          cfg.maxBytes = lim(o.maxBytes, 1024, 4194304, cfg.maxBytes);
          cfg.maxItemBytes = Math.min(lim(o.maxItemBytes, 16, 1048576, cfg.maxItemBytes), cfg.maxBytes);
          cfg.maxKeys = lim(o.maxKeys, 1, 2000, cfg.maxKeys);
          cfg.sweepEvery = lim(o.sweepEvery, 1000, 7 * DAY, cfg.sweepEvery);
          if (o.defaultTtl !== undefined) cfg.defaultTtl = ttlMs(o.defaultTtl, cfg.defaultTtl);
          try { guard(); } catch (e) { /* ignora */ }
        }
        return Object.assign({}, cfg);
      },
      /** grava já o que está pendente (também roda sozinho em 200 ms e ao sair da página) */
      flush,
      /** onEvict(fn(chave, motivo)) — motivos: expired, corrupt, orphan, schema, lru, quota. Devolve a função para cancelar. */
      onEvict(fn) { if (typeof fn !== 'function') return () => {}; subs.add(fn); return () => subs.delete(fn); },
      /** troca a "área" (objeto com getItem/setItem/removeItem[/key/length]; null = só memória). Para testes e ambientes especiais. */
      use(a) { flush(); area = a || null; cache.clear(); dirty.clear(); job = null; start(); return me; }
    });
    me._agora = init && typeof init._agora === 'function' ? init._agora : null;   // relógio injetável (testes)
    me._area = () => area;
    me._storage = ev => {   // evento 'storage' (outra aba mudou algo): descarta o que estava em cache
      try {
        if (!area || (ev.storageArea && ev.storageArea !== area)) return;
        const solta = n => { const r = cache.get(n); if (r && !r.mem && !r.fresh) cache.delete(n); };   // só preserva o que ESTA aba gravou e ainda não saiu
        if (ev.key === null) [...cache.keys()].forEach(solta);
        else if (typeof ev.key === 'string' && ev.key.startsWith(NS)) solta(ev.key.slice(NS.length));
      } catch (e) { /* ignora */ }
    };
    start();
    if (init) me.configure(init);
    return me;
  }

  const pick = kind => { try { const s = kind === 'session' ? window.sessionStorage : window.localStorage; s.getItem(NS + '__probe'); return s; } catch (e) { return null; } };
  const api = root = make(pick('local'));
  api._agora = () => Date.now();
  api.session = make(pick('session'));
  /** create({ area, maxBytes, ... }) → armazenamento independente (sem `area` = só memória). Não entra no flush automático ao sair da página. */
  api.create = o => make(o && o.area ? o.area : null, o);
  const all = [api, api.session];
  try {
    const sai = () => all.forEach(s => s.flush());
    window.addEventListener('pagehide', sai);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') sai(); });
    window.addEventListener('storage', ev => api._storage(ev));
  } catch (e) { /* sem window/document */ }

  R4.store = api;
  R4.module('store', api, {
    group: 'Núcleo', title: 'R4.store',
    description: 'Armazenamento do navegador com validade (TTL), validação e lixeira automática (namespace r4: no localStorage; R4.store.session usa o sessionStorage). Todo item expira; o que é lido é revalidado (envelope, JSON puro, esquema opcional); a coleta de lixo apaga expirados, corrompidos, órfãos e, passando do limite, os MENOS usados (LRU até 80%). Sem localStorage cai para memória, com as mesmas regras. NUNCA guarde token, senha, CPF, cartão ou dado pessoal (chaves com esses nomes são recusadas). Detalhes: docs/CACHE.md.',
    props: [
      { name: 'set(chave, valor, { ttl, sliding, permitirSensivel })', type: 'boolean', desc: "Guarda JSON puro (sem função/símbolo/ciclo, profundidade ≤ 8; __proto__/constructor/prototype ignorados). Chave [A-Za-z0-9._:-], 1 a 64. ttl em ms ou '30m' | '12h' | '7d' (padrão defaultTtl; máx. 365 dias: nada é eterno). sliding renova a cada leitura (grava no máx. 1x/min). Gravação em lote (200 ms / pagehide). false + aviso se recusar." },
      { name: 'get(chave, { schema, fallback })', type: 'valor', desc: "Cópia do valor ou fallback (inexistente, expirado, corrompido ou fora do esquema: a chave é apagada). schema: função valor => valor | undefined, ou { campo: 'string' | 'number' | 'boolean' | 'array' | 'object' } (sufixo ? = opcional; { t, max, min, in, re } para limites; campos extras são descartados)." },
      { name: 'has(chave) / del(chave)', type: 'boolean', desc: 'Existe e não expirou / apaga.' },
      { name: 'keys(prefixo) / clear(prefixo)', type: 'string[] / number', desc: 'Chaves válidas (sem o r4:) / apaga as do prefixo (sem prefixo: todo o namespace) e devolve quantas.' },
      { name: 'sweep({ auto })', type: 'object', desc: 'Varre agora: { expired, corrupt, orphan, rejected, evicted, items, bytes }. { auto: true } só roda se passou sweepEvery (senão null). Também roda ao carregar (ocioso, em fatias), ao estourar o limite e ao estourar a cota do navegador.' },
      { name: 'stats()', type: 'object', desc: '{ items, bytes, maxBytes, maxKeys, expired, corrupt, orphan, rejected, evictions, sweeps, lastSweep, pending, memory }.' },
      { name: 'configure({ maxBytes, maxItemBytes, defaultTtl, sweepEvery, maxKeys })', type: 'object', desc: 'Padrões: 262144, 32768, 7 dias, 1 h, 200. Devolve a configuração atual.' },
      { name: 'onEvict(fn(chave, motivo))', type: 'function', desc: 'Motivos: expired, corrupt, orphan, schema, lru, quota. Devolve a função para cancelar.' },
      { name: 'flush() / session / create({ area, ...limites })', type: 'R4.store', desc: 'Grava já o pendente / mesma API no sessionStorage / armazenamento independente (sem area = só memória).' },
      { name: 'use(area) / _agora', type: 'testes', desc: 'use(objetoComGetItemSetItem) troca a área (null = memória); R4.store._agora = () => ms injeta o relógio.' }
    ]
  });
})(window.R4);
