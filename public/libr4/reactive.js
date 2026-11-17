/**
 * ============================================
 * libr4 / reactive.js  —  R4 dev
 * ============================================
 * Camada reativa declarativa: cada <r4-form> (e cada item de <r4-repeater>) tem um ESTADO com os valores
 * dos campos por name, atualizado a cada digitação. Atributos em qualquer elemento reagem a ele:
 *
 *   r4-bind="texto:nome|Seu nome; attr:title:nome; var:--marca:cor; classe:destaque:plano=pro"
 *   r4-show-if="tipo=pj && !isento"        r4-enable-if="aceite"        r4-scope="#idDoForm"
 *
 * Expressões têm um MINI-PARSER próprio (sem eval/new Function): campo, !campo, campo=valor, campo!=valor,
 * campo>n, campo<n, campo>=n, campo<=n, campo in a,b,c, #campo (quantidade), && e || com parênteses.
 * Nada vira HTML: texto por textContent, atributos de uma allowlist (href/src por R4.util.safeUrl),
 * variáveis CSS com valor revalidado (R4.preview.cssValue) e classes por nome validado.
 * Atualização em lote: uma passada por quadro (requestAnimationFrame), só nos elementos que dependem
 * dos campos que mudaram (índice campo → elementos). API: R4.state(form | '#id').
 * ============================================
 */
