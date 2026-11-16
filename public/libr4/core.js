/**
 * ============================================
 * libr4 / core.js  —  R4 dev
 * ============================================
 * Núcleo da biblioteca: namespace, utilitários, eventos, registro de
 * componentes (xtype) e fábrica `R4.create`. Sem dependências.
 *
 * Padrão (inspirado no ExtJS 3):
 *   R4.define('meuTipo', { config:{...}, build(){...} }, { group, title, description, props })
 *   R4.create({ xtype:'meuTipo', renderTo: document.body })
 *
 * Tudo que é registrado aqui (componentes e módulos) aparece sozinho na vitrine.
 * ============================================
 */
(function (global) {
  'use strict';

  const R4 = global.R4 = {
    version: '2.0.0',
    brand: 'R4 dev',
    registry: {},   // xtype -> { cls, meta }
    modules: {},    // nome  -> { api, meta }
    instances: {},  // id    -> componente
    config: { cryptoKey: null }
  };
  let seq = 0;

  /* ---------- segurança: chaves e URLs ---------- */
  // chaves que, copiadas de dados externos (JSON, atributos), trocariam protótipos
  const BAD_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
  const safeKey = k => !BAD_KEYS.has(k);
  const warn = m => console.warn('[R4] ' + m);
  /**
   * URL segura para navegar/baixar: relativa, #âncora, ?query, http(s), mailto, tel e blob.
   * kind 'img' também aceita data:image/(png|jpeg|gif|webp|avif). Qualquer outro esquema
   * (javascript:, vbscript:, data:text/html, file:...) devolve ''. Espaços/controle dentro do
   * esquema (ex.: "java\tscript:") são considerados, como o navegador faria.
   */
  function safeUrl(u, kind) {
    u = String(u ?? '').trim();
    const t = u.replace(/[\u0000- \u007f-\u009f]/g, '');
    if (!t) return '';
    if (/^(https?|mailto|tel|blob):/i.test(t)) return u;
    if (kind === 'img' && /^data:image\/(png|jpe?g|gif|webp|avif)[;,]/i.test(t)) return u;
    if (/^[a-z][a-z0-9+.-]*:/i.test(t)) return '';
    return u;
  }
  const URL_ATTRS = new Set(['href', 'src', 'action', 'formaction', 'xlink:href', 'poster', 'data', 'srcset', 'background', 'ping']);
  /**
   * setAttribute com proteção: recusa handlers inline (on*) e URLs perigosas em href/src/action...
   * Devolve true se gravou.
   */
  function safeAttr(e, k, v) {
    const n = String(k).toLowerCase();
    if (/^on/.test(n)) { warn('atributo "' + k + '" ignorado (handlers inline não são aceitos; use addEventListener ou r4-click)'); return false; }
    if (n === 'srcdoc') { warn('atributo srcdoc ignorado'); return false; }
    if (URL_ATTRS.has(n) && v !== '') {
      const s = safeUrl(v, n === 'src' || n === 'poster' || n === 'srcset' ? 'img' : '');
      if (!s) { warn('URL insegura recusada em ' + k + ': ' + String(v).slice(0, 60)); return false; }
      v = s;
    }
    e.setAttribute(k, v === true ? '' : v);
    return true;
  }

  /* ---------- HTML confiável: R4.raw / R4.html ---------- */
  // Só instâncias criadas por R4.raw/R4.html valem como HTML; um JSON de API não consegue forjar isso.
  class SafeHtml {
    constructor(h) { this.html = String(h ?? ''); Object.freeze(this); }
    toString() { return this.html; }
  }
  const isRaw = v => v instanceof SafeHtml;
  const escHtml = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  /** Marca uma string como HTML confiável (escrito por você, nunca dado de fora). */
  R4.raw = h => (isRaw(h) ? h : new SafeHtml(h));
  /** Template que ESCAPA cada ${valor} (exceto os já marcados com R4.raw/R4.html; arrays são juntados). */
  R4.html = (strings, ...vals) => {
    const one = v => (isRaw(v) ? v.html : escHtml(v));
    let out = strings[0];
    vals.forEach((v, i) => { out += (Array.isArray(v) ? v.map(one).join('') : one(v)) + strings[i + 1]; });
    return new SafeHtml(out);
  };

  /* ---------- util ---------- */
  const util = {
    uid: (p = 'r4') => p + '-' + (++seq),
    esc: escHtml,
    /** Escapa para usar como argumento de r4-click="acao:..." (tira ; e quebras que encadeariam outras ações). */
    escArg: s => escHtml(String(s ?? '').replace(/[;\r\n]/g, ' ')),
    safeUrl, safeAttr, isRaw,
    /** Põe conteúdo num elemento: Node → anexa; R4.raw/R4.html → HTML; qualquer outra coisa → texto. */
    setContent(e, v) {
      if (v != null && v.nodeType) e.replaceChildren(v);
      else if (isRaw(v)) e.innerHTML = v.html;
      else e.textContent = v == null ? '' : String(v);
      return e;
    },
    /** Ícone numa opção `icon`: nome de R4.icon → SVG; outro texto/emoji → texto (sempre DOM/textContent). Devolve `e`. */
    icon(e, v, o) { if (R4.icon) R4.icon.fill(e, v, o); else e.textContent = v == null ? '' : String(v); return e; },
    /** Tradução com reserva: R4.t (theme.js carrega por último) ou o texto `f`. Resolva em tempo de uso, não no define. */
    T: (k, p, f) => (R4.t ? R4.t(k, p) : f ?? k),
    /**
     * Texto/atributo traduzido que SE ATUALIZA sozinho quando o idioma muda (usa o atributo r4-i18n do R4.i18n):
     * tx(el, 'r4.empty', 'Nenhum registro.') → textContent · tx(el, 'r4.filter', 'Filtrar...', 'placeholder') → atributo.
     */
    tx(e, k, f, attr, p) {
      attr ? e.setAttribute(attr, util.T(k, p, f)) : e.textContent = util.T(k, p, f);
      if (R4.i18n) {
        const tok = (attr ? attr + ':' : '') + k, cur = e.getAttribute('r4-i18n');
        e.setAttribute('r4-i18n', cur ? cur + ';' + tok : tok);
        if (p) e.setAttribute('params', JSON.stringify(p));
      }
      return e;
    },
    debounce(fn, ms = 200) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; },
    isObj: v => v !== null && typeof v === 'object' && !Array.isArray(v),
    /** Mescla recursiva; ignora __proto__/constructor/prototype (dados externos não poluem protótipos). */
    merge(a, b) {
      if (!b || typeof b !== 'object') return a;
      for (const k of Object.keys(b)) {
        if (!safeKey(k)) continue;
        a[k] = util.isObj(b[k]) && util.isObj(a[k]) && Object.prototype.hasOwnProperty.call(a, k) ? util.merge(a[k], b[k]) : b[k];
      }
      return a;
    },
    /** Object.assign que ignora __proto__/constructor/prototype. */
    assign(t, ...srcs) {
      srcs.forEach(s => { if (s && typeof s === 'object') for (const k of Object.keys(s)) if (safeKey(k)) t[k] = s[k]; });
      return t;
    },
    bytes(n) {
      const u = ['B', 'KB', 'MB', 'GB', 'TB']; let i = 0;
      while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
      return (i ? n.toFixed(1) : n) + ' ' + u[i];
    },
    number: (n, d = 2) => Number(n).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d }),
    money: n => Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
    date(v, opts) {   // 'AAAA-MM-DD' é data local (sem deslocar um dia por fuso)
      const m = typeof v === 'string' && /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/.exec(v);
      return (m ? new Date(+m[1], m[2] - 1, +m[3]) : new Date(v)).toLocaleDateString('pt-BR', opts);
    },
    /**
     * Cria elemento: util.el('div', {class:'x', onclick:fn}, 'texto' | [filhos])
     * text → textContent (seguro). html → innerHTML: HTML CONFIÁVEL (nunca dado de fora; use R4.html).
     * onXxx só aceita função (string vira handler inline e é recusada); href/src/action passam por safeUrl.
     */
    el(tag, attrs, kids) {
      const e = document.createElement(tag);
      for (const k in (attrs || {})) {
        const v = attrs[k];
        if (v == null || v === false) continue;
        if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
        else if (k === 'class') e.className = v;
        else if (k === 'text') e.textContent = v;
        else if (k === 'html') e.innerHTML = v;
        else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
        else safeAttr(e, k, v);
      }
      [].concat(kids ?? []).forEach(c => c != null && e.append(c.nodeType ? c : document.createTextNode(c)));
      return e;
    }
  };
  R4.util = util;

  R4.ready = fn => document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', fn) : fn();
  R4.get = id => R4.instances[id];
  const resolve = t => typeof t === 'string' ? document.querySelector(t) : t;
  R4.resolve = resolve;

  /* ---------- Observable ---------- */
  class Observable {
    on(ev, fn, scope) { ((this._ev ||= {})[ev] ||= []).push({ fn, scope }); return this; }
    un(ev, fn) { if (this._ev && this._ev[ev]) this._ev[ev] = this._ev[ev].filter(l => l.fn !== fn); return this; }
    fire(ev, ...args) {
      let ok = true;
      ((this._ev || {})[ev] || []).slice().forEach(l => { if (l.fn.apply(l.scope || this, args) === false) ok = false; });
      return ok;
    }
  }
  R4.Observable = Observable;

  /* ---------- Component base ---------- */
  class Component extends Observable {
    constructor(cfg = {}) {
      super();
      // junta `config` de toda a cadeia de herança (pai -> filho) e depois o cfg do usuário
      const chain = [];
      for (let p = Object.getPrototypeOf(this); p && p !== Object.prototype; p = Object.getPrototypeOf(p))
        if (Object.prototype.hasOwnProperty.call(p, 'config')) chain.unshift(p.config);
      // util.assign ignora __proto__/constructor/prototype vindos de cfg (ex.: JSON de API ou atributos HTML)
      util.assign(this, ...chain.map(c => structuredCloneSafe(c)), cfg);
      this.id = this.id || util.uid(this.xtype || 'cmp');
      R4.instances[this.id] = this;
      (this.listeners ? Object.entries(this.listeners) : []).forEach(([e, f]) => this.on(e, f));
      this.init && this.init();
      if (this.renderTo) this.render(this.renderTo);
    }
    /** Monta no DOM. `target` pode ser seletor ou elemento. */
    render(target) {
      const host = resolve(target);
      if (!host) throw new Error('R4: renderTo não encontrado: ' + target);
      this.el = this.build();
      this.el.id = this.id;
      if (this.domAttrs) for (const k of Object.keys(this.domAttrs)) safeAttr(this.el, k, this.domAttrs[k]);
      this.el.classList.add('r4-cmp');
      if (this.cls) this.el.classList.add(...String(this.cls).split(' '));
      if (this.style) Object.assign(this.el.style, this.style);
      host.appendChild(this.el);
      this.rendered = true;
      this.afterRender && this.afterRender();
      this.fire('render', this);
      return this;
    }
    build() { return util.el('div'); }
    show() { this.el && (this.el.hidden = false); return this; }
    hide() { this.el && (this.el.hidden = true); return this; }
    destroy() {
      if (this._destroyed || !this.fire('beforedestroy', this)) return;
      this._destroyed = true;
      (this._children || []).forEach(c => c.destroy());
      this.el && this.el.remove();
      delete R4.instances[this.id];
      this.fire('destroy', this);
    }
    /** Cria e renderiza os `items` dentro de `target`. */
    renderItems(target, items = this.items, defaultType) {
      this._children = this._children || [];
      (items || []).forEach(it => {
        if (it instanceof Component) { it.render(target); this._children.push(it); return; }
        if (typeof it === 'string') { target.append(it === '->' ? util.el('span', { class: 'r4-fill' }) : util.el('span', { class: 'r4-sep' })); return; }
        const c = R4.create(Object.assign({}, it, { renderTo: null }), defaultType);
        c.render(target);
        this._children.push(c);
      });
    }
  }
  /**
   * Cópia da `config` de cada classe. structuredClone quando existe e a config é clonável; senão (navegador sem ele, ou config com
   * função) uma cópia recursiva só de objetos simples e arrays — funções, nós do DOM, datas e instâncias ficam por referência.
   * Assim duas instâncias nunca compartilham o mesmo array/objeto de configuração padrão.
   */
  function structuredCloneSafe(o) {
    try { return structuredClone(o); } catch (e) { return copiaSimples(o, []); }
  }
  function copiaSimples(v, vistos) {
    if (!v || typeof v !== 'object' || vistos.includes(v)) return v;
    if (Array.isArray(v)) { vistos.push(v); const r = v.map(x => copiaSimples(x, vistos)); vistos.pop(); return r; }
    const p = Object.getPrototypeOf(v);
    if (p !== Object.prototype && p !== null) return v;
    vistos.push(v);
    const r = {};
    for (const k of Object.keys(v)) if (safeKey(k)) r[k] = copiaSimples(v[k], vistos);
    vistos.pop();
    return r;
  }
  R4.Component = Component;
  R4.registry.component = { cls: Component, meta: { hidden: true } };

  /* ---------- registro ---------- */
  /**
   * R4.define(xtype, proto, meta)
   *  proto.extend  -> xtype pai (padrão 'component')
   *  meta          -> { group, title, description, props:[{name,type,default,desc}], events:[...] }
   */
  R4.define = function (xtype, proto, meta = {}) {
    const parent = (R4.registry[proto.extend || 'component'] || {}).cls;
    if (!parent) throw new Error('R4.define: pai desconhecido "' + proto.extend + '"');
    const cls = class extends parent {};
    const { extend, ...body } = proto;
    Object.defineProperty(cls.prototype, 'xtype', { value: xtype, writable: true, configurable: true });
    Object.defineProperties(cls.prototype, Object.getOwnPropertyDescriptors(body));
    R4.registry[xtype] = { cls, meta: Object.assign({ group: 'Componentes', title: xtype }, meta) };
    return cls;
  };

  /** R4.create({xtype:'button', ...}) -> instância (renderiza se tiver renderTo) */
  R4.create = function (cfg, defaultType = 'panel') {
    const type = cfg.xtype || defaultType;
    const entry = R4.registry[type];
    if (!entry) throw new Error('R4.create: xtype desconhecido "' + type + '"');
    return new entry.cls(cfg);
  };

  /** Registra um módulo não-visual (crypto, http, util...) para constar na vitrine. */
  R4.module = function (name, api, meta = {}) {
    R4.modules[name] = { api, meta: Object.assign({ group: 'Núcleo', title: 'R4.' + name }, meta) };
    return api;
  };
  R4.module('util', util, {
    title: 'R4.util', description: 'Funções utilitárias de uso geral: formatação pt-BR, debounce, merge profundo, criação de elementos DOM.',
    props: [
      { name: 'el(tag, attrs, kids)', type: 'Element', desc: 'Cria um elemento DOM. attrs aceita class, text (texto seguro), html (HTML CONFIÁVEL — nunca dado de fora), style (objeto) e onXxx (só função). href/src/action passam por safeUrl; on* em texto é recusado.' },
      { name: 'esc(texto)', type: 'string', desc: 'Escapa HTML (& < > " \'). Use em TODO dado que for concatenado em HTML.' },
      { name: 'escArg(texto)', type: 'string', desc: 'Escapa para r4-click="acao:..." (também tira ; e quebras de linha, que encadeariam outras ações).' },
      { name: 'R4.html`<b>${valor}</b>`  /  R4.raw(html)', type: 'HTML confiável', desc: 'R4.html escapa cada ${valor} e devolve HTML marcado como confiável; R4.raw marca uma string sua como HTML. É o que renderer do grid precisa devolver para gerar HTML (string comum vira texto).' },
      { name: 'safeUrl(url[, "img"])', type: 'string', desc: 'Devolve a URL se for relativa, #, http(s), mailto, tel ou blob (com "img": também data:image/png|jpeg|gif|webp|avif); senão "". Usado por goto:, href e src.' },
      { name: 'setContent(el, valor)', type: 'Element', desc: 'Node → anexa; R4.html/R4.raw → HTML; qualquer outro valor → texto.' },
      { name: 'icon(elemento, valor[, opções])', type: 'Element', desc: 'Põe um ícone no elemento: valor que é nome de R4.icon vira SVG; qualquer outro texto/emoji vira texto (textContent). Usado pela opção icon dos componentes.' },
      { name: 'debounce(fn, ms)', type: 'function', desc: 'Atrasa chamadas repetidas.' },
      { name: 'merge(a, b) / assign(alvo, ...fontes)', type: 'object', desc: 'Mescla recursiva / cópia rasa. Ambas ignoram __proto__, constructor e prototype (dados externos não poluem protótipos).' },
      { name: 'bytes(n)', type: 'string', desc: '2048 → "2.0 KB".' },
      { name: 'number(n, casas)', type: 'string', desc: 'Número no formato pt-BR.' },
      { name: 'money(n)', type: 'string', desc: 'Moeda BRL.' },
      { name: 'date(v)', type: 'string', desc: 'Data no formato pt-BR.' }
    ]
  });
})(window);
