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

  /* ---------- util ---------- */
  const util = {
    uid: (p = 'r4') => p + '-' + (++seq),
    esc: s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
    debounce(fn, ms = 200) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; },
    isObj: v => v !== null && typeof v === 'object' && !Array.isArray(v),
    merge(a, b) {
      for (const k in b) a[k] = util.isObj(b[k]) && util.isObj(a[k]) ? util.merge(a[k], b[k]) : b[k];
      return a;
    },
    bytes(n) {
      const u = ['B', 'KB', 'MB', 'GB', 'TB']; let i = 0;
      while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
      return (i ? n.toFixed(1) : n) + ' ' + u[i];
    },
    number: (n, d = 2) => Number(n).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d }),
    money: n => Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
    date: (v, opts) => new Date(v).toLocaleDateString('pt-BR', opts),
    /** Cria elemento: util.el('div', {class:'x', onclick:fn}, 'texto' | [filhos]) */
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
        else e.setAttribute(k, v === true ? '' : v);
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
      Object.assign(this, ...chain.map(c => structuredCloneSafe(c)), cfg);
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
      if (!this.fire('beforedestroy', this)) return;
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
  function structuredCloneSafe(o) { try { return structuredClone(o); } catch (e) { return Object.assign({}, o); } }
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
      { name: 'el(tag, attrs, kids)', type: 'Element', desc: 'Cria um elemento DOM. attrs aceita class, text, html, style (objeto) e onXxx.' },
      { name: 'esc(texto)', type: 'string', desc: 'Escapa HTML.' },
      { name: 'debounce(fn, ms)', type: 'function', desc: 'Atrasa chamadas repetidas.' },
      { name: 'merge(a, b)', type: 'object', desc: 'Mescla objetos recursivamente.' },
      { name: 'bytes(n)', type: 'string', desc: '2048 → "2.0 KB".' },
      { name: 'number(n, casas)', type: 'string', desc: 'Número no formato pt-BR.' },
      { name: 'money(n)', type: 'string', desc: 'Moeda BRL.' },
      { name: 'date(v)', type: 'string', desc: 'Data no formato pt-BR.' }
    ]
  });
})(window);