(function (R4) {
  'use strict';
  const U = R4.util, T = U.T;
  const BAD = new Set(['__proto__', 'constructor', 'prototype']);
  const NAME = /^#?[A-Za-z_][\w.-]{0,63}/;
  const LIMITS = { expr: 300, bindingsPerAttr: 20, bindings: 5000, depth: 8, pending: 500 };
  const raf = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : f => setTimeout(f, 16);
  const caf = typeof cancelAnimationFrame === 'function' ? cancelAnimationFrame : clearTimeout;
  const warned = new Set();
  const warnOnce = (k, m) => { if (warned.has(k)) return; warned.add(k); R4.warn(m); };
  const same = (a, b) => a === b || JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  const own = (o, k) => o != null && !BAD.has(k) && Object.prototype.hasOwnProperty.call(o, k) ? o[k] : undefined;

  /* =====================================================================
   * Expressões
   * ===================================================================== */
  const isNum = s => /^-?(?:[0-9]+(?:[.,][0-9]+)?|[.,][0-9]+)$/.test(String(s).trim());
  const toNum = v => {
    if (Array.isArray(v)) return v.length;
    if (typeof v === 'number') return v;
    if (typeof v === 'string' && isNum(v)) return Number(v.trim().replace(',', '.'));
    return NaN;
  };
  const truthy = v => !(v == null || v === false || v === 0 || (typeof v === 'number' && isNaN(v)) || (typeof v === 'string' && !v.trim()) || (Array.isArray(v) && !v.length));
  const eqOne = (v, lit) => {
    if (v == null || v === false && lit === '') return lit === '';
    const s = String(v);
    return s === lit || (isNum(s) && isNum(lit) && toNum(s) === toNum(lit));
  };
  const eq = (v, lit) => (Array.isArray(v) ? v.some(x => eqOne(x, lit)) : eqOne(v, lit));
  const countOf = v => (Array.isArray(v) ? v.length : typeof v === 'string' ? v.length : truthy(v) ? 1 : 0);
  const unq = s => { s = s.trim(); return s.length > 1 && (s[0] === '"' || s[0] === "'") && s[s.length - 1] === s[0] ? s.slice(1, -1) : s; };

  /** Compila a expressão em {fn(valores) → boolean, deps:[campos], err}. Nunca lança. */
  function parse(src) {
    const s = src;
    let i = 0, depth = 0;
    const deps = new Set();
    const fail = m => { throw new Error(m); };
    const ws = () => { while (i < s.length && (s[i] === ' ' || s[i] === '\t' || s[i] === '\n' || s[i] === '\r')) i++; };
    function or() {
      let n = and(); ws();
      while (s.startsWith('||', i)) { i += 2; const l = n, r = and(); n = v => l(v) || r(v); ws(); }
      return n;
    }
    function and() {
      let n = un(); ws();
      while (s.startsWith('&&', i)) { i += 2; const l = n, r = un(); n = v => l(v) && r(v); ws(); }
      return n;
    }
    function un() {
      ws();
      if (s[i] === '!' && s[i + 1] !== '=') { i++; const n = un(); return v => !n(v); }
      if (s[i] === '(') {
        if (++depth > LIMITS.depth) fail('parênteses aninhados demais (máx. ' + LIMITS.depth + ')');
        i++; const n = or(); ws();
        if (s[i] !== ')') fail('falta fechar ")"');
        i++; depth--;
        return n;
      }
      return cmp();
    }
    /** literal: 'entre aspas' ou texto até && || ) ou o fim */
    function literal() {
      ws();
      if (s[i] === '"' || s[i] === "'") {
        const q = s[i], j = s.indexOf(q, i + 1);
        if (j < 0) fail('aspas sem fechar');
        const v = s.slice(i + 1, j); i = j + 1; return v;
      }
      let j = i;
      while (j < s.length && !s.startsWith('&&', j) && !s.startsWith('||', j) && s[j] !== ')') {
        if (s[j] === '(') fail('chamadas de função e parênteses dentro de valores não são permitidos (use aspas)');
        j++;
      }
      const v = s.slice(i, j).trim(); i = j; return v;
    }
    function cmp() {
      ws();
      const m = NAME.exec(s.slice(i, i + 66));
      if (!m) fail(i >= s.length ? 'expressão incompleta' : 'esperava o nome de um campo em "' + s.slice(i, i + 12) + '"');
      let name = m[0]; i += name.length;
      const count = name[0] === '#'; if (count) name = name.slice(1);
      if (BAD.has(name)) fail('nome de campo proibido "' + name + '"');
      deps.add(name);
      ws();
      if (s[i] === '(') fail('chamadas de função não são permitidas ("' + name + '(...)")');
      const get = v => { const x = own(v, name); return count ? countOf(x) : x; };
      const op = /^(==|!=|>=|<=|=|>|<|in(?=[\s'"]))/.exec(s.slice(i, i + 3));
      if (!op) return v => truthy(get(v));
      i += op[1].length;
      if (op[1] === 'in') {
        const list = literal().split(',').map(unq).filter(x => x !== '');
        if (!list.length) fail('lista vazia depois de "in"');
        return v => { const x = get(v); return list.some(l => eq(x, l)); };
      }
      const lit = literal();
      switch (op[1]) {
        case '=': case '==': return v => eq(get(v), lit);
        case '!=': return v => !eq(get(v), lit);
        default: {
          const n = toNum(lit);
          if (isNaN(n)) fail('"' + op[1] + '" precisa de número (recebeu "' + lit + '")');
          const f = { '>': (a, b) => a > b, '<': (a, b) => a < b, '>=': (a, b) => a >= b, '<=': (a, b) => a <= b }[op[1]];
          return v => { const a = toNum(get(v)); return !isNaN(a) && f(a, n); };
        }
      }
    }
    const fn = or(); ws();
    if (i < s.length) {
      const rest = s.slice(i, i + 16);
      fail('texto inesperado "' + rest + '"' + (/^(and|e)\b/i.test(rest) ? ' — use && no lugar de "' + rest.split(/\s/)[0] + '"' : /^(or|ou)\b/i.test(rest) ? ' — use || no lugar de "' + rest.split(/\s/)[0] + '"' : ''));
    }
    return { fn, deps: [...deps] };
  }
  const cache = new Map();
  const FALSE = () => false;
  function compile(src, where) {
    src = String(src ?? '').trim();
    let c = cache.get(src);
    if (!c) {
      if (!src) c = { fn: FALSE, deps: [], err: 'expressão vazia' };
      else if (src.length > LIMITS.expr) c = { fn: FALSE, deps: [], err: 'expressão longa demais (' + src.length + ' caracteres; máx. ' + LIMITS.expr + ')' };
      else { try { c = parse(src); } catch (e) { c = { fn: FALSE, deps: [], err: e.message }; } }
      if (cache.size > 500) cache.clear();
      cache.set(src, c);
    }
    if (c.err) warnOnce('expr|' + src, 'expressão inválida' + (where ? ' em ' + where : '') + ' "' + src.slice(0, 80) + '": ' + c.err +
      '. Sintaxe: campo, !campo, campo=valor, campo!=valor, campo>n, campo<n, campo in a,b,c, #campo, com && / || e parênteses.');
    return c;
  }
  /** Avalia com segurança (expressão inválida → false). */
  const evaluate = (expr, values) => { const c = compile(expr); try { return !!c.fn(values || {}); } catch (e) { return false; } };

  /* =====================================================================
   * Estado por form / item de repeater
   * ===================================================================== */
  const states = new WeakMap();   // elemento .r4-form/.r4-subform → State
  let liveBindings = 0;
  const ownerOf = node => (node ? node._r4sub || (R4.instances[node.id] && R4.instances[node.id].el === node ? R4.instances[node.id] : null) : null);

  class State extends R4.Observable {
    constructor(src) {
      super();
      this.src = src; this.el = src.el;
      this.vals = {}; this.deps = new Map(); this.bindings = new Set(); this._missing = new Set();
      this._h = () => this.schedule();
      ['input', 'change', 'r4-fieldchange', 'r4-values'].forEach(t => this.el.addEventListener(t, this._h));
      if (typeof src.on === 'function') src.on('destroy', () => this.destroy());
      this.vals = this._read();
      this.schedule(true);
    }
    _read() { try { return this.src.getValues(true) || {}; } catch (e) { return {}; } }
    /** Valores atuais (lidos na hora se houver atualização pendente). */
    values() { if (this._raf) this.flush(); return Object.assign({}, this.vals); }
    get(k) { if (this._raf) this.flush(); return own(this.vals, k); }
    /** Altera um campo pelo name (setValue) e agenda a atualização dos dependentes. */
    set(k, v) {
      const f = this.src.getField && this.src.getField(k);
      if (!f) { warnOnce('set|' + k, 'R4.state: campo "' + k + '" não existe neste form' + hint(k, Object.keys(this.vals))); return this; }
      f.setValue(v); this.schedule();
      return this;
    }
    schedule(force) {
      if (this._dead) return this;
      if (force) this._force = true;
      if (!this._raf) this._raf = raf(() => this.flush());
      return this;
    }
    refresh() { return this.schedule(true); }
    /** Uma passada: relê os valores, descobre o que mudou e atualiza só quem depende disso. */
    flush() {
      if (this._raf) { caf(this._raf); this._raf = 0; }
      if (this._dead) return;
      const nv = this._read(), changed = [];
      new Set([...Object.keys(nv), ...Object.keys(this.vals)]).forEach(k => { if (!same(nv[k], this.vals[k])) changed.push(k); });
      this.vals = nv;
      const force = this._force; this._force = false;
      const todo = new Set();
      if (force) this.bindings.forEach(b => todo.add(b));
      else changed.forEach(k => (this.deps.get(k) || []).forEach(b => todo.add(b)));
      let writes = 0;
      todo.forEach(b => { writes += this._apply(b, true) ? 1 : 0; });
      if (changed.length) this.fire('change', this, changed, Object.assign({}, nv));
      if (writes && (this._cascade = (this._cascade || 0) + 1) < 5) this.schedule(); else this._cascade = 0;   // valor: que mudou outro campo
    }
    _apply(b, check) {
      if (!b.el.isConnected) { this.unbind(b); return false; }
      if (check && !b.checked) {
        b.checked = true;
        b.deps.forEach(k => {
          if (!Object.prototype.hasOwnProperty.call(this.vals, k) && !this._missing.has(k)) {
            this._missing.add(k);
            R4.warn('campo "' + k + '" não existe no form' + (this.el.id ? ' #' + this.el.id : '') + ' (usado em ' + b.attr + '="' + b.raw.slice(0, 60) + '")' + hint(k, Object.keys(this.vals)));
          }
        });
      }
      try { return b.apply(this.vals); } catch (e) { console.error('[R4] ' + b.attr + ':', e); return false; }
    }
    add(b) {
      this.bindings.add(b);
      b.deps.forEach(k => { let s = this.deps.get(k); if (!s) this.deps.set(k, s = new Set()); s.add(b); });
      liveBindings++;
      this._apply(b, false);   // já aplica (evita "piscar"); a conferência dos campos vem no próximo quadro
      this.schedule(true);
    }
    unbind(b) {
      if (!this.bindings.delete(b)) return;
      liveBindings--;
      b.deps.forEach(k => { const s = this.deps.get(k); s && s.delete(b); });
      const rec = bound.get(b.el);
      if (rec) { rec.splice(rec.indexOf(b), 1); if (!rec.length) bound.delete(b.el); }
    }
    destroy() {
      if (this._dead) return;
      this._dead = true;
      if (this._raf) { caf(this._raf); this._raf = 0; }
      ['input', 'change', 'r4-fieldchange', 'r4-values'].forEach(t => this.el.removeEventListener(t, this._h));
      [...this.bindings].forEach(b => this.unbind(b));
      states.delete(this.el);
      this.fire('destroy', this);
      this._ev = null;
    }
  }
  const hint = (k, list) => { const s = R4.suggest && R4.suggest(k, list); return s ? ' — quis dizer "' + s + '"?' : ''; };

  function stateFor(node) {
    if (!node || !node.classList || !(node.classList.contains('r4-form') || node.classList.contains('r4-subform'))) return null;
    let st = states.get(node);
    if (st && !st._dead) return st;
    const src = ownerOf(node);
    if (!src || typeof src.getValues !== 'function') return null;
    st = new State(src);
    states.set(node, st);
    return st;
  }
  /** R4.state(form | '#id' | 'id' | elemento) → estado do form (ou null com aviso). */
  R4.state = function (x) {
    let node = null;
    if (typeof x === 'string') { const id = x.replace(/^#/, ''); const c = R4.get(id); node = c ? c.el : document.getElementById(id); }
    else if (x && x.el && x.el.nodeType === 1) node = x.el;
    else if (x && x.nodeType === 1) node = x;
    if (node && !node.classList.contains('r4-form') && !node.classList.contains('r4-subform')) node = node.querySelector && node.querySelector('.r4-form');
    const st = stateFor(node);
    if (!st) R4.warn('R4.state: formulário não encontrado: ' + (typeof x === 'string' ? x : x && x.id ? '#' + x.id : String(x)));
    return st;
  };

  /* =====================================================================
   * Bindings
   * ===================================================================== */
  const bound = new Map();   // elemento → [bindings]  (Map: removido ao desligar; elementos soltos saem na próxima passada)
  const ATTRS = new Set(['title', 'alt', 'aria-label', 'placeholder', 'href', 'src']);
  const KINDS = { texto: 'texto', text: 'texto', valor: 'valor', value: 'valor', attr: 'attr', var: 'var', classe: 'classe', class: 'classe' };
  const CLS = /^[A-Za-z_-][\w-]{0,40}$/;
  const fieldName = s => { s = String(s || '').trim(); return /^#?[A-Za-z_][\w.-]{0,63}$/.test(s) && !BAD.has(s.replace(/^#/, '')) ? s : ''; };
  /** Valor → texto: lista de objetos (repeater) vira "a b; c d"; lista simples "a, b". */
  function fmt(v) {
    if (v == null || v === false) return '';
    if (v === true) return T('r4.yes', 0, 'Sim');
    if (Array.isArray(v)) return v.map(x => (x && typeof x === 'object' ? Object.keys(x).filter(k => !BAD.has(k)).map(k => fmt(x[k])).filter(Boolean).join(' ') : fmt(x))).filter(Boolean).join(v.some(x => x && typeof x === 'object') ? '; ' : ', ');
    if (typeof v === 'object') return '';
    return String(v);
  }
  const read = (vals, f) => (f[0] === '#' ? countOf(own(vals, f.slice(1))) : own(vals, f));
  const cmpOf = el => { const c = R4.instances[el.id]; return c && c.el === el ? c : null; };

  /** r4-bind="..." → lista de bindings (ou [] com aviso). */
  function parseBind(el, raw) {
    const parts = raw.split(';').map(x => x.trim()).filter(Boolean);
    if (parts.length > LIMITS.bindingsPerAttr) { warnOnce('many|' + raw.slice(0, 40), 'r4-bind com bindings demais (' + parts.length + '; máx. ' + LIMITS.bindingsPerAttr + '): o resto foi ignorado'); parts.length = LIMITS.bindingsPerAttr; }
    const out = [];
    parts.forEach(p => {
      const i = p.indexOf(':'), k = (i < 0 ? p : p.slice(0, i)).trim().toLowerCase(), rest = i < 0 ? '' : p.slice(i + 1);
      const kind = KINDS[k];
      const bad = m => warnOnce('bind|' + p, 'r4-bind="' + p.slice(0, 60) + '": ' + m);
      if (!kind) return bad('tipo desconhecido "' + k + '"' + hint(k, ['texto', 'valor', 'attr', 'var', 'classe']) + ' (use texto:, valor:, attr:, var: ou classe:)');
      const B = { el, attr: 'r4-bind', raw: p, deps: [] };
      if (kind === 'texto' || kind === 'valor') {
        const [f0, ...fb] = rest.split('|'), f = fieldName(f0), fallback = fb.join('|');
        if (!f) return bad('nome de campo inválido "' + f0 + '"');
        B.deps = [f.replace(/^#/, '')];
        B.apply = kind === 'texto'
          ? vals => { const s = fmt(read(vals, f)) || fallback; if (el.textContent !== s) { el.textContent = s; } return false; }
          : vals => {
            const v = read(vals, f), c = cmpOf(el);
            if (c && typeof c.setValue === 'function' && typeof c.getValue === 'function') {
              if (same(c.getValue(), v ?? '')) return false;
              c.setValue(v ?? ''); return true;
            }
            if ('value' in el) { const s = v == null ? '' : String(v); if (el.value !== s) { el.value = s; return true; } }
            return false;
          };
      } else if (kind === 'attr') {
        const j = rest.indexOf(':'), name = (j < 0 ? '' : rest.slice(0, j)).trim().toLowerCase(), [f0, ...fb] = (j < 0 ? rest : rest.slice(j + 1)).split('|');
        const f = fieldName(f0), fallback = fb.join('|');
        if (!ATTRS.has(name)) return bad('atributo "' + name + '" não permitido (só ' + [...ATTRS].join(', ') + ')');
        if (!f) return bad('nome de campo inválido "' + f0 + '"');
        B.deps = [f.replace(/^#/, '')];
        B.apply = vals => {
          let s = fmt(read(vals, f)) || fallback;
          if (s && (name === 'href' || name === 'src')) {
            const ok = U.safeUrl(s, name === 'src' ? 'img' : '');
            if (!ok) { warnOnce('url|' + s.slice(0, 40), 'r4-bind attr:' + name + ': URL insegura recusada (' + s.slice(0, 60) + ')'); s = ''; } else s = ok;
          }
          if (!s) el.removeAttribute(name); else if (el.getAttribute(name) !== s) el.setAttribute(name, s);
          return false;
        };
      } else if (kind === 'var') {
        const seg = rest.split(':').map(x => x.trim()), name = seg[0], f = fieldName(seg[1]), unit = seg[2] || '';
        if (!/^--[A-Za-z0-9_-]{1,40}$/.test(name)) return bad('variável CSS inválida "' + name + '" (use --nome)');
        if (!f) return bad('nome de campo inválido "' + (seg[1] || '') + '"');
        B.deps = [f.replace(/^#/, '')];
        B.apply = vals => {
          const v = read(vals, f), css = R4.preview.cssValue(v, unit);
          if (css) el.style.setProperty(name, css);
          else {
            el.style.removeProperty(name);
            if (v != null && v !== '') warnOnce('css|' + name + '|' + String(v).slice(0, 30), 'r4-bind var:' + name + ': valor recusado "' + String(v).slice(0, 40) + '" (só #rrggbb, número com unidade ou palavra simples)');
          }
          return false;
        };
      } else {   // classe:nome:expressão
        const j = rest.indexOf(':'), name = (j < 0 ? '' : rest.slice(0, j)).trim(), expr = j < 0 ? '' : rest.slice(j + 1);
        if (!CLS.test(name)) return bad('nome de classe inválido "' + name + '"');
        const c = compile(expr, 'r4-bind classe:' + name);
        B.deps = c.deps;
        B.apply = vals => { let ok = false; try { ok = !!c.fn(vals); } catch (e) { ok = false; } el.classList.toggle(name, ok); return false; };
      }
      out.push(B);
    });
    return out;
  }
  function exprBinding(el, attr, raw) {
    const c = compile(raw, attr);
    const B = { el, attr, raw, deps: c.deps };
    if (attr === 'r4-show-if') B.apply = vals => { const ok = (() => { try { return !!c.fn(vals); } catch (e) { return false; } })(); if (el.hidden === ok) el.hidden = !ok; return false; };
    else B.apply = vals => {
      let ok = false; try { ok = !!c.fn(vals); } catch (e) { ok = false; }
      const cmp = cmpOf(el);
      if (cmp && typeof cmp.setDisabled === 'function') { if (!!cmp.disabled === ok) { cmp.setDisabled(!ok); return true; } }   // true: valores do form podem mudar → relê
      else if ('disabled' in el) { if (el.disabled === ok) { el.disabled = !ok; return true; } }
      else { el.toggleAttribute('aria-disabled', !ok); el.classList.toggle('r4-disabled', !ok); }
      return false;
    };
    return B;
  }

  /** Onde o elemento busca os valores: r4-scope="#form" (nele ou num ancestral mais próximo que o form) ou o form/item ancestral. */
  const scopeHost = el => { const n = el.closest('.r4-subform,.r4-form,[r4-scope]'); return n && n.hasAttribute('r4-scope') ? n : null; };
  function scopeNode(el) {
    const h = scopeHost(el), s = h && h.getAttribute('r4-scope');
    if (s != null && s.trim()) {
      const id = s.trim().replace(/^#/, ''), c = R4.get(id);
      const n = c && c.el ? c.el : document.getElementById(id);
      return n && (n.classList.contains('r4-form') || n.classList.contains('r4-subform')) ? n : n ? n.querySelector('.r4-form') : null;
    }
    return el.closest('.r4-subform,.r4-form');
  }
  const pending = new Set();
  const SEL = '[r4-bind],[r4-show-if],[r4-enable-if]';
  function bindEl(el) {
    if (bound.has(el) || el.closest('[r4-ignore]')) return;
    const node = scopeNode(el);
    const st = node && stateFor(node);
    if (!st) {
      if (!node && !scopeHost(el)) {
        warnOnce('noform|' + (el.getAttribute('r4-bind') || el.getAttribute('r4-show-if') || el.getAttribute('r4-enable-if') || '').slice(0, 40),
          'r4-bind/r4-show-if/r4-enable-if fora de um <r4-form>: indique o form com r4-scope="#id"');
        return;
      }
      if (pending.size < LIMITS.pending) pending.add(el);   // o form ainda vai aparecer (r4-scope)
      else warnOnce('pend', 'bindings demais esperando o form aparecer (máx. ' + LIMITS.pending + ')');
      return;
    }
    pending.delete(el);
    const list = [];
    if (el.hasAttribute('r4-bind')) list.push(...parseBind(el, el.getAttribute('r4-bind')));
    if (el.hasAttribute('r4-show-if')) list.push(exprBinding(el, 'r4-show-if', el.getAttribute('r4-show-if')));
    if (el.hasAttribute('r4-enable-if')) list.push(exprBinding(el, 'r4-enable-if', el.getAttribute('r4-enable-if')));
    if (liveBindings + list.length > LIMITS.bindings) { warnOnce('limit', 'limite de ' + LIMITS.bindings + ' bindings na página atingido: os demais foram ignorados'); return; }
    bound.set(el, list);
    list.forEach(b => st.add(b));
  }
  /* ---- avisos de digitação nos atributos da camada reativa (r4-show-iff, r4-bnd...) ---- */
  const MINE = ['r4-bind', 'r4-show-if', 'r4-enable-if', 'r4-scope'];
  const KNOWN = new Set(MINE.concat(['r4-click', 'r4-confirm', 'r4-anim', 'r4-delay', 'r4-duration', 'r4-once', 'r4-hover', 'r4-ignore', 'r4-ready', 'r4-anim-ready', 'r4-i18n', 'r4-tip', 'r4-tip-pos']));
  function typos(root) {
    const all = root.querySelectorAll ? root.querySelectorAll('*') : [];
    for (let i = 0; i < all.length; i++) {
      const at = all[i].attributes;
      for (let j = 0; j < at.length; j++) {
        const n = at[j].name;
        if (n.length < 6 || n.charCodeAt(0) !== 114 || !n.startsWith('r4-') || KNOWN.has(n) || warned.has('attr|' + n)) continue;
        const sg = R4.suggest && R4.suggest(n, MINE);
        if (sg) warnOnce('attr|' + n, 'atributo desconhecido "' + n + '" — quis dizer "' + sg + '"?');
      }
    }
  }
  /** Ativa r4-bind / r4-show-if / r4-enable-if dentro de root (chamado pelo R4.scan). */
  function bindAll(root) {
    if (!root || !root.querySelectorAll) return;
    if (root !== document || !bindAll._first) { bindAll._first = true; typos(root); }
    pending.forEach(el => { if (!el.isConnected) pending.delete(el); else bindEl(el); });
    if (root.matches && root.matches(SEL)) bindEl(root);
    root.querySelectorAll(SEL).forEach(bindEl);
  }
  const scan = R4.scan;
  R4.scan = function (root = document) { const r = scan.apply(this, arguments); bindAll(root); return r; };

  /* =====================================================================
   * Documentação (vitrine) e i18n
   * ===================================================================== */
  R4.reactive = { compile, evaluate, bindAll, truthy, limits: LIMITS,
    /** Desliga o estado de um form/item (usado pelo repeater ao remover um item). */
    release(node) { const st = node && states.get(node); st && st.destroy(); },
    stats: () => ({ bindings: liveBindings, pending: pending.size }) };
  R4.module('reactive', R4.reactive, {
    group: 'HTML declarativo', title: 'Estado e bindings (r4-bind)',
    description: 'Cada <r4-form> tem um estado reativo com os valores dos campos por name (atualizado a cada digitação, inclusive colorfield, choice e repeater). Atributos em qualquer elemento — dentro do form ou fora, com r4-scope="#id" — reagem a ele sem JavaScript: r4-bind (texto, valor, atributo, variável CSS, classe), r4-show-if e r4-enable-if. Expressões com mini-parser próprio (sem eval). Atualiza uma vez por quadro e só o que depende do campo alterado.',
    props: [
      { name: 'r4-bind="texto:campo|reserva"', type: 'atributo', desc: 'textContent = valor do campo (lista vira "a, b"; vazio usa a reserva). #campo = quantidade (itens do repeater, letras do texto).' },
      { name: 'r4-bind="valor:campo"', type: 'atributo', desc: 'Copia o valor para um <input> ou campo r4 (setValue).' },
      { name: 'r4-bind="attr:nome:campo|reserva"', type: 'atributo', desc: 'Só title, alt, aria-label, placeholder, href e src (href/src passam por R4.util.safeUrl: javascript:/data:text são recusados).' },
      { name: 'r4-bind="var:--nome:campo[:unidade]"', type: 'atributo', desc: 'style.setProperty com valor revalidado: #rrggbb (normaliza #rgb), número com unidade permitida (px, rem, em, %, vh, vw, deg, ms, s, fr, ch; a unidade opcional é acrescentada a número puro) ou palavra simples (none, auto, bold, center...). Nunca CSS livre.' },
      { name: 'r4-bind="classe:nome:expressão"', type: 'atributo', desc: 'Liga/desliga a classe conforme a expressão. Vários bindings separados por ";" (máx. 20).' },
      { name: 'r4-show-if="expressão"  /  r4-enable-if="expressão"', type: 'atributo', desc: 'Mostra/oculta (hidden) e habilita/desabilita (setDisabled do componente, disabled nativo ou aria-disabled).' },
      { name: 'r4-scope="#idDoForm"', type: 'atributo', desc: 'Liga o elemento (e tudo dentro dele) a um form que não é seu ancestral. Sem ele vale o form (ou o item de repeater) mais próximo.' },
      { name: 'Expressões', type: 'gramática', desc: 'campo (preenchido/verdadeiro) · !campo · campo=valor · campo!=valor · campo>n · campo<n · campo>=n · campo<=n · campo in a,b,c · #campo>2 (quantidade) · && · || · ( ). Valores com espaço ou vírgula: entre aspas. Sem chamadas de função nem acesso a propriedades; máx. 300 caracteres; inválida → falso + aviso único no console.' },
      { name: 'R4.state(form | "#id")', type: 'State', desc: 'get(campo), set(campo, valor), values(), refresh(), on("change", (estado, campos, valores) => ...). Destruído junto com o form.' },
      { name: 'R4.reactive.evaluate(expr, valores) / compile(expr)', type: 'função', desc: 'Avalia/compila uma expressão (útil em testes).' },
      { name: 'Limites', type: 'segurança', desc: '5.000 bindings por página, 20 por atributo, 300 caracteres por expressão, 8 níveis de parênteses, nomes __proto__/constructor/prototype recusados. Dentro de r4-ignore nada é ativado.' }
    ]
  });
  if (R4.i18n) {
    R4.i18n.add('pt-BR', { r4: { yes: 'Sim', form: { saved: 'Alterações salvas.', noObject: 'A resposta não traz um objeto de valores.' } } });
    R4.i18n.add('en', { r4: { yes: 'Yes', form: { saved: 'Changes saved.', noObject: 'The response has no object of values.' } } });
  }
})(window.R4);
