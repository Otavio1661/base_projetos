/**
 * ============================================
 * libr4 / ui.js  —  R4 dev
 * ============================================
 * Componentes de interface (grupo "Interface"):
 *   accordion, dropdown, progress, spinner, skeleton, stat, stats, pagination,
 *   breadcrumb, steps, timeline, alert, badge, tag, avatar, emptystate, tooltip
 * Funções globais: R4.notify (notificações empilhadas), R4.mask / R4.unmask
 * (máscara de carregamento), atributo r4-tip="texto" (tooltip por delegação).
 *
 * Todos aceitam as três formas de uso da libr4:
 *   R4.create({ xtype: 'progress', value: 40, renderTo: '#x' })
 *   R4.progress('#x', 40)                       // função pronta
 *   <r4-progress value="40"></r4-progress>      // tag HTML
 *
 * Padrão interno: componentes herdam de `uibase` (oculto), que guarda os
 * listeners globais e timers e os remove em destroy().
 * ============================================
 */
(function (R4) {
  'use strict';
  const U = R4.util, el = U.el;

  /* ---------------------------------------------------------------- *
   * Auxiliares
   * ---------------------------------------------------------------- */
  const isEl = v => !!v && v.nodeType === 1;
  const plain = v => !!v && typeof v === 'object' && !Array.isArray(v) && !v.nodeType;
  const camel = s => s.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
  const clamp = (n, a, b) => Math.min(Math.max(n, a), b);
  const num = (v, d = 0) => { const n = Number(v); return v === '' || v == null || isNaN(n) ? d : n; };
  const sr = text => el('span', { class: 'r4-sr', text });
  const reduced = () => { try { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return false; } };
  const svg = (tag, attrs) => { const e = document.createElementNS('http://www.w3.org/2000/svg', tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; };
  const elOf = t => isEl(t) ? t : (t && isEl(t.el)) ? t.el : typeof t === 'string' ? document.querySelector(t) : null;

  const VARIANTS = ['default', 'primary', 'ok', 'warn', 'err', 'info'];
  const ALIAS = { success: 'ok', sucesso: 'ok', warning: 'warn', aviso: 'warn', error: 'err', erro: 'err', danger: 'err', perigo: 'err', secondary: 'default', neutral: 'default' };
  const variantOf = v => { v = String(v || 'default').toLowerCase(); v = ALIAS[v] || v; return VARIANTS.includes(v) ? v : 'default'; };
  const ICONS = { info: 'ℹ', ok: '✔', warn: '⚠', err: '✖' };

  /** Só deixa passar URLs de navegação seguras (nada de javascript:, data:, vbscript:). */
  const safeUrl = u => {
    u = String(u == null ? '' : u).trim();
    const t = u.replace(/[\u0000- ]/g, '');
    if (!t) return '';
    if (/^(https?:|mailto:|tel:)/i.test(t)) return u;
    if (/^[a-z][a-z0-9+.-]*:/i.test(t)) return '';
    return u;
  };
  const safeImg = u => {
    u = String(u == null ? '' : u).trim();
    const t = u.replace(/[\u0000- ]/g, '');
    if (!t) return '';
    if (/^data:image\/(png|jpe?g|gif|webp|avif);/i.test(t) || /^blob:/i.test(t) || /^https?:/i.test(t)) return u;
    if (/^[a-z][a-z0-9+.-]*:/i.test(t)) return '';
    return u;
  };

  /** Formata um valor: money | number | percent | bytes | date | (R4.formats.<nome> se existir). */
  function fmt(v, f, dec) {
    if (v === '' || v == null) return '';
    if (!f) return String(v);
    const n = Number(v);
    if (isNaN(n)) return String(v);
    const d = dec >= 0 ? dec : (Number.isInteger(n) ? 0 : 2);
    switch (f) {
      case 'money': return dec >= 0 ? n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: dec, maximumFractionDigits: dec }) : U.money(n);
      case 'number': return U.number(n, d);
      case 'percent': return U.number(n, dec >= 0 ? dec : (Number.isInteger(n) ? 0 : 1)) + '%';
      case 'bytes': return U.bytes(n);
      case 'date': return U.date(v);
      default: return R4.formats && R4.formats[f] ? String(R4.formats[f](v)) : String(v);
    }
  }
  const isoDay = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;
  const toTime = v => { const d = new Date(isoDay.test(v) ? v + 'T00:00:00' : v); return isNaN(d) ? 0 : d.getTime(); };
  const fmtDate = v => { if (v == null || v === '') return ''; return toTime(v) ? U.date(v) : String(v); };

  /** Iniciais de um nome: "Ana Maria de Souza" → "AS"; "Maria" → "M". */
  const PART = new Set(['de', 'da', 'do', 'das', 'dos', 'e']);
  function initials(name) {
    const w = String(name || '').trim().split(/\s+/).filter(x => x && !PART.has(x.toLowerCase()));
    if (!w.length) return '';
    const f = s => Array.from(s)[0].toUpperCase();
    return w.length === 1 ? f(w[0]) : f(w[0]) + f(w[w.length - 1]);
  }
  /** Matiz (0-359, passos de 30) determinístico a partir de um texto. */
  function hue(text) {
    let h = 5381;
    for (const c of String(text || '')) h = ((h << 5) + h + c.codePointAt(0)) | 0;
    return (Math.abs(h) % 12) * 30;
  }
  /** Janela de páginas com reticências: windowPages(10, 20, 1) → [1,'…',9,10,11,'…',20] */
  function windowPages(cur, total, sib = 1) {
    const range = (a, b) => Array.from({ length: Math.max(0, b - a + 1) }, (_, i) => a + i);
    if (total <= sib * 2 + 5) return range(1, total);
    const l = Math.max(cur - sib, 1), r = Math.min(cur + sib, total), n = 3 + 2 * sib;
    const showL = l > 2, showR = r < total - 1;
    if (!showL && showR) return [...range(1, n), '…', total];
    if (showL && !showR) return [1, '…', ...range(total - n + 1, total)];
    return [1, '…', ...range(l, r), '…', total];
  }

  async function fetchJson(url) {
    return R4.http ? R4.http.get(url) : (await fetch(url)).json();
  }
  const rowsOf = r => Array.isArray(r) ? r : (r && (r.retorno || r.data || r.rows || r.items)) || [];

  /** Normaliza um indicador vindo de JSON (kpis.json) para a config de `stat`. */
  function normKpi(o) {
    if (!plain(o)) return {};
    const pick = (a, b) => o[a] !== undefined ? o[a] : o[b];
    const r = { title: pick('title', 'titulo'), value: pick('value', 'valor'), change: pick('change', 'variacao'),
      format: pick('format', 'formato'), icon: pick('icon', 'icone'), changeText: pick('changeText', 'textoVariacao'),
      variant: o.variant, key: o.key !== undefined ? o.key : o.id, invert: o.invert, decimals: o.decimals, prefix: o.prefix, suffix: o.suffix };
    Object.keys(r).forEach(k => r[k] === undefined && delete r[k]);
    return r;
  }

  const BOOLS = new Set(['open', 'disabled', 'divider', 'error', 'closable', 'danger', 'optional', 'active']);
  /** Lê os atributos de um filho estrutural (<r4-item ...>) para um objeto (camelCase, booleanos coeridos). */
  function childCfg(k) {
    const c = {};
    for (const a of k.attributes) {
      const key = a.name.startsWith('r4-') ? a.name : camel(a.name);
      c[key] = BOOLS.has(key) ? (a.value === '' || a.value === 'true' || a.value === '1') : a.value;
    }
    return c;
  }
  const kids = (host, tag) => [...host.children].filter(k => k.localName === tag);

  /* ---------------------------------------------------------------- *
   * uibase — base oculta: guarda listeners globais e timers e os limpa
   * ---------------------------------------------------------------- */
  R4.define('uibase', {
    config: {},
    /** Escuta um evento e registra a remoção automática em destroy(). */
    listen(target, ev, fn, opts) {
      target.addEventListener(ev, fn, opts);
      (this._offs ||= []).push(() => target.removeEventListener(ev, fn, opts));
      return fn;
    },
    /** setTimeout que é cancelado em destroy(). */
    later(fn, ms) {
      const t = setTimeout(() => { this._timers.delete(t); fn(); }, ms);
      (this._timers ||= new Set()).add(t);
      return t;
    },
    cancel(t) { clearTimeout(t); this._timers && this._timers.delete(t); },
    destroy() {
      if (this._dead || !this.fire('beforedestroy', this)) return;
      this._dead = true;
      (this._offs || []).splice(0).forEach(f => f());
      (this._timers || []).forEach(clearTimeout);
      this._timers && this._timers.clear();
      this.onDestroy && this.onDestroy();
      (this._children || []).forEach(c => c.destroy());
      this.el && this.el.remove();
      delete R4.instances[this.id];
      this.fire('destroy', this);
    }
  }, { hidden: true });

  /* ================================================================ *
   * accordion
   * ================================================================ */
  R4.define('accordion', {
    extend: 'uibase',
    config: { items: [], multiple: false, animate: true },
    build() {
      const root = this.root = el('div', { class: 'r4-acc' + (this.animate ? '' : ' r4-acc-still') });
      this.rows = [];
      root.addEventListener('click', ev => {
        const b = ev.target.closest('.r4-acc-btn'), row = b && this.rows.find(r => r.btn === b);
        row && this._set(row, !row.open);
      });
      root.addEventListener('keydown', ev => {
        const b = ev.target.closest && ev.target.closest('.r4-acc-btn');
        if (!b || !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(ev.key)) return;
        const btns = this.rows.map(r => r.btn).filter(x => !x.disabled), i = btns.indexOf(b);
        if (i < 0) return;
        const n = ev.key === 'ArrowDown' ? (i + 1) % btns.length : ev.key === 'ArrowUp' ? (i - 1 + btns.length) % btns.length : ev.key === 'Home' ? 0 : btns.length - 1;
        ev.preventDefault(); btns[n].focus();
      });
      this.items.forEach(it => this._add(it));
      return root;
    },
    _add(it) {
      if (typeof it === 'string') it = { title: it };
      const uid = this.id + '-' + (this._seq = (this._seq || 0) + 1);
      const btn = el('button', { type: 'button', class: 'r4-acc-btn', id: uid + '-h', 'aria-expanded': 'false', 'aria-controls': uid + '-p', disabled: !!it.disabled }, [
        el('span', { class: 'r4-acc-ico', 'aria-hidden': 'true' }), el('span', { class: 'r4-acc-title', text: it.title == null ? '' : it.title })]);
      const body = el('div', { class: 'r4-acc-body' });
      if (it.html != null && it.html !== '') body.innerHTML = it.html; else if (it.text) body.textContent = it.text;
      const panel = el('div', { class: 'r4-acc-panel', id: uid + '-p', role: 'region', 'aria-labelledby': uid + '-h' }, [el('div', { class: 'r4-acc-inner' }, [body])]);
      const item = el('div', { class: 'r4-acc-item' }, [el('h3', { class: 'r4-acc-head' }, [btn]), panel]);
      const row = { el: item, btn, panel, body, open: false, data: it };
      this.rows.push(row);
      this.root.append(item);
      if (it.open) this._set(row, true, true);
      return row;
    },
    _row(i) { return typeof i === 'number' ? this.rows[i] : this.rows.find(r => r === i || r.el === i); },
    _set(row, open, silent) {
      if (!row || row.open === open || (open && row.btn.disabled)) return this;
      const idx = this.rows.indexOf(row);
      if (!silent && !this.fire('beforetoggle', this, idx, open)) return this;
      if (open && !this.multiple) this.rows.forEach(r => r !== row && this._set(r, false, silent));
      row.open = open;
      row.el.classList.toggle('r4-open', open);
      row.btn.setAttribute('aria-expanded', String(open));
      silent || this.fire('toggle', this, idx, open);
      return this;
    },
    open(i) { return this._set(this._row(i), true); },
    close(i) { return this._set(this._row(i), false); },
    toggle(i) { const r = this._row(i); return r ? this._set(r, !r.open) : this; },
    openAll() { this.multiple && this.rows.forEach(r => this._set(r, true)); return this; },
    closeAll() { this.rows.forEach(r => this._set(r, false)); return this; },
    getOpen() { return this.rows.map((r, i) => r.open ? i : -1).filter(i => i >= 0); },
    add(it) { this._add(it); return this; },
    remove(i) {
      const r = this._row(i); if (!r) return this;
      r.el.remove(); this.rows.splice(this.rows.indexOf(r), 1); return this;
    },
    setHtml(i, html) { const r = this._row(i); r && (r.body.innerHTML = html); return this; }
  }, {
    title: 'accordion', group: 'Interface',
    description: 'Seções que expandem e recolhem. Um aberto por vez (ou vários com multiple). Setas, Home e End navegam entre os títulos; animação de altura que respeita prefers-reduced-motion.',
    props: [
      { name: 'items', type: 'Array<{title, html, text, open, disabled}>', default: '[]', desc: 'Seções. html é HTML confiável; text vira texto puro. Em HTML: <r4-item title open>conteúdo</r4-item>.' },
      { name: 'multiple', type: 'boolean', default: 'false', desc: 'Permite várias seções abertas ao mesmo tempo.' },
      { name: 'animate', type: 'boolean', default: 'true', desc: 'Anima a altura (desligada sozinha com prefers-reduced-motion).' },
      { name: 'open(i) / close(i) / toggle(i)', type: 'método', desc: 'Controlam uma seção pelo índice.' },
      { name: 'openAll() / closeAll() / getOpen()', type: 'método', desc: 'Todas as seções / índices abertos.' },
      { name: 'add(item) / remove(i) / setHtml(i, html)', type: 'método', desc: 'Alteram as seções depois de renderizado.' }
    ],
    events: ['beforetoggle', 'toggle', 'render', 'destroy']
  });
  R4.declare('accordion', (host, cfg) => {
    const its = kids(host, 'r4-item');
    if (its.length) cfg.items = its.map(k => Object.assign(childCfg(k), { title: k.getAttribute('title') || '', html: k.innerHTML.trim() }));
    return cfg;
  });
  R4.structural('r4-item', 'r4-step', 'r4-crumb');

  /* ================================================================ *
   * dropdown
   * ================================================================ */
  R4.define('dropdown', {
    extend: 'uibase',
    config: { text: '', icon: '', items: [], variant: 'default', align: 'left', disabled: false, caret: true, menuLabel: '' },
    build() {
      this._norm();
      this.btn = el('button', { type: 'button', class: 'r4-btn r4-dd-btn' + (this.variant !== 'default' ? ' r4-btn-' + this.variant : ''), id: this.id + '-btn',
        'aria-haspopup': 'menu', 'aria-expanded': 'false', 'aria-controls': this.id + '-menu', disabled: !!this.disabled });
      this._label();
      this.btn.addEventListener('click', ev => this.toggle(ev.detail === 0 ? 'first' : false));
      this.btn.addEventListener('keydown', ev => {
        if (ev.key === 'ArrowDown') { ev.preventDefault(); this.open('first'); }
        else if (ev.key === 'ArrowUp') { ev.preventDefault(); this.open('last'); }
        else if (ev.key === 'Escape' && this.isOpen) { ev.preventDefault(); this.close(true); }
      });
      return el('div', { class: 'r4-dd' }, [this.btn]);
    },
    _norm() { this._items = (this.items || []).map(it => typeof it === 'string' ? (it === '-' ? { divider: true } : { text: it }) : it); },
    _label() {
      this.btn.replaceChildren();
      if (this.icon) this.btn.append(el('span', { class: 'r4-ico', 'aria-hidden': 'true', text: this.icon }));
      if (this.text) this.btn.append(el('span', { text: this.text }));
      if (this.caret) this.btn.append(el('span', { class: 'r4-dd-caret', 'aria-hidden': 'true' }));
      if (this.text) this.btn.removeAttribute('aria-label'); else this.btn.setAttribute('aria-label', this.menuLabel || 'Menu');
    },
    _menu() {
      if (this._menuEl) return this._menuEl;
      const m = el('div', { class: 'r4-dd-menu r4-cmp', role: 'menu', id: this.id + '-menu', tabindex: '-1', 'aria-labelledby': this.btn.id, 'data-r4-noinert': '' });
      this._items.forEach((it, i) => {
        if (it.divider) { m.append(el('div', { class: 'r4-dd-sep', role: 'separator' })); return; }
        const href = it.href ? safeUrl(it.href) : '';
        const b = el(href ? 'a' : 'button', { class: 'r4-dd-item' + (it.disabled ? ' r4-dis' : '') + (it.danger ? ' r4-dd-danger' : ''), role: 'menuitem', tabindex: '-1', 'data-i': i,
          href: href || null, type: href ? null : 'button', disabled: !href && it.disabled, 'aria-disabled': it.disabled ? 'true' : null,
          'r4-click': it['r4-click'] || null, 'r4-confirm': it['r4-confirm'] || null }, [
          el('span', { class: 'r4-dd-ico', 'aria-hidden': 'true', text: it.icon || '' }), el('span', { class: 'r4-dd-txt', text: it.text == null ? '' : it.text })]);
        m.append(b);
      });
      m.addEventListener('click', ev => {
        const b = ev.target.closest('.r4-dd-item'); if (!b) return;
        if (b.classList.contains('r4-dis')) { ev.preventDefault(); return; }
        const it = this._items[+b.dataset.i];
        it.handler && it.handler.call(this, it, ev);
        this.fire('select', this, it);
        this.close(true);
      });
      m.addEventListener('keydown', ev => {
        const items = this._enabled(), n = items.length, i = items.indexOf(document.activeElement);
        if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); this.close(true); return; }
        if (ev.key === 'Tab') { this.close(true); return; }
        if (ev.key === ' ' && document.activeElement && document.activeElement.localName === 'a') { ev.preventDefault(); document.activeElement.click(); return; }
        if (!n) return;
        let t = -1;
        if (ev.key === 'ArrowDown') t = (i + 1) % n;
        else if (ev.key === 'ArrowUp') t = i <= 0 ? n - 1 : i - 1;
        else if (ev.key === 'Home') t = 0;
        else if (ev.key === 'End') t = n - 1;
        else if (ev.key.length === 1 && /\S/.test(ev.key) && !ev.ctrlKey && !ev.metaKey && !ev.altKey) {   // digitar uma letra salta para o item
          const c = ev.key.toLowerCase();
          for (let k = 1; k <= n; k++) { const x = items[(i + k) % n]; if (x.textContent.trim().toLowerCase().startsWith(c)) { t = items.indexOf(x); break; } }
        }
        if (t >= 0) { ev.preventDefault(); items[t].focus(); }
      });
      return (this._menuEl = m);
    },
    _enabled() { return this.menu ? [...this.menu.querySelectorAll('.r4-dd-item:not(.r4-dis)')] : []; },
    /** Posiciona o menu abaixo do botão; inverte para cima / alinha à direita se faltar espaço. */
    _place() {
      const m = this.menu; if (!m || !this.btn.isConnected) { this.isOpen && this.close(); return; }
      const r = this.btn.getBoundingClientRect(), vw = document.documentElement.clientWidth || window.innerWidth, vh = window.innerHeight;
      m.style.maxHeight = ''; m.style.minWidth = Math.max(r.width, 160) + 'px'; m.classList.remove('r4-up');
      const mw = m.offsetWidth, mh = m.offsetHeight;
      let left = this.align === 'right' ? r.right - mw : r.left;
      left = clamp(left, 8, Math.max(8, vw - mw - 8));
      const below = vh - r.bottom - 8, above = r.top - 8;
      let top = r.bottom + 4;
      if (mh > below && above > below) {
        const h = Math.min(mh, above); top = r.top - h - 4; m.classList.add('r4-up');
        if (mh > above) m.style.maxHeight = h + 'px';
      } else if (mh > below) m.style.maxHeight = Math.max(80, below) + 'px';
      m.style.left = left + 'px'; m.style.top = Math.max(4, top) + 'px';
    },
    open(focus) {
      if (this.disabled || this.isOpen || !this.rendered) return this;
      if (!this.fire('beforeopen', this)) return this;
      const m = this.menu = this._menu();
      document.body.append(m);
      this.isOpen = true;
      this.btn.setAttribute('aria-expanded', 'true'); this.el.classList.add('r4-open');
      this._place();
      const off = this._off = [];
      const bind = (t, e, f, o) => { t.addEventListener(e, f, o); off.push(() => t.removeEventListener(e, f, o)); };
      const away = ev => { if (!this.el.contains(ev.target) && !m.contains(ev.target)) this.close(); };
      bind(document, 'mousedown', away, true); bind(document, 'touchstart', away, true); bind(document, 'focusin', away);
      bind(window, 'resize', () => this._place()); bind(window, 'scroll', () => this._place(), true);
      const items = this._enabled();
      if (focus && items.length) items[focus === 'last' ? items.length - 1 : 0].focus(); else m.focus({ preventScroll: true });
      this.fire('open', this);
      return this;
    },
    close(refocus) {
      if (!this.isOpen) return this;
      this.isOpen = false;
      (this._off || []).splice(0).forEach(f => f());
      this.menu && this.menu.remove();
      this.btn.setAttribute('aria-expanded', 'false'); this.el && this.el.classList.remove('r4-open');
      refocus && this.btn.focus();
      this.fire('close', this);
      return this;
    },
    toggle(focus) { return this.isOpen ? this.close(true) : this.open(focus); },
    setItems(items) {
      const was = this.isOpen; was && this.close();
      this.items = items; this._norm(); this._menuEl = null; this.menu = null;
      was && this.open();
      return this;
    },
    setText(t) { this.text = t; this._label(); return this; },
    setDisabled(d) { this.disabled = !!d; this.btn.disabled = !!d; this.disabled && this.close(); return this; },
    onDestroy() { this.isOpen = false; (this._off || []).splice(0).forEach(f => f()); this.menu && this.menu.remove(); }
  }, {
    title: 'dropdown', group: 'Interface',
    description: 'Botão com menu suspenso. Teclado: ↑ ↓ Home End navegam, Enter/Espaço ativam, Esc fecha, letra salta para o item. Fecha ao clicar fora e nunca vaza da tela (inverte para cima ou alinha à direita).',
    props: [
      { name: 'text / icon', type: 'string', default: "''", desc: 'Rótulo e ícone do botão.' },
      { name: 'items', type: "Array<{text, icon, handler, disabled, divider, danger, href, 'r4-click', 'r4-confirm'}>", default: '[]', desc: "Itens do menu; '-' ou {divider:true} é separador. 'r4-click' usa as ações declarativas (toast:, notify:, modal:...). Em HTML: <r4-item text icon disabled divider r4-click>." },
      { name: 'variant', type: "'default'|'primary'|'danger'", default: "'default'", desc: 'Cor do botão.' },
      { name: 'align', type: "'left'|'right'", default: "'left'", desc: 'Lado em que o menu se alinha ao botão.' },
      { name: 'caret', type: 'boolean', default: 'true', desc: 'Mostra a seta do botão.' },
      { name: 'disabled', type: 'boolean', default: 'false', desc: 'Desabilita o botão.' },
      { name: 'menuLabel', type: 'string', default: "''", desc: 'Nome acessível do botão quando não há texto.' },
      { name: 'open() / close() / toggle()', type: 'método', desc: 'Abrem e fecham o menu.' },
      { name: 'setItems(itens) / setText(t) / setDisabled(b)', type: 'método', desc: 'Atualizações em tempo de execução.' }
    ],
    events: ['beforeopen', 'open', 'close', 'select']
  });
  R4.declare('dropdown', (host, cfg) => {
    const its = kids(host, 'r4-item');
    if (its.length) cfg.items = its.map(k => { const c = childCfg(k); if (c.text == null) c.text = k.textContent.trim(); return c; });
    return cfg;
  });

  /* ================================================================ *
   * progress
   * ================================================================ */
  const CIRC = 2 * Math.PI * 45;
  R4.define('progress', {
    extend: 'uibase',
    config: { value: 0, max: 100, type: 'bar', variant: 'primary', label: '', showValue: true, indeterminate: false, striped: false, size: 'md', diameter: 96 },
    build() {
      const circle = this.type === 'circle';
      const root = el('div', { class: 'r4-prog r4-prog-' + (circle ? 'circle' : 'bar') + ' r4-prog-' + this.size + ' r4-v-' + variantOf(this.variant) + (this.striped ? ' r4-prog-striped' : '') });
      this.labelEl = el('span', { class: 'r4-prog-label', id: this.id + '-l' });
      this.valEl = el('span', { class: 'r4-prog-val' });
      if (circle) {
        root.style.setProperty('--r4-prog-d', num(this.diameter, 96) + 'px');
        this.fill = svg('circle', { class: 'r4-prog-fg', cx: 50, cy: 50, r: 45, fill: 'none', 'stroke-linecap': 'round', 'stroke-dasharray': CIRC.toFixed(3) });
        this.bar = el('div', { class: 'r4-prog-ring', role: 'progressbar', 'aria-valuemin': '0' }, [
          (() => { const s = svg('svg', { viewBox: '0 0 100 100', 'aria-hidden': 'true', focusable: 'false' }); s.append(svg('circle', { class: 'r4-prog-bg', cx: 50, cy: 50, r: 45, fill: 'none' }), this.fill); return s; })(),
          this.valEl]);
        root.append(this.bar, this.labelEl);
      } else {
        this.head = el('div', { class: 'r4-prog-head' }, [this.labelEl, this.valEl]);
        this.fill = el('div', { class: 'r4-prog-fill' });
        this.bar = el('div', { class: 'r4-prog-track', role: 'progressbar', 'aria-valuemin': '0' }, [this.fill]);
        root.append(this.head, this.bar);
      }
      this.rootEl = root;
      this._sync();
      return root;
    },
    _pct() { const m = num(this.max, 100); return m > 0 ? clamp(num(this.value) / m, 0, 1) * 100 : 0; },
    _sync() {
      const p = this._pct(), ind = !!this.indeterminate, circle = this.type === 'circle';
      this.rootEl.classList.toggle('r4-prog-ind', ind);
      this.labelEl.textContent = this.label || '';
      this.labelEl.hidden = !this.label;
      this.valEl.textContent = ind ? '' : Math.round(p) + '%';
      this.valEl.hidden = !this.showValue || ind;
      if (this.head) this.head.hidden = !this.label && (!this.showValue || ind);
      if (circle) this.fill.setAttribute('stroke-dashoffset', (CIRC * (1 - (ind ? .25 : p / 100))).toFixed(3));
      else this.fill.style.width = ind ? '' : p + '%';
      const b = this.bar;
      b.setAttribute('aria-valuemax', String(num(this.max, 100)));
      if (this.label) { b.setAttribute('aria-labelledby', this.labelEl.id); b.removeAttribute('aria-label'); } else { b.removeAttribute('aria-labelledby'); b.setAttribute('aria-label', 'Progresso'); }
      if (ind) { b.removeAttribute('aria-valuenow'); b.removeAttribute('aria-valuetext'); b.setAttribute('aria-valuetext', 'Carregando'); }
      else { b.setAttribute('aria-valuenow', String(num(this.value))); b.setAttribute('aria-valuetext', Math.round(p) + '%'); }
      b.setAttribute('aria-busy', ind ? 'true' : 'false');
    },
    setValue(v) {
      const old = this.value; this.value = clamp(num(v), 0, num(this.max, 100)); this.indeterminate = false;
      this._sync();
      if (old !== this.value) { this.fire('change', this, this.value); if (this.value >= num(this.max, 100)) this.fire('complete', this); }
      return this;
    },
    increment(n = 1) { return this.setValue(num(this.value) + n); },
    setMax(m) { this.max = m; this._sync(); return this; },
    setLabel(t) { this.label = t; this._sync(); return this; },
    setIndeterminate(b = true) { this.indeterminate = !!b; this._sync(); return this; },
    setVariant(v) {
      this.rootEl.classList.remove('r4-v-' + variantOf(this.variant)); this.variant = v; this.rootEl.classList.add('r4-v-' + variantOf(v)); return this;
    },
    getPercent() { return this._pct(); }
  }, {
    title: 'progress', group: 'Interface',
    description: 'Barra (ou círculo) de progresso com role="progressbar" e aria-valuenow. Modo indeterminado para quando não se sabe o total.',
    props: [
      { name: 'value / max', type: 'number', default: '0 / 100', desc: 'Valor atual e o valor que representa 100%.' },
      { name: 'type', type: "'bar'|'circle'", default: "'bar'", desc: 'Barra horizontal ou círculo.' },
      { name: 'variant', type: "'default'|'primary'|'ok'|'warn'|'err'|'info'", default: "'primary'", desc: 'Cor.' },
      { name: 'label', type: 'string', default: "''", desc: 'Rótulo (também é o nome acessível).' },
      { name: 'showValue', type: 'boolean', default: 'true', desc: 'Mostra a porcentagem.' },
      { name: 'indeterminate', type: 'boolean', default: 'false', desc: 'Animação contínua, sem valor.' },
      { name: 'striped', type: 'boolean', default: 'false', desc: 'Listras na barra.' },
      { name: 'size', type: "'sm'|'md'|'lg'", default: "'md'", desc: 'Espessura da barra.' },
      { name: 'diameter', type: 'number', default: '96', desc: 'Diâmetro do círculo em px.' },
      { name: 'setValue(v) / increment(n) / setMax(m)', type: 'método', desc: 'Atualizam o progresso.' },
      { name: 'setLabel(t) / setIndeterminate(b) / setVariant(v)', type: 'método', desc: 'Demais ajustes.' }
    ],
    events: ['change', 'complete']
  });

  /* ================================================================ *
   * spinner
   * ================================================================ */
  R4.define('spinner', {
    extend: 'uibase',
    config: { text: '', size: 'md', variant: 'primary', label: 'Carregando' },
    build() {
      const root = el('span', { class: 'r4-spin r4-spin-' + this.size + ' r4-v-' + variantOf(this.variant), role: 'status' }, [el('span', { class: 'r4-spin-ring', 'aria-hidden': 'true' })]);
      root.append(this.text ? el('span', { class: 'r4-spin-text', text: this.text }) : sr(this.label || 'Carregando'));
      return root;
    },
    setText(t) { this.text = t; const x = this.el.querySelector('.r4-spin-text, .r4-sr'); x && x.replaceWith(t ? el('span', { class: 'r4-spin-text', text: t }) : sr(this.label)); return this; }
  }, {
    title: 'spinner', group: 'Interface',
    description: 'Indicador de carregamento giratório com role="status". Para cobrir uma área inteira use R4.mask(alvo, texto).',
    props: [
      { name: 'text', type: 'string', default: "''", desc: 'Texto ao lado do indicador. Sem texto, o rótulo fica só para leitores de tela.' },
      { name: 'size', type: "'sm'|'md'|'lg'", default: "'md'", desc: 'Tamanho.' },
      { name: 'variant', type: "'default'|'primary'|'ok'|'warn'|'err'|'info'", default: "'primary'", desc: 'Cor.' },
      { name: 'label', type: 'string', default: "'Carregando'", desc: 'Texto anunciado por leitores de tela quando não há text.' }
    ]
  });

  /* ================================================================ *
   * skeleton
   * ================================================================ */
  R4.define('skeleton', {
    extend: 'uibase',
    config: { type: 'lines', lines: 3, rows: 3, width: '', height: '', animated: true, label: 'Carregando conteúdo' },
    build() {
      const root = el('div', { class: 'r4-sk r4-sk-' + this.type + (this.animated ? '' : ' r4-sk-still'), role: 'status', 'aria-busy': 'true', 'aria-label': this.label });
      const bar = (w, h) => el('span', { class: 'r4-sk-bar', 'aria-hidden': 'true', style: { width: w || '', height: h || '' } });
      const lines = n => Array.from({ length: Math.max(1, n) }, (_, i) => bar(i === n - 1 && n > 1 ? '60%' : '100%'));
      const avatar = () => el('div', { class: 'r4-sk-row', 'aria-hidden': 'true' }, [
        el('span', { class: 'r4-sk-bar r4-sk-circle' }), el('div', { class: 'r4-sk-col' }, [bar('45%'), bar('80%')])]);
      switch (this.type) {
        case 'avatar': root.append(avatar()); break;
        case 'list': for (let i = 0; i < this.rows; i++) root.append(avatar()); break;
        case 'card':
          root.append(el('span', { class: 'r4-sk-bar r4-sk-img', 'aria-hidden': 'true', style: { height: this.height || '' } }), bar('55%'), ...lines(this.lines)); break;
        case 'rect': root.append(bar(this.width || '100%', this.height || '80px')); break;
        case 'circle': root.append(el('span', { class: 'r4-sk-bar r4-sk-circle', 'aria-hidden': 'true', style: { width: this.width || '48px', height: this.width || '48px' } })); break;
        default: root.append(...lines(num(this.lines, 3)));
      }
      if (this.width && !['rect', 'circle'].includes(this.type)) root.style.width = this.width;
      return root;
    }
  }, {
    title: 'skeleton', group: 'Interface',
    description: 'Placeholders cinza animados para mostrar a forma do conteúdo enquanto ele carrega: linhas, avatar, lista, cartão, retângulo, círculo.',
    props: [
      { name: 'type', type: "'lines'|'avatar'|'list'|'card'|'rect'|'circle'", default: "'lines'", desc: 'Formato do placeholder.' },
      { name: 'lines', type: 'number', default: '3', desc: 'Linhas (lines e card).' },
      { name: 'rows', type: 'number', default: '3', desc: 'Itens da lista (type list).' },
      { name: 'width / height', type: 'string', default: "''", desc: 'Tamanho CSS (ex.: "200px", "50%").' },
      { name: 'animated', type: 'boolean', default: 'true', desc: 'Brilho em movimento (desligado com prefers-reduced-motion).' },
      { name: 'label', type: 'string', default: "'Carregando conteúdo'", desc: 'Texto para leitores de tela.' }
    ]
  });

  /* ================================================================ *
   * stat + stats
   * ================================================================ */
  R4.define('stat', {
    extend: 'uibase',
    config: { title: '', value: '', format: '', decimals: -1, change: '', changeText: '', invert: false, icon: '', variant: 'default', src: '', key: '', prefix: '', suffix: '' },
    build() {
      const root = el('div', { class: 'r4-stat r4-v-' + variantOf(this.variant), role: 'group', 'aria-labelledby': this.id + '-t' });
      this.titleEl = el('span', { class: 'r4-stat-title', id: this.id + '-t' });
      this.iconEl = el('span', { class: 'r4-stat-icon', 'aria-hidden': 'true' });
      this.valueEl = el('div', { class: 'r4-stat-value' });
      this.changeEl = el('span', { class: 'r4-stat-change' });
      this.noteEl = el('span', { class: 'r4-stat-note' });
      this.foot = el('div', { class: 'r4-stat-foot' }, [this.changeEl, this.noteEl]);
      root.append(el('div', { class: 'r4-stat-head' }, [this.titleEl, this.iconEl]), this.valueEl, this.foot);
      this._sync();
      return root;
    },
    afterRender() { this.src && this.load(); },
    _sync() {
      this.titleEl.textContent = this.title || '';
      this.iconEl.textContent = this.icon || ''; this.iconEl.hidden = !this.icon;
      const v = this.loading ? '…' : this.value === '' || this.value == null ? '—' : fmt(this.value, this.format, this.decimals);
      this.valueEl.textContent = (this.loading ? '' : this.prefix || '') + v + (this.loading ? '' : this.suffix || '');
      const c = this.change === '' || this.change == null ? null : Number(this.change);
      const has = c != null && !isNaN(c);
      this.changeEl.hidden = !has; this.noteEl.textContent = this.changeText || ''; this.noteEl.hidden = !this.changeText;
      this.foot.hidden = !has && !this.changeText;
      if (has) {
        const dir = c > 0 ? 'up' : c < 0 ? 'down' : 'flat', good = dir === 'flat' ? null : (dir === 'up') !== !!this.invert;
        this.changeEl.className = 'r4-stat-change r4-' + (good === null ? 'flat' : good ? 'pos' : 'neg') + ' r4-' + dir;
        this.changeEl.replaceChildren(el('span', { class: 'r4-stat-arrow', 'aria-hidden': 'true', text: dir === 'up' ? '▲' : dir === 'down' ? '▼' : '■' }),
          sr(dir === 'up' ? 'Aumento de ' : dir === 'down' ? 'Queda de ' : 'Sem variação: '), document.createTextNode(U.number(Math.abs(c), Number.isInteger(c) ? 0 : 1) + '%'));
      }
      this.el && this.el.setAttribute('aria-busy', this.loading ? 'true' : 'false');
    },
    /** Atualiza com um objeto { title, value, change, format... } (aceita os campos de kpis.json). */
    setData(o) { Object.assign(this, normKpi(o)); this._sync(); return this; },
    setValue(v) { this.value = v; this._sync(); return this; },
    /** Busca this.src (array de indicadores ou objeto); `key` escolhe um pelo id. */
    async load() {
      if (!this.src) return this;
      this.loading = true; this._sync();
      try {
        const r = await fetchJson(this.src);
        if (this._dead) return this;
        const rows = rowsOf(r), row = this.key ? rows.find(x => String(x.id !== undefined ? x.id : x.key) === String(this.key)) : (rows[0] || (plain(r) ? r : null));
        this.loading = false;
        if (row) this.setData(row); else this._sync();
        this.fire('load', this, row);
      } catch (e) { if (this._dead) return this; this.loading = false; this._sync(); this.fire('loaderror', this, e); }
      return this;
    },
    reload() { return this.load(); }
  }, {
    title: 'stat', group: 'Interface',
    description: 'Cartão de indicador (KPI): título, valor formatado e variação com seta e cor. Aceita src com JSON no formato de kpis.json.',
    props: [
      { name: 'title', type: 'string', default: "''", desc: 'Nome do indicador.' },
      { name: 'value', type: 'number|string', default: "''", desc: 'Valor.' },
      { name: 'format', type: "'money'|'number'|'percent'|'bytes'|'date'", default: "''", desc: 'Formatação pt-BR do valor (usa R4.util; formatos extras de R4.formats também valem).' },
      { name: 'decimals', type: 'number', default: '-1', desc: 'Casas decimais (-1 = automático).' },
      { name: 'change', type: 'number', default: "''", desc: 'Variação em %: positiva (verde, ▲) ou negativa (vermelha, ▼).' },
      { name: 'invert', type: 'boolean', default: 'false', desc: 'Inverte as cores da variação (quando queda é bom, como cancelamentos).' },
      { name: 'changeText', type: 'string', default: "''", desc: 'Texto ao lado da variação ("vs. mês anterior").' },
      { name: 'icon / prefix / suffix', type: 'string', default: "''", desc: 'Ícone no canto e textos antes/depois do valor.' },
      { name: 'variant', type: "'default'|'primary'|'ok'|'warn'|'err'|'info'", default: "'default'", desc: 'Cor de destaque.' },
      { name: 'src / key', type: 'string', default: "''", desc: 'URL JSON (array de { titulo, valor, variacao, formato }); key escolhe o indicador pelo id (senão o primeiro).' },
      { name: 'setData(obj) / setValue(v) / reload()', type: 'método', desc: 'Atualizações.' }
    ],
    events: ['load', 'loaderror']
  });

  R4.define('stats', {
    extend: 'uibase',
    config: { items: [], src: '', minWidth: 200 },
    build() {
      const root = el('div', { class: 'r4-stats' });
      root.style.setProperty('--r4-stat-min', num(this.minWidth, 200) + 'px');
      this.box = root;
      this._fill(this.items);
      return root;
    },
    afterRender() { this.src && this.load(); },
    _fill(list) {
      (this._children || []).splice(0).forEach(c => c.destroy());
      this.items = list;
      this.renderItems(this.box, (list || []).map(k => Object.assign({ xtype: 'stat' }, normKpi(k))), 'stat');
    },
    setItems(list) { this._fill(rowsOf(list)); return this; },
    async load() {
      if (!this.src) return this;
      try {
        const r = await fetchJson(this.src);
        if (this._dead) return this;
        this._fill(rowsOf(r)); this.fire('load', this, this.items);
      } catch (e) { !this._dead && this.fire('loaderror', this, e); }
      return this;
    },
    reload() { return this.load(); }
  }, {
    title: 'stats', group: 'Interface',
    description: 'Grade de cartões stat gerada de uma lista de indicadores (formato de kpis.json) ou de uma URL. R4.stats("#alvo", kpis).',
    props: [
      { name: 'items', type: 'Array<{titulo|title, valor|value, variacao|change, formato|format, icon}>', default: '[]', desc: 'Indicadores. Em HTML: filhos <r4-stat>.' },
      { name: 'src', type: 'string', default: "''", desc: 'URL do JSON com os indicadores.' },
      { name: 'minWidth', type: 'number', default: '200', desc: 'Largura mínima de cada cartão em px (a grade se ajusta sozinha).' },
      { name: 'setItems(lista) / reload()', type: 'método', desc: 'Recria os cartões.' }
    ],
    events: ['load', 'loaderror']
  });
  R4.declare('stats', (host, cfg, h) => {
    const k = [...host.children].filter(h.isTag);
    if (k.length) cfg.items = k.map(x => { const c = h.toCfg(x); delete c.xtype; return c; });
    return cfg;
  });

  /* ================================================================ *
   * pagination
   * ================================================================ */
  R4.define('pagination', {
    extend: 'uibase',
    config: { total: 0, pageSize: 10, page: 1, siblings: 1, info: false, label: 'Paginação' },
    build() {
      const nav = el('nav', { class: 'r4-pgn', 'aria-label': this.label });
      this.list = el('ul', { class: 'r4-pgn-list' });
      this.infoEl = el('span', { class: 'r4-pgn-info', 'aria-live': 'polite' });
      nav.append(this.list, this.infoEl);
      this.page = this._clamp(this.page);
      this.list.addEventListener('click', ev => {
        const b = ev.target.closest('button[data-page]'); if (!b || b.disabled) return;
        const v = b.dataset.page;
        this.setPage(v === 'prev' ? this.page - 1 : v === 'next' ? this.page + 1 : +v);
      });
      nav.addEventListener('keydown', ev => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(ev.key)) return;
        const bs = [...this.list.querySelectorAll('button:not(:disabled)')], i = bs.indexOf(document.activeElement);
        if (i < 0) return;
        const n = ev.key === 'ArrowLeft' ? Math.max(0, i - 1) : ev.key === 'ArrowRight' ? Math.min(bs.length - 1, i + 1) : ev.key === 'Home' ? 0 : bs.length - 1;
        ev.preventDefault(); bs[n].focus();
      });
      this._render();
      return nav;
    },
    pages() { return Math.max(1, Math.ceil(Math.max(0, num(this.total)) / Math.max(1, num(this.pageSize, 10)))); },
    _clamp(p) { return clamp(Math.floor(num(p, 1)), 1, this.pages()); },
    getInfo() {
      const size = Math.max(1, num(this.pageSize, 10)), total = Math.max(0, num(this.total));
      const from = total ? (this.page - 1) * size + 1 : 0;
      return { page: this.page, pageSize: size, total, pages: this.pages(), from, to: Math.min(total, this.page * size), offset: (this.page - 1) * size };
    },
    _render() {
      const focused = this.list.contains(document.activeElement), had = focused && document.activeElement.dataset.page;
      const last = this.pages(), cur = this.page, frag = document.createDocumentFragment();
      const btn = (cls, label, text, page, disabled) => el('li', {}, [el('button', { type: 'button', class: 'r4-pgn-btn ' + cls, 'data-page': page, 'aria-label': label, disabled, 'aria-current': page === String(cur) && cls.includes('r4-cur') ? 'page' : null, text })]);
      frag.append(btn('r4-pgn-nav', 'Página anterior', '‹', 'prev', cur <= 1));
      windowPages(cur, last, Math.max(0, num(this.siblings, 1))).forEach(p => {
        if (p === '…') frag.append(el('li', { class: 'r4-pgn-gap', 'aria-hidden': 'true', text: '…' }));
        else frag.append(btn(p === cur ? 'r4-cur' : '', p === cur ? 'Página ' + p + ', atual' : 'Ir para a página ' + p, String(p), String(p), false));
      });
      frag.append(btn('r4-pgn-nav', 'Próxima página', '›', 'next', cur >= last));
      this.list.replaceChildren(frag);
      const i = this.getInfo();
      this.infoEl.hidden = !this.info;
      this.infoEl.textContent = i.total ? i.from + '–' + i.to + ' de ' + i.total : 'Nenhum registro';
      if (focused) { const f = this.list.querySelector('button[data-page="' + had + '"]:not(:disabled)') || this.list.querySelector('.r4-cur'); f && f.focus(); }
    },
    setPage(p, silent) {
      p = this._clamp(p);
      if (p === this.page) return this;
      if (!silent && !this.fire('beforepagechange', this, p, this.page)) return this;
      this.page = p; this._render();
      silent || this.fire('pagechange', this, p, this.getInfo());
      return this;
    },
    next() { return this.setPage(this.page + 1); },
    prev() { return this.setPage(this.page - 1); },
    setTotal(n, pageSize) {
      this.total = n; if (pageSize) this.pageSize = pageSize;
      this.page = this._clamp(this.page); this._render(); return this;
    }
  }, {
    title: 'pagination', group: 'Interface',
    description: 'Paginação independente do grid, com janela de páginas e reticências. Navegação por ←, →, Home e End; página atual com aria-current="page".',
    props: [
      { name: 'total', type: 'number', default: '0', desc: 'Total de registros.' },
      { name: 'pageSize', type: 'number', default: '10', desc: 'Registros por página.' },
      { name: 'page', type: 'number', default: '1', desc: 'Página atual (começa em 1).' },
      { name: 'siblings', type: 'number', default: '1', desc: 'Páginas mostradas de cada lado da atual.' },
      { name: 'info', type: 'boolean', default: 'false', desc: 'Mostra "1–10 de 250".' },
      { name: 'setPage(p) / next() / prev()', type: 'método', desc: 'Navegam.' },
      { name: 'setTotal(n[, pageSize]) / getInfo() / pages()', type: 'método', desc: 'getInfo() devolve {page, pageSize, total, pages, from, to, offset}.' }
    ],
    events: ['beforepagechange', 'pagechange']
  });

  /* ================================================================ *
   * breadcrumb
   * ================================================================ */
  R4.define('breadcrumb', {
    extend: 'uibase',
    config: { items: [], separator: '/', label: 'Trilha de navegação' },
    build() {
      const nav = el('nav', { class: 'r4-bc', 'aria-label': this.label });
      nav.style.setProperty('--r4-bc-sep', JSON.stringify(String(this.separator)));
      this.ol = el('ol', { class: 'r4-bc-list' });
      nav.append(this.ol);
      this.ol.addEventListener('click', ev => {
        const a = ev.target.closest('a[data-i]'); if (!a) return;
        const it = this._its[+a.dataset.i];
        it.handler && it.handler.call(this, it, ev);
        if (!it.href) ev.preventDefault();
        this.fire('itemclick', this, it, +a.dataset.i);
      });
      this._render();
      return nav;
    },
    _render() {
      this._its = (this.items || []).map(it => typeof it === 'string' ? { text: it } : it);
      const n = this._its.length, frag = document.createDocumentFragment();
      this._its.forEach((it, i) => {
        const label = [it.icon ? el('span', { class: 'r4-ico', 'aria-hidden': 'true', text: it.icon }) : null, el('span', { text: it.text == null ? '' : it.text })];
        const href = it.href ? safeUrl(it.href) : '', link = href || it['r4-click'] || it.handler;
        let node;
        if (i === n - 1 || !link) node = el('span', { class: 'r4-bc-cur', 'aria-current': i === n - 1 ? 'page' : null }, label);
        else node = el('a', { class: 'r4-bc-link', href: href || '#', 'data-i': i, 'r4-click': it['r4-click'] || null, 'r4-confirm': it['r4-confirm'] || null }, label);
        frag.append(el('li', { class: 'r4-bc-item' }, [node]));
      });
      this.ol.replaceChildren(frag);
    },
    setItems(items) { this.items = items; this._render(); return this; }
  }, {
    title: 'breadcrumb', group: 'Interface',
    description: 'Trilha de navegação (migalhas). O último item é a página atual (aria-current="page"). Itens aceitam href, r4-click ou handler.',
    props: [
      { name: 'items', type: "Array<string | {text, href, icon, handler, 'r4-click'}>", default: '[]', desc: 'Itens, do mais geral ao mais específico. Em HTML: <r4-crumb href r4-click icon>texto</r4-crumb>.' },
      { name: 'separator', type: 'string', default: "'/'", desc: 'Caractere entre os itens.' },
      { name: 'label', type: 'string', default: "'Trilha de navegação'", desc: 'Nome acessível do <nav>.' },
      { name: 'setItems(itens)', type: 'método', desc: 'Troca a trilha.' }
    ],
    events: ['itemclick']
  });
  R4.declare('breadcrumb', (host, cfg) => {
    const k = kids(host, 'r4-crumb');
    if (k.length) cfg.items = k.map(x => { const c = childCfg(x); if (c.text == null) c.text = x.textContent.trim(); return c; });
    return cfg;
  });

  /* ================================================================ *
   * steps
   * ================================================================ */
  R4.define('steps', {
    extend: 'uibase',
    config: { steps: [], active: 0, clickable: false, orientation: 'horizontal', label: 'Etapas' },
    build() {
      const root = el('div', { class: 'r4-steps r4-steps-' + (this.orientation === 'vertical' ? 'v' : 'h') });
      this.data = (this.steps || []).map(s => typeof s === 'string' ? { title: s } : Object.assign({}, s));
      this.errors = new Set(); this.data.forEach((s, i) => s.error && this.errors.add(i));
      this.finished = false;
      this.active = clamp(Math.floor(num(this.active)), 0, Math.max(0, this.data.length - 1));
      this.list = el('ol', { class: 'r4-steps-list', 'aria-label': this.label });
      root.append(this.list);
      if (this.data.some(s => s.html)) {
        this.bodies = this.data.map(s => el('div', { class: 'r4-steps-panel', role: 'region', 'aria-label': s.title || '', html: s.html || null }));
        root.append(el('div', { class: 'r4-steps-body' }, this.bodies));
      }
      this.list.addEventListener('click', ev => {
        const b = ev.target.closest('button[data-i]'); b && this.goTo(+b.dataset.i);
      });
      this.list.addEventListener('keydown', ev => {
        if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(ev.key)) return;
        const bs = [...this.list.querySelectorAll('button')], i = bs.indexOf(document.activeElement);
        if (i < 0) return;
        const d = ev.key === 'ArrowLeft' || ev.key === 'ArrowUp' ? -1 : 1;
        ev.preventDefault(); bs[clamp(i + d, 0, bs.length - 1)].focus();
      });
      this._render();
      return root;
    },
    _render() {
      const focused = this.list.contains(document.activeElement) && document.activeElement.dataset.i;
      const frag = document.createDocumentFragment();
      this.data.forEach((s, i) => {
        const err = this.errors.has(i), done = !err && (i < this.active || this.finished), cur = i === this.active && !this.finished;
        const state = err ? 'err' : done ? 'done' : cur ? 'cur' : 'todo';
        const inner = [el('span', { class: 'r4-step-dot', 'aria-hidden': 'true', text: err ? '!' : done ? '✓' : String(i + 1) }),
          el('span', { class: 'r4-step-txt' }, [el('span', { class: 'r4-step-title', text: s.title || 'Etapa ' + (i + 1) }), s.text ? el('span', { class: 'r4-step-desc', text: s.text }) : null,
            sr(err ? ' (com erro)' : done ? ' (concluída)' : '')])];
        const box = this.clickable ? el('button', { type: 'button', class: 'r4-step-btn', 'data-i': i }, inner) : el('div', { class: 'r4-step-btn' }, inner);
        frag.append(el('li', { class: 'r4-step r4-step-' + state, 'aria-current': cur ? 'step' : null }, [box]));
      });
      this.list.replaceChildren(frag);
      if (this.bodies) this.bodies.forEach((b, i) => { b.hidden = i !== this.active || this.finished; });
      if (focused) { const f = this.list.querySelector('button[data-i="' + focused + '"]'); f && f.focus(); }
    },
    goTo(i) {
      i = clamp(Math.floor(num(i)), 0, Math.max(0, this.data.length - 1));
      if (i === this.active && !this.finished) return this;
      if (!this.fire('beforestepchange', this, i, this.active)) return this;
      const old = this.active; this.active = i; this.finished = false; this._render();
      this.fire('stepchange', this, i, old);
      return this;
    },
    next() {
      if (this.active >= this.data.length - 1) {
        if (!this.finished && this.data.length && this.fire('beforestepchange', this, this.data.length, this.active)) { this.finished = true; this._render(); this.fire('finish', this); }
        return this;
      }
      return this.goTo(this.active + 1);
    },
    prev() { if (this.finished) { this.finished = false; this._render(); return this; } return this.goTo(this.active - 1); },
    setError(i, flag = true) { flag ? this.errors.add(i) : this.errors.delete(i); this._render(); return this; },
    reset() { this.errors.clear(); this.finished = false; this.active = 0; this._render(); return this; },
    getActive() { return this.active; }
  }, {
    title: 'steps', group: 'Interface',
    description: 'Etapas de um fluxo (wizard) com estados concluído, atual, pendente e erro. Cada etapa pode ter conteúdo (html) mostrado quando está ativa.',
    props: [
      { name: 'steps', type: "Array<string | {title, text, html, error}>", default: '[]', desc: 'Etapas. Em HTML: <r4-step title text error>conteúdo opcional</r4-step>.' },
      { name: 'active', type: 'number', default: '0', desc: 'Etapa atual (começa em 0).' },
      { name: 'clickable', type: 'boolean', default: 'false', desc: 'Permite ir a uma etapa clicando nela (vira botão, com setas no teclado).' },
      { name: 'orientation', type: "'horizontal'|'vertical'", default: "'horizontal'", desc: 'Direção (no celular fica vertical).' },
      { name: 'next() / prev() / goTo(i)', type: 'método', desc: 'Navegam; next() na última etapa conclui tudo e dispara finish.' },
      { name: 'setError(i, bool) / reset() / getActive()', type: 'método', desc: 'Marca erro numa etapa, reinicia e lê a etapa atual.' }
    ],
    events: ['beforestepchange', 'stepchange', 'finish']
  });
  R4.declare('steps', (host, cfg) => {
    const k = kids(host, 'r4-step');
    if (k.length) cfg.steps = k.map(x => ({ title: x.getAttribute('title') || '', text: x.getAttribute('text') || '', error: x.hasAttribute('error'), html: x.innerHTML.trim() }));
    return cfg;
  });

  /* ================================================================ *
   * timeline
   * ================================================================ */
  R4.define('timeline', {
    extend: 'uibase',
    config: { items: [], src: '', order: '', limit: 0, label: 'Linha do tempo' },
    build() {
      this.ol = el('ol', { class: 'r4-tl', 'aria-label': this.label });
      this._render();
      return this.ol;
    },
    afterRender() { this.src && this.load(); },
    _norm(it) {
      if (typeof it === 'string') return { title: it };
      const p = (a, b) => it[a] !== undefined ? it[a] : it[b];
      return { title: p('title', 'titulo'), text: p('text', 'descricao'), date: p('date', 'data'), icon: p('icon', 'icone'), variant: it.variant, html: it.html };
    },
    _render() {
      let list = (this.items || []).map(it => this._norm(it));
      if (this.order) list.sort((a, b) => (toTime(a.date) - toTime(b.date)) * (this.order === 'desc' ? -1 : 1));
      if (this.limit > 0) list = list.slice(0, this.limit);
      const frag = document.createDocumentFragment();
      list.forEach(it => {
        const t = toTime(it.date), d = fmtDate(it.date);
        const body = el('div', { class: 'r4-tl-body' }, [
          el('div', { class: 'r4-tl-head' }, [el('strong', { class: 'r4-tl-title', text: it.title == null ? '' : it.title }),
            d ? el('time', { class: 'r4-tl-date', datetime: t ? (isoDay.test(it.date) ? it.date : new Date(t).toISOString()) : null, text: d }) : null])]);
        if (it.html) body.append(el('div', { class: 'r4-tl-text', html: it.html })); else if (it.text) body.append(el('p', { class: 'r4-tl-text', text: it.text }));
        frag.append(el('li', { class: 'r4-tl-item r4-v-' + variantOf(it.variant) }, [el('span', { class: 'r4-tl-mark', 'aria-hidden': 'true', text: it.icon || '' }), body]));
      });
      if (!list.length) frag.append(el('li', { class: 'r4-tl-empty', text: 'Nenhum evento.' }));
      this.ol.replaceChildren(frag);
    },
    setItems(list) { this.items = rowsOf(list); this._render(); return this; },
    add(it) { this.items = [...this.items, it]; this._render(); return this; },
    async load() {
      if (!this.src) return this;
      try {
        const r = await fetchJson(this.src);
        if (this._dead) return this;
        // dado de servidor nunca vira HTML: o campo html de cada evento é descartado (vale text/descricao)
        this.setItems(rowsOf(r).map(it => (plain(it) && 'html' in it ? Object.assign({}, it, { html: undefined }) : it)));
        this.fire('load', this, this.items);
      } catch (e) { !this._dead && this.fire('loaderror', this, e); }
      return this;
    },
    reload() { return this.load(); }
  }, {
    title: 'timeline', group: 'Interface',
    description: 'Linha do tempo vertical de eventos com data, ícone e cor. Aceita o formato de eventos.json (titulo, descricao, data).',
    props: [
      { name: 'items', type: 'Array<{title|titulo, text|descricao, date|data, icon, variant, html}>', default: '[]', desc: 'Eventos. Em HTML: <r4-item title date icon variant>texto</r4-item>. html é HTML CONFIÁVEL (não use com dado de fora; prefira text).' },
      { name: 'src', type: 'string', default: "''", desc: 'URL JSON com os eventos. Por segurança o campo html dos eventos vindos de src é ignorado (tudo vira texto).' },
      { name: 'order', type: "''|'asc'|'desc'", default: "''", desc: 'Ordena por data (vazio mantém a ordem recebida).' },
      { name: 'limit', type: 'number', default: '0', desc: 'Mostra só os N primeiros (0 = todos).' },
      { name: 'setItems(lista) / add(item) / reload()', type: 'método', desc: 'Atualizam a lista.' }
    ],
    events: ['load', 'loaderror']
  });
  R4.declare('timeline', (host, cfg) => {
    const k = kids(host, 'r4-item');
    if (k.length) cfg.items = k.map(x => { const c = childCfg(x); c.text = c.text != null ? c.text : x.textContent.trim(); return c; });
    return cfg;
  });

  /* ================================================================ *
   * alert
   * ================================================================ */
  R4.define('alert', {
    extend: 'uibase',
    config: { title: '', text: '', html: '', variant: 'info', closable: false, showIcon: true, icon: '', closeAction: 'destroy' },
    build() {
      const v = variantOf(this.variant), urgent = v === 'err' || v === 'warn';
      const root = el('div', { class: 'r4-al r4-v-' + (v === 'default' ? 'info' : v), role: urgent ? 'alert' : 'status' });
      if (this.showIcon) root.append(el('span', { class: 'r4-al-ico', 'aria-hidden': 'true', text: this.icon || ICONS[v] || ICONS.info }));
      const main = el('div', { class: 'r4-al-main' });
      if (this.title) main.append(el('strong', { class: 'r4-al-title', text: this.title }));
      this.body = el('div', { class: 'r4-al-text' });
      if (this.text) this.body.textContent = this.text; else if (this.html) this.body.innerHTML = this.html;
      main.append(this.body);
      root.append(main);
      if (this.closable) {
        root.append(el('button', { type: 'button', class: 'r4-al-x', 'aria-label': 'Fechar aviso', text: '×', onclick: () => this.close() }));
      }
      return root;
    },
    close() {
      if (this._dead || !this.fire('beforeclose', this)) return this;
      this.fire('close', this);
      this.closeAction === 'hide' ? this.hide() : this.destroy();
      return this;
    },
    setText(t) { this.text = t; this.body.textContent = t; return this; }
  }, {
    title: 'alert', group: 'Interface',
    description: 'Aviso em linha, fechável, com ícone e cor por variante. Erros e avisos usam role="alert"; os demais role="status". Função rápida: R4.callout(alvo, texto, {variant}) (R4.alert é só o diálogo).',
    props: [
      { name: 'variant', type: "'info'|'ok'|'warn'|'err'", default: "'info'", desc: 'Tipo do aviso (aceita também success, warning, error).' },
      { name: 'title', type: 'string', default: "''", desc: 'Título em negrito.' },
      { name: 'text / html', type: 'string', default: "''", desc: 'Mensagem em texto puro ou HTML confiável (em tag: o conteúdo).' },
      { name: 'closable', type: 'boolean', default: 'false', desc: 'Mostra o botão ×.' },
      { name: 'showIcon / icon', type: 'boolean / string', default: "true / ''", desc: 'Ícone (padrão por variante).' },
      { name: 'closeAction', type: "'destroy'|'hide'", default: "'destroy'", desc: 'Remove o aviso ou só o esconde.' },
      { name: 'close() / setText(t)', type: 'método', desc: 'Fecha / troca a mensagem.' }
    ],
    events: ['beforeclose', 'close']
  });

  /* ================================================================ *
   * badge / tag
   * ================================================================ */
  R4.define('badge', {
    extend: 'uibase',
    config: { text: '', html: '', variant: 'default', pill: false, dot: false, outline: false, icon: '', count: '', max: 99, label: '' },
    build() {
      const root = el('span', { class: 'r4-bdg r4-v-' + variantOf(this.variant) });
      this.root = root;
      this._fill();
      return root;
    },
    _content() {
      if (this.count !== '' && this.count != null) { const n = Number(this.count); return !isNaN(n) && n > num(this.max, 99) ? this.max + '+' : String(this.count); }
      return this.text;
    },
    _fill() {
      const r = this.root, t = this._content();
      r.classList.toggle('r4-pill', !!this.pill); r.classList.toggle('r4-bdg-out', !!this.outline);
      r.replaceChildren();
      if (this.dot) r.append(el('span', { class: 'r4-bdg-dot', 'aria-hidden': 'true' }));
      if (this.icon) r.append(el('span', { class: 'r4-ico', 'aria-hidden': 'true', text: this.icon }));
      if (t !== '' && t != null) r.append(document.createTextNode(t));
      else if (this.html) r.insertAdjacentHTML('beforeend', this.html);
      const pure = this.dot && t === '' && !this.html;
      r.classList.toggle('r4-bdg-solo', pure);
      if (pure || this.label) r.setAttribute('aria-label', this.label || 'Indicador'); else r.removeAttribute('aria-label');
      if (pure) r.setAttribute('role', 'img'); else r.removeAttribute('role');
      this.xBtn && r.append(this.xBtn);
    },
    setText(t) { this.text = t; this.count = ''; this._fill(); return this; },
    setCount(n) { this.count = n; this._fill(); return this; },
    setVariant(v) { this.root.classList.remove('r4-v-' + variantOf(this.variant)); this.variant = v; this.root.classList.add('r4-v-' + variantOf(v)); return this; }
  }, {
    title: 'badge', group: 'Interface',
    description: 'Etiqueta de status ou contador. Com dot vira um ponto colorido; com count mostra "99+" acima do limite max.',
    props: [
      { name: 'text / html', type: 'string', default: "''", desc: 'Conteúdo (em tag: o conteúdo).' },
      { name: 'variant', type: "'default'|'primary'|'ok'|'warn'|'err'|'info'", default: "'default'", desc: 'Cor.' },
      { name: 'pill', type: 'boolean', default: 'false', desc: 'Bordas totalmente arredondadas.' },
      { name: 'dot', type: 'boolean', default: 'false', desc: 'Ponto colorido antes do texto (ou sozinho, sem texto).' },
      { name: 'outline', type: 'boolean', default: 'false', desc: 'Só contorno, sem preenchimento.' },
      { name: 'count / max', type: 'number', default: "'' / 99", desc: 'Contador; acima de max mostra "99+".' },
      { name: 'icon / label', type: 'string', default: "''", desc: 'Ícone e nome acessível (usado quando só há o ponto).' },
      { name: 'setText(t) / setCount(n) / setVariant(v)', type: 'método', desc: 'Atualizações.' }
    ]
  });

  R4.define('tag', {
    extend: 'badge',
    config: { closable: false, pill: true },
    build() {
      const r = R4.registry.badge.cls.prototype.build.call(this);
      if (this.closable) {
        r.classList.add('r4-tg-closable');
        r.append(this.xBtn = el('button', { type: 'button', class: 'r4-tg-x', 'aria-label': 'Remover ' + (this.text || 'etiqueta'), text: '×', onclick: () => this.close() }));
      }
      return r;
    },
    close() {
      if (this._dead || !this.fire('beforeclose', this)) return this;
      this.fire('close', this); this.destroy(); return this;
    }
  }, {
    title: 'tag', group: 'Interface',
    description: 'Etiqueta (chip) arredondada, opcionalmente removível. Tem as mesmas opções de badge.',
    props: [
      { name: 'text / html / variant / dot / outline / icon', type: 'mixed', desc: 'Iguais às de badge.' },
      { name: 'pill', type: 'boolean', default: 'true', desc: 'Arredondamento total.' },
      { name: 'closable', type: 'boolean', default: 'false', desc: 'Mostra o × que remove a etiqueta.' },
      { name: 'close()', type: 'método', desc: 'Dispara close e remove.' }
    ],
    events: ['beforeclose', 'close']
  });

  /* ================================================================ *
   * avatar
   * ================================================================ */
  R4.define('avatar', {
    extend: 'uibase',
    config: { name: '', src: '', size: 'md', shape: 'circle', status: '', alt: '' },
    build() {
      const px = { xs: 24, sm: 28, md: 40, lg: 56, xl: 80 }[this.size] || (/^[0-9]+$/.test(String(this.size)) ? +this.size : 40);
      const root = el('span', { class: 'r4-av r4-av-' + (['square', 'rounded'].includes(this.shape) ? this.shape : 'circle'), role: 'img', 'aria-label': this.alt || this.name || 'Avatar' });
      root.style.width = root.style.height = px + 'px'; root.style.fontSize = Math.round(px * .4) + 'px';
      root.style.setProperty('--r4-av-h', String(hue(this.name)));
      this.ini = el('span', { class: 'r4-av-ini', 'aria-hidden': 'true', text: initials(this.name) || '?' });
      root.append(this.ini);
      const src = this.src ? safeImg(this.src) : '';
      if (src) {
        this.img = el('img', { class: 'r4-av-img', src, alt: '', 'aria-hidden': 'true', loading: 'lazy', draggable: 'false' });
        this.img.addEventListener('error', () => { this.img && this.img.remove(); this.img = null; root.classList.remove('r4-av-has'); this.fire('imgerror', this); });
        root.classList.add('r4-av-has');
        root.append(this.img);
      }
      if (this.status) root.append(el('span', { class: 'r4-av-st r4-av-st-' + this.status.replace(/[^a-z]/gi, ''), 'aria-hidden': 'true' }));
      return root;
    }
  }, {
    title: 'avatar', group: 'Interface',
    description: 'Avatar com imagem opcional; sem imagem (ou se ela falhar) mostra as iniciais do nome sobre uma cor sempre igual para o mesmo nome.',
    props: [
      { name: 'name', type: 'string', default: "''", desc: 'Nome (gera iniciais e cor determinística).' },
      { name: 'src', type: 'string', default: "''", desc: 'URL da imagem (http, https, data:image ou relativa). Se falhar, usa as iniciais.' },
      { name: 'size', type: "'xs'|'sm'|'md'|'lg'|'xl'|número", default: "'md'", desc: 'Tamanho (número = px).' },
      { name: 'shape', type: "'circle'|'rounded'|'square'", default: "'circle'", desc: 'Formato.' },
      { name: 'status', type: "''|'online'|'busy'|'away'|'offline'", default: "''", desc: 'Bolinha de presença.' },
      { name: 'alt', type: 'string', default: "''", desc: 'Nome acessível (padrão: o nome).' }
    ],
    events: ['imgerror']
  });

  /* ================================================================ *
   * emptystate
   * ================================================================ */
  R4.define('emptystate', {
    extend: 'uibase',
    config: { icon: '📭', title: 'Nada por aqui', text: '', html: '', actionText: '', actionVariant: 'primary', actionClick: '', handler: null, compact: false },
    build() {
      const root = el('div', { class: 'r4-es' + (this.compact ? ' r4-es-compact' : '') });
      if (this.icon) root.append(el('div', { class: 'r4-es-ico', 'aria-hidden': 'true', text: this.icon }));
      if (this.title) root.append(el('h3', { class: 'r4-es-title', text: this.title }));
      if (this.text) root.append(el('p', { class: 'r4-es-text', text: this.text }));
      if (this.html) root.append(el('div', { class: 'r4-es-text', html: this.html }));
      if (this.actionText) {
        this.btn = el('button', { type: 'button', class: 'r4-btn r4-btn-' + (this.actionVariant || 'primary') + ' r4-es-act', 'r4-click': this.actionClick || null, text: this.actionText,
          onclick: ev => { this.fire('action', this, ev); this.handler && this.handler(this, ev); } });
        root.append(this.btn);
      }
      return root;
    }
  }, {
    title: 'emptystate', group: 'Interface',
    description: 'Estado vazio: ícone, título, texto e um botão de ação opcional. Use quando uma lista ou busca não tem resultados.',
    props: [
      { name: 'icon / title / text', type: 'string', default: "'📭' / 'Nada por aqui' / ''", desc: 'Ícone, título e explicação. html aceita HTML confiável.' },
      { name: 'actionText', type: 'string', default: "''", desc: 'Texto do botão de ação (sem texto, não há botão).' },
      { name: 'actionClick', type: 'string', default: "''", desc: 'Valor de r4-click para o botão (ex.: "toast:Criado").' },
      { name: 'handler', type: 'function(cmp, ev)', default: 'null', desc: 'Chamado ao clicar no botão.' },
      { name: 'actionVariant', type: "'default'|'primary'|'danger'", default: "'primary'", desc: 'Cor do botão.' },
      { name: 'compact', type: 'boolean', default: 'false', desc: 'Versão com menos espaçamento.' }
    ],
    events: ['action']
  });

  /* ================================================================ *
   * tooltip — atributo global r4-tip + componente <r4-tooltip>
   * ================================================================ */
  const TIP = { box: null, anchor: null, pending: null, timer: 0, prev: null, pos: ['top', 'bottom', 'left', 'right'] };
  function tipBox() {
    if (!TIP.box || !TIP.box.isConnected) {
      TIP.box = el('div', { class: 'r4-tipbox r4-cmp', role: 'tooltip', id: U.uid('r4-tipbox'), 'data-r4-noinert': '', hidden: true });
      document.body.append(TIP.box);
    }
    return TIP.box;
  }
  function tipPlace(a, t) {
    const r = a.getBoundingClientRect(), tw = t.offsetWidth, th = t.offsetHeight, gap = 8;
    const vw = document.documentElement.clientWidth || window.innerWidth, vh = window.innerHeight;
    let pos = a.getAttribute('r4-tip-pos'); if (!TIP.pos.includes(pos)) pos = 'top';
    const fits = { top: r.top - th - gap >= 0, bottom: r.bottom + th + gap <= vh, left: r.left - tw - gap >= 0, right: r.right + tw + gap <= vw };
    if (!fits[pos]) { const o = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' }[pos]; if (fits[o]) pos = o; }
    let x, y;
    if (pos === 'top' || pos === 'bottom') { x = r.left + r.width / 2 - tw / 2; y = pos === 'top' ? r.top - th - gap : r.bottom + gap; }
    else { y = r.top + r.height / 2 - th / 2; x = pos === 'left' ? r.left - tw - gap : r.right + gap; }
    x = clamp(x, 4, Math.max(4, vw - tw - 4)); y = clamp(y, 4, Math.max(4, vh - th - 4));
    t.dataset.pos = pos; t.style.left = x + 'px'; t.style.top = y + 'px';
    t.style.setProperty('--r4-tip-ax', clamp(r.left + r.width / 2 - x, 10, Math.max(10, tw - 10)) + 'px');
    t.style.setProperty('--r4-tip-ay', clamp(r.top + r.height / 2 - y, 10, Math.max(10, th - 10)) + 'px');
  }
  function tipHide() {
    clearTimeout(TIP.timer); TIP.pending = null;
    if (TIP.anchor) {
      const a = TIP.anchor;
      TIP.prev == null ? a.removeAttribute('aria-describedby') : a.setAttribute('aria-describedby', TIP.prev);
      TIP.anchor = null;
    }
    if (TIP.box) TIP.box.hidden = true;
  }
  function tipShow(a) {
    const text = a.getAttribute('r4-tip');
    if (!text || !a.isConnected) return;
    tipHide();
    const t = tipBox();
    t.textContent = text; t.hidden = false;
    TIP.anchor = a; TIP.prev = a.getAttribute('aria-describedby');
    a.setAttribute('aria-describedby', [TIP.prev, t.id].filter(Boolean).join(' '));
    tipPlace(a, t);
  }
  const tipAnchor = ev => { const n = ev.target; return n && n.closest ? n.closest('[r4-tip]') : null; };
  const TIPH = {
    mouseover(ev) {
      if (TIP.anchor && !TIP.anchor.isConnected) tipHide();
      const a = tipAnchor(ev);
      if (!a || a === TIP.anchor || a === TIP.pending) return;
      tipHide(); TIP.pending = a;
      TIP.timer = setTimeout(() => { TIP.pending = null; tipShow(a); }, 350);
    },
    mouseout(ev) {
      const a = tipAnchor(ev); if (!a) return;
      if (ev.relatedTarget && a.contains(ev.relatedTarget)) return;
      if (a === TIP.anchor || a === TIP.pending) tipHide();
    },
    focusin(ev) { const a = tipAnchor(ev); a && tipShow(a); },
    focusout(ev) { const a = tipAnchor(ev); a && (a === TIP.anchor || a === TIP.pending) && tipHide(); },
    keydown(ev) { if (ev.key === 'Escape' && TIP.anchor) tipHide(); },
    mousedown() { TIP.anchor && tipHide(); },
    scroll() { TIP.anchor && tipHide(); }
  };
  const tipOpts = { scroll: true };
  const tipOn = () => Object.keys(TIPH).forEach(e => document.addEventListener(e, TIPH[e], tipOpts[e]));
  const tipOff = () => Object.keys(TIPH).forEach(e => document.removeEventListener(e, TIPH[e], tipOpts[e]));
  if (R4._tipInstalled) R4._tipInstalled();
  tipOn();
  R4._tipInstalled = () => { tipOff(); tipHide(); TIP.box && TIP.box.remove(); TIP.box = null; };

  /** API do tooltip global: R4.tip.attach(el, texto, pos) / show(el) / hide() / uninstall(). */
  R4.tip = {
    attach(target, text, pos) { target = elOf(target); if (!target) return null; target.setAttribute('r4-tip', text); pos && target.setAttribute('r4-tip-pos', pos); return target; },
    show: a => { a = elOf(a); a && tipShow(a); },
    hide: tipHide,
    uninstall: () => R4._tipInstalled()
  };

  R4.define('tooltip', {
    extend: 'uibase',
    config: { text: '', pos: 'top', html: '', focusable: true },
    build() {
      const e = el('span', { class: 'r4-tipwrap', 'r4-tip': this.text, 'r4-tip-pos': this.pos, tabindex: this.focusable ? '0' : null });
      this.html && (e.innerHTML = this.html);
      return e;
    },
    setText(t) { this.text = t; this.el.setAttribute('r4-tip', t); return this; },
    onDestroy() { TIP.anchor === this.el && tipHide(); }
  }, {
    title: 'tooltip', group: 'Interface',
    description: 'Dica ao passar o mouse ou focar com o teclado. Use o atributo r4-tip="texto" em QUALQUER elemento (r4-tip-pos="top|bottom|left|right"); funciona por delegação de eventos, inclusive em elementos criados depois. role="tooltip" + aria-describedby; Esc fecha. Para o teclado, o elemento precisa ser focável (botão, link ou tabindex="0").',
    props: [
      { name: 'r4-tip="texto"', type: 'atributo HTML', desc: 'Em qualquer elemento: define o texto da dica (sempre texto puro).' },
      { name: 'r4-tip-pos="top|bottom|left|right"', type: 'atributo HTML', desc: 'Posição preferida; inverte sozinha se faltar espaço na tela.' },
      { name: '<r4-tooltip text pos>conteúdo</r4-tooltip>', type: 'componente', desc: 'Envolve o conteúdo e já o torna focável.' },
      { name: 'text / pos / focusable', type: 'string / string / boolean', default: "'' / 'top' / true", desc: 'Configuração do componente.' },
      { name: 'R4.tip.attach(el, texto, pos) / show(el) / hide()', type: 'método', desc: 'Controle por JavaScript.' }
    ]
  });

  /* ================================================================ *
   * R4.notify — notificações empilhadas
   * ================================================================ */
  const NPOS = ['top-right', 'top-left', 'top-center', 'bottom-right', 'bottom-left', 'bottom-center'];
  const NT = { cfg: { position: 'top-right', max: 5, duration: 5000 }, wraps: {} };
  function ntWrap(pos) {
    if (!NT.wraps[pos] || !NT.wraps[pos].isConnected) {
      const w = el('div', { class: 'r4-ntf-wrap r4-cmp r4-ntf-' + pos, role: 'region', 'aria-label': 'Notificações', 'aria-live': 'polite', 'aria-relevant': 'additions', 'data-r4-noinert': '' });
      w._list = [];
      document.body.append(w); NT.wraps[pos] = w;
    }
    return NT.wraps[pos];
  }
  function notify(arg, type) {
    const o = plain(arg) ? U.assign({}, arg) : { text: String(arg == null ? '' : arg) };   // U.assign ignora __proto__
    if (typeof type === 'string') o.type = type; else if (plain(type)) U.assign(o, type);
    const v = variantOf(o.type || 'info'), cfg = NT.cfg;
    const pos = NPOS.includes(o.position) ? o.position : (NPOS.includes(cfg.position) ? cfg.position : 'top-right');
    const duration = o.duration != null ? num(o.duration, cfg.duration) : cfg.duration;
    const wrap = ntWrap(pos), top = pos.startsWith('top');
    const urgent = v === 'err' || v === 'warn';
    const node = el('div', { class: 'r4-ntf r4-v-' + (v === 'default' ? 'info' : v), role: urgent ? 'alert' : 'status', tabindex: '-1' });
    const main = el('div', { class: 'r4-ntf-main' });
    if (o.title) main.append(el('strong', { class: 'r4-ntf-title', text: o.title }));
    if (o.text) main.append(el('div', { class: 'r4-ntf-text', text: o.text }));
    if (o.html) main.append(el('div', { class: 'r4-ntf-text', html: o.html }));
    let h;
    if (Array.isArray(o.actions) && o.actions.length) {
      main.append(el('div', { class: 'r4-ntf-actions' }, o.actions.map(a => el('button', { type: 'button', class: 'r4-ntf-act', 'r4-click': a['r4-click'] || null, text: a.text || 'OK',
        onclick: ev => { a.handler && a.handler(h, ev); if (a.close !== false) h.close(); } }))));
    }
    node.append(el('span', { class: 'r4-ntf-ico', 'aria-hidden': 'true', text: o.icon || ICONS[v === 'default' ? 'info' : v] }), main);
    if (o.closable !== false) node.append(el('button', { type: 'button', class: 'r4-ntf-x', 'aria-label': 'Fechar notificação', text: '×', onclick: () => h.close() }));

    let remaining = duration, started = 0, timer = null, closed = false;
    const start = () => { if (closed || !(remaining > 0) || timer) return; started = Date.now(); timer = setTimeout(() => h.close(), remaining); };
    const pause = () => { if (timer) { clearTimeout(timer); timer = null; remaining -= Date.now() - started; } };
    node.addEventListener('mouseenter', pause); node.addEventListener('mouseleave', start);
    node.addEventListener('focusin', pause);
    node.addEventListener('focusout', ev => { if (!node.contains(ev.relatedTarget)) start(); });
    node.addEventListener('keydown', ev => { if (ev.key === 'Escape') h.close(); });

    h = {
      el: node, type: v, position: pos,
      close(now) {
        if (closed) return h; closed = true;
        clearTimeout(timer); timer = null;
        const i = wrap._list.indexOf(h); i >= 0 && wrap._list.splice(i, 1);
        const done = () => { node.remove(); };
        if (now === true || reduced()) done(); else { node.classList.add('r4-out'); setTimeout(done, 220); }
        typeof o.onClose === 'function' && o.onClose(h);
        return h;
      },
      pause, resume: start
    };
    wrap._list.push(h);
    top ? wrap.prepend(node) : wrap.append(node);
    while (wrap._list.length > Math.max(1, num(cfg.max, 5))) wrap._list[0].close(true);   // limite de pilha: fecha a mais antiga
    start();
    return h;
  }
  notify.config = opts => { if (plain(opts)) { Object.assign(NT.cfg, opts); } return Object.assign({}, NT.cfg); };
  notify.closeAll = () => { Object.values(NT.wraps).forEach(w => { w._list.slice().forEach(x => x.close(true)); w.querySelectorAll('.r4-ntf').forEach(n => n.remove()); }); };
  ['info', 'ok', 'warn', 'err'].forEach(t => { notify[t] = (a, b) => notify(a, Object.assign({}, plain(b) ? b : {}, { type: t })); });
  R4.notify = notify;
  R4.action('notify', a => { const m = /^(info|ok|warn|err)\|([\s\S]*)$/.exec(a); return m ? notify({ text: m[2], type: m[1] }) : notify(a); });

  R4.module('notify', notify, {
    group: 'Interface', title: 'R4.notify',
    description: 'Notificações empilhadas nos cantos da tela. Somem sozinhas, pausam ao passar o mouse ou focar, anunciadas por leitores de tela (aria-live). Também por HTML: r4-click="notify:texto" ou r4-click="notify:ok|Salvo!".',
    props: [
      { name: 'R4.notify(texto | opções)', type: 'handle', desc: 'Mostra a notificação e devolve { el, close(), pause(), resume() }.' },
      { name: 'title / text / html', type: 'string', desc: 'Título e mensagem (text é sempre escapado; html é HTML confiável).' },
      { name: 'type', type: "'info'|'ok'|'warn'|'err'", default: "'info'", desc: 'Cor e ícone (err e warn usam role="alert").' },
      { name: 'duration', type: 'number', default: '5000', desc: 'Milissegundos até sumir (0 = fica até fechar).' },
      { name: 'closable', type: 'boolean', default: 'true', desc: 'Botão ×.' },
      { name: 'actions', type: 'Array<{text, handler, close, "r4-click"}>', desc: 'Botões dentro da notificação (fecham ao clicar, exceto close:false).' },
      { name: 'position', type: "'top-right'|'top-left'|'top-center'|'bottom-right'|'bottom-left'|'bottom-center'", default: "'top-right'", desc: 'Canto onde aparece.' },
      { name: 'onClose', type: 'function(handle)', desc: 'Chamada quando fecha.' },
      { name: 'R4.notify.ok/err/warn/info(texto, opções)', type: 'função', desc: 'Atalhos por tipo.' },
      { name: 'R4.notify.config({position, max, duration})', type: 'função', desc: 'Padrões globais (max = limite de notificações empilhadas; a mais antiga sai).' },
      { name: 'R4.notify.closeAll()', type: 'função', desc: 'Fecha todas.' }
    ]
  });

  /* ================================================================ *
   * R4.mask / R4.unmask — máscara de carregamento
   * ================================================================ */
  const MASKS = new WeakMap();
  function mask(t, text, opts) {
    const host = elOf(t);
    if (!host) throw new Error('R4.mask: alvo não encontrado: ' + t);
    const txt = text == null ? 'Carregando...' : String(text);
    let m = MASKS.get(host);
    if (m) { m.update(txt); return m; }
    const isBody = host === document.body, prev = document.activeElement, label = el('span', { class: 'r4-lmask-text', text: txt });
    label.hidden = !txt;
    const overlay = el('div', { class: 'r4-lmask r4-cmp' + (isBody ? ' r4-lmask-fixed' : ''), role: 'status', 'aria-live': 'polite', tabindex: '-1', 'data-r4-noinert': '' },
      [el('span', { class: 'r4-spin r4-spin-lg r4-v-primary' }, [el('span', { class: 'r4-spin-ring', 'aria-hidden': 'true' })]), label]);
    if (!txt) overlay.append(sr('Carregando'));
    const addClass = !isBody && getComputedStyle(host).position === 'static';
    addClass && host.classList.add('r4-masked');
    const inerted = [...host.children].filter(c => !c.hasAttribute('inert') && !c.hasAttribute('data-r4-noinert'));
    inerted.forEach(c => c.setAttribute('inert', ''));
    host.setAttribute('aria-busy', 'true');
    host.append(overlay);
    const trap = ev => { if (ev.key === 'Tab') ev.preventDefault(); };
    isBody && overlay.addEventListener('keydown', trap);
    if (prev && prev !== host && host.contains(prev) && prev !== document.body) overlay.focus({ preventScroll: true });
    m = {
      el: overlay, host,
      update(tx) { label.textContent = tx; label.hidden = !tx; return m; },
      close() { return unmask(host); },
      _undo() {
        overlay.remove();
        inerted.forEach(c => c.removeAttribute('inert'));
        addClass && host.classList.remove('r4-masked');
        host.removeAttribute('aria-busy');
        if (prev && prev.isConnected && prev !== document.body && (document.activeElement === document.body || document.activeElement === overlay || !document.activeElement)) prev.focus({ preventScroll: true });
      }
    };
    MASKS.set(host, m);
    return m;
  }
  function unmask(t) {
    const host = elOf(t), m = host && MASKS.get(host);
    if (!m) return false;
    MASKS.delete(host); m._undo();
    return true;
  }
  R4.mask = mask; R4.unmask = unmask;
  R4.module('mask', { mask, unmask }, {
    group: 'Interface', title: 'R4.mask / R4.unmask',
    description: 'Cobre uma área (elemento, seletor ou componente) com um indicador de carregamento. O conteúdo de trás recebe inert e aria-busy="true", então não dá para focar nem clicar nele enquanto carrega.',
    props: [
      { name: 'R4.mask(alvo[, texto])', type: 'handle', desc: 'Aplica a máscara (texto padrão "Carregando..."; "" mostra só o círculo). Chamar de novo só troca o texto. Devolve { el, update(texto), close() }.' },
      { name: 'R4.unmask(alvo)', type: 'boolean', desc: 'Remove a máscara, restaura o foco e devolve true se havia máscara.' },
      { name: 'alvo', type: "'#id' | elemento | componente", desc: 'Em document.body a máscara cobre a tela toda e prende o Tab.' }
    ]
  });

  /* ================================================================ *
   * Atalhos R4.<xtype>(alvo, dados) e playground da vitrine
   * ================================================================ */
  const Q = R4.quickMap;
  const urlLike = s => typeof s === 'string' && (/^(\/|https?:\/\/|\.\.?\/)/.test(s) || /\.json(\?|$)/i.test(s));
  Q.accordion = (a, b) => Array.isArray(a) ? Object.assign({ items: a }, b)
    : plain(a) && !('items' in a) && Object.values(a).every(v => typeof v === 'string') ? Object.assign({ items: Object.entries(a).map(([title, html]) => ({ title, html })) }, b) : a;
  Q.dropdown = (a, b) => plain(a) ? a : Object.assign({ text: a }, Array.isArray(b) ? { items: b } : b);
  Q.progress = (a, b) => plain(a) ? a : Object.assign({ value: num(a) }, typeof b === 'string' ? { label: b } : b);
  Q.spinner = (a, b) => plain(a) ? a : Object.assign({ text: a }, b);
  Q.skeleton = (a, b) => plain(a) ? a : Object.assign(typeof a === 'number' ? { lines: a } : { type: a }, b);
  Q.stat = (a, b) => plain(a) ? a : urlLike(a) ? Object.assign({ src: a }, b) : Object.assign({ title: a }, plain(b) ? b : { value: b });
  Q.stats = (a, b) => plain(a) ? a : urlLike(a) ? Object.assign({ src: a }, b) : Object.assign({ items: a }, b);
  Q.pagination = (a, b) => plain(a) ? a : typeof b === 'function' ? { total: num(a), listeners: { pagechange: (c, p, i) => b(p, i) } } : Object.assign({ total: num(a) }, b);
  Q.breadcrumb = (a, b) => Array.isArray(a) ? Object.assign({ items: a }, b) : a;
  Q.steps = (a, b) => Array.isArray(a) ? Object.assign({ steps: a }, typeof b === 'number' ? { active: b } : b) : a;
  Q.timeline = (a, b) => urlLike(a) ? Object.assign({ src: a }, b) : Array.isArray(a) ? Object.assign({ items: a }, b) : a;
  Q.alert = (a, b) => plain(a) ? a : Object.assign({ text: a }, typeof b === 'string' ? { variant: b } : b);
  Q.badge = (a, b) => plain(a) ? a : Object.assign({ text: String(a) }, typeof b === 'string' ? { variant: b } : b);
  Q.tag = Q.badge;
  Q.avatar = (a, b) => plain(a) ? a : Object.assign({ name: a }, typeof b === 'string' ? { src: b } : b);
  Q.emptystate = (a, b) => plain(a) ? a : Object.assign({ title: a }, typeof b === 'string' ? { text: b } : b);
  Q.tooltip = (a, b) => plain(a) ? a : Object.assign({ text: a }, typeof b === 'string' ? { html: b } : b);

  // R4.alert(título, texto) continua sendo SÓ o diálogo (R4.msg.alert). O aviso embutido (componente alert) usa R4.callout:
  // R4.callout('#alvo', 'texto', { variant, title, closable }).
  R4.callout = (alvo, a, b) => R4.create(Object.assign({}, Q.alert(a, b), { xtype: 'alert', renderTo: alvo }));

  const PG = (x, pg) => { R4.registry[x].meta.playground = pg; };
  const VAR = ['default', 'primary', 'ok', 'warn', 'err', 'info'];
  PG('accordion', { html: '<r4-accordion{attrs}>\n  <r4-item title="O que é a libr4?" open>Biblioteca de componentes em JavaScript puro.</r4-item>\n  <r4-item title="Funciona sem JavaScript?">Sim: use as tags <code>&lt;r4-*&gt;</code>.</r4-item>\n  <r4-item title="Item desabilitado" disabled>Não abre.</r4-item>\n</r4-accordion>',
    cfg: { items: [{ title: 'O que é a libr4?', html: 'Biblioteca de componentes em JavaScript puro.', open: true }, { title: 'Funciona sem JavaScript?', html: 'Sim: use as tags.' }] },
    controls: { multiple: false, animate: true } });
  PG('dropdown', { html: '<r4-dropdown{attrs}>\n  <r4-item text="Editar" icon="✎" r4-click="notify:Editar clicado"></r4-item>\n  <r4-item text="Duplicar" icon="⧉" r4-click="toast:Duplicado"></r4-item>\n  <r4-item divider></r4-item>\n  <r4-item text="Arquivar" disabled></r4-item>\n  <r4-item text="Excluir" icon="🗑" danger r4-click="notify:err|Excluído"></r4-item>\n</r4-dropdown>',
    cfg: { items: [{ text: 'Editar', icon: '✎' }, { text: 'Duplicar', icon: '⧉' }, { divider: true }, { text: 'Arquivar', disabled: true }, { text: 'Excluir', icon: '🗑', danger: true }] },
    controls: { text: 'Ações', icon: '', variant: ['default', 'primary', 'danger'], align: ['left', 'right'], caret: true, disabled: false } });
  PG('progress', { html: '<r4-progress{attrs}></r4-progress>', cfg: {},
    controls: { value: 65, max: 100, type: ['bar', 'circle'], variant: ['primary', 'ok', 'warn', 'err', 'info', 'default'], label: 'Envio do arquivo', showValue: true, indeterminate: false, striped: false, size: ['md', 'sm', 'lg'] } });
  PG('spinner', { html: '<r4-spinner{attrs}></r4-spinner>', cfg: {}, controls: { text: 'Carregando dados...', size: ['md', 'sm', 'lg'], variant: ['primary', 'ok', 'warn', 'err', 'info', 'default'] } });
  PG('skeleton', { html: '<r4-skeleton{attrs}></r4-skeleton>', cfg: {},
    controls: { type: ['lines', 'avatar', 'list', 'card', 'rect', 'circle'], lines: 3, rows: 3, width: '', height: '', animated: true } });
  PG('stat', { html: '<r4-stat{attrs}></r4-stat>', cfg: { title: 'Receita', value: 384250.9, format: 'money', change: 12.4 },
    controls: { title: 'Receita', value: '384250.9', format: ['money', 'number', 'percent', 'bytes', ''], change: '12.4', changeText: 'vs. mês anterior', icon: '💰', invert: false, variant: VAR } });
  PG('stats', { html: '<r4-stats{attrs} src="/showcase/vitrineData/kpis.json"></r4-stats>', cfg: { src: '/showcase/vitrineData/kpis.json' }, controls: { minWidth: 200 } });
  PG('pagination', { html: '<r4-pagination{attrs}></r4-pagination>', cfg: {}, controls: { total: 250, pageSize: 10, page: 1, siblings: 1, info: true } });
  PG('breadcrumb', { html: '<r4-breadcrumb{attrs}>\n  <r4-crumb href="#" r4-click="toast:Início">Início</r4-crumb>\n  <r4-crumb href="#" r4-click="toast:Cadastros">Cadastros</r4-crumb>\n  <r4-crumb>Clientes</r4-crumb>\n</r4-breadcrumb>',
    cfg: { items: [{ text: 'Início', href: '#' }, { text: 'Cadastros', href: '#' }, { text: 'Clientes' }] }, controls: { separator: ['/', '›', '>', '•', '|'] } });
  PG('steps', { html: '<r4-steps{attrs}>\n  <r4-step title="Conta" text="Dados de acesso"></r4-step>\n  <r4-step title="Endereço" text="Onde entregar"></r4-step>\n  <r4-step title="Pagamento" text="Forma de pagar"></r4-step>\n  <r4-step title="Revisão"></r4-step>\n</r4-steps>',
    cfg: { steps: [{ title: 'Conta' }, { title: 'Endereço' }, { title: 'Pagamento' }, { title: 'Revisão' }] }, controls: { active: 1, clickable: true, orientation: ['horizontal', 'vertical'] } });
  PG('timeline', { html: '<r4-timeline{attrs}>\n  <r4-item title="Pedido criado" date="2026-11-01" icon="🛒">Cliente fez o pedido #1021.</r4-item>\n  <r4-item title="Pagamento aprovado" date="2026-11-02" icon="✔" variant="ok">Cartão final 4242.</r4-item>\n  <r4-item title="Atraso na entrega" date="2026-11-05" icon="⚠" variant="warn">Transportadora informou 2 dias.</r4-item>\n</r4-timeline>',
    cfg: { items: [{ title: 'Pedido criado', date: '2026-11-01', icon: '🛒' }, { title: 'Pagamento aprovado', date: '2026-11-02', variant: 'ok' }] }, controls: { order: ['', 'asc', 'desc'], limit: 0 } });
  PG('alert', { html: '<r4-alert{attrs}>Seus dados foram salvos com sucesso.</r4-alert>', cfg: { html: 'Seus dados foram salvos com sucesso.' },
    controls: { variant: ['info', 'ok', 'warn', 'err'], title: 'Atenção', closable: true, showIcon: true, icon: '' } });
  PG('badge', { html: '<r4-badge{attrs}>Novo</r4-badge>', cfg: { html: 'Novo' },
    controls: { variant: VAR, pill: false, dot: false, outline: false, icon: '', count: '', max: 99 } });
  PG('tag', { html: '<r4-tag{attrs}>Design</r4-tag>', cfg: { html: 'Design' },
    controls: { variant: VAR, closable: true, pill: true, dot: false, outline: false, icon: '' } });
  PG('avatar', { html: '<r4-avatar{attrs}></r4-avatar>', cfg: {}, controls: { name: 'Maria Souza', src: '', size: ['md', 'xs', 'sm', 'lg', 'xl', '64'], shape: ['circle', 'rounded', 'square'], status: ['', 'online', 'busy', 'away', 'offline'] } });
  PG('emptystate', { html: '<r4-emptystate{attrs}></r4-emptystate>', cfg: {},
    controls: { icon: '📭', title: 'Nenhum cliente encontrado', text: 'Tente outro termo de busca ou cadastre um novo cliente.', actionText: 'Novo cliente', actionClick: 'notify:Abrir cadastro', actionVariant: ['primary', 'default', 'danger'], compact: false } });
  PG('tooltip', { html: '<r4-tooltip{attrs}><r4-button>Passe o mouse ou use Tab</r4-button></r4-tooltip>', cfg: { html: 'Passe o mouse ou use Tab' },
    controls: { text: 'Dica de ferramenta', pos: ['top', 'bottom', 'left', 'right'], focusable: true } });

  /** Auxiliares expostos (úteis em testes e em outros módulos). */
  R4.ui = { initials, hue, safeUrl, safeImg, format: fmt, windowPages, normKpi };
})(window.R4);
