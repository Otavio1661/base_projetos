/**
 * ============================================
 * libr4 / admin.js  —  R4 dev
 * ============================================
 * Peças para painéis administrativos montados só com tags:
 *   <r4-repeater>      lista editável de itens (horários, links...) — valor = array de objetos
 *   <r4-colorfield>    cor #rrggbb com amostra, sugestões e contraste WCAG ao vivo
 *   <r4-choice>        opções em cartões (radio acessível) com miniatura/ícone/SVG
 *   <r4-phonepreview>  moldura de celular com <iframe> da prévia, alimentada pelo estado do form (postMessage)
 * e o <r4-filedrop name> como campo de form (imagem atual, upload-url, remover).
 * Todos os campos participam do <r4-form> (name, getValue/setValue/validate, evento change) e do estado
 * reativo (R4.state, r4-bind). Sem dependências, sem eval; nada de dado vira HTML.
 * ============================================
 */
(function (R4) {
  'use strict';
  const U = R4.util, { el } = U, T = U.T;
  const G = 'Formulários';
  const BAD = new Set(['__proto__', 'constructor', 'prototype']);
  const FIELD = R4.registry.field.cls.prototype;
  const bool = v => v === true || v === 'true' || v === '' || v === '1' || v === 1;
  const fmt = (s, o) => String(s).replace(/\{([\w.-]+)\}/g, (_, k) => (o && o[k] != null && typeof o[k] !== 'object' ? String(o[k]) : ''));
  const ico = n => el('span', { class: 'r4-ico', 'aria-hidden': 'true' }, [R4.icon(n)]);
  const warned = new Set();
  const warnOnce = (k, m) => { if (!warned.has(k)) { warned.add(k); R4.warn(m); } };
  /** destrói os componentes montados dentro de `node` (de dentro para fora) */
  const destroyIn = (node, except) => [...node.querySelectorAll('.r4-cmp')].reverse().forEach(n => {
    const c = R4.instances[n.id];
    if (c && c !== except && c.el === n && !c._destroyed) c.destroy();
  });

  /* =====================================================================
   * repeater
   * ===================================================================== */
  const HARD_MAX = 100, MAX_TEMPLATE = 20000;
  let itemSeq = 0;
  R4.structural('r4-item-template');

  R4.define('repeater', {
    extend: 'field',
    config: { min: 0, max: 0, template: '', fields: [], itemTitle: '', addText: '', emptyText: '', sortable: true, maxFields: 40 },
    _reqKey: 'required',
    build() {
      const ids = this._ids();
      this._items = [];
      this.listEl = el('div', { class: 'r4-rep-list', role: 'list' });
      this.emptyEl = el('div', { class: 'r4-rep-empty r4-help', text: this.emptyText || T('r4.repeater.empty', 0, 'Nenhum item.') });
      this.addBtn = el('button', { type: 'button', class: 'r4-btn r4-rep-add', onclick: () => { if (!this.readOnly) this.add(null, true); } },
        [ico('plus'), el('span', { text: this.addText || T('r4.repeater.add', 0, 'Adicionar') })]);
      this.liveEl = el('div', { class: 'r4-rep-live', 'aria-live': 'polite' });
      this.box = el('div', { class: 'r4-rep', id: ids.input, role: 'group', 'aria-labelledby': this.label ? ids.label : null, tabindex: '-1' },
        [this.listEl, this.emptyEl, this.addBtn, this.liveEl]);
      this.listEl.addEventListener('click', ev => this._onClick(ev));
      this.listEl.addEventListener('keydown', ev => {
        if (!ev.altKey || (ev.key !== 'ArrowUp' && ev.key !== 'ArrowDown') || this.readOnly) return;
        const it = this._itemOf(ev.target); if (!it) return;
        ev.preventDefault();
        const i = this._items.indexOf(it);
        this.move(i, i + (ev.key === 'ArrowUp' ? -1 : 1));
        ev.target.focus();
      });
      const upd = ev => {
        const d = ev.detail;
        if (ev.type === 'r4-fieldchange' && d && d.field === this) return;
        const it = this._itemOf(ev.target);
        if (ev.type === 'r4-fieldchange') { ev.stopPropagation(); if (it) this._title(it); this._changed(); }
        else if (it) this._title(it);
      };
      this.listEl.addEventListener('r4-fieldchange', upd);
      this.listEl.addEventListener('input', upd);
      if (bool(this.sortable)) this._dnd();
      return this._wrap(this.box, 'r4-repeater', { labelTag: 'span' });
    },
    afterRender() {
      let v = this.value;
      if (typeof v === 'string') { try { v = v.trim() ? JSON.parse(v) : []; } catch (e) { R4.warn('<r4-repeater>: value não é JSON válido'); v = []; } }
      const go = () => { this.setValue(Array.isArray(v) ? v : []); this._initField(); };
      if (this.el.isConnected) go();
      else {   // montado fora do documento (ex.: aba ainda não anexada): espera entrar para montar os itens
        let n = 0;
        const wait = () => { if (this._destroyed) return; if (this.el.isConnected || ++n > 120) go(); else requestAnimationFrame(wait); };
        Promise.resolve().then(wait);
      }
    },
    _limit() { const m = Math.floor(+this.max); return m > 0 ? Math.min(m, HARD_MAX) : HARD_MAX; },
    _min() { return Math.max(0, Math.min(Math.floor(+this.min) || 0, this._limit())); },
    _itemOf(node) { const n = node && node.closest && node.closest('.r4-rep-item'); return n && n.parentElement === this.listEl ? n._r4sub : null; },
    /** Cria um item (div.r4-subform) com os campos do template e, opcionalmente, valores. */
    _make(values, before) {
      const id = this.id + '-i' + (++itemSeq);
      const titleEl = el('span', { class: 'r4-rep-title', id: id + '-t' });
      const btn = (act, icon) => el('button', { type: 'button', class: 'r4-rep-btn', 'data-act': act }, [ico(icon)]);
      const tools = el('span', { class: 'r4-rep-tools' }, [btn('up', 'arrow-up'), btn('down', 'arrow-down'), btn('remove', 'trash')]);
      const handle = bool(this.sortable) ? el('span', { class: 'r4-rep-handle', draggable: 'true', title: T('r4.repeater.drag', 0, 'Arrastar para reordenar'), 'aria-hidden': 'true' }, [R4.icon('drag')]) : null;
      const head = el('div', { class: 'r4-rep-head' }, [handle, titleEl, tools]);
      const body = el('div', { class: 'r4-rep-body' });
      const node = el('div', { class: 'r4-rep-item r4-subform', role: 'listitem', id, 'aria-labelledby': titleEl.id }, [head, body]);
      const rep = this;
      const it = {
        el: node, body, titleEl, tools, rep, id,
        getFields() { return R4.fieldsIn(node, it); },
        getField(n) { return it.getFields().find(f => f.name === n) || null; },
        getValues(all) {
          const o = {};
          it.getFields().forEach(f => { if (!BAD.has(f.name) && (all || !f.disabled)) o[f.name] = f.getValue(); });
          return o;
        },
        setValues(obj) {
          if (!obj || typeof obj !== 'object') return it;
          it.getFields().forEach(f => { if (Object.prototype.hasOwnProperty.call(obj, f.name) && !BAD.has(f.name)) { f.setValue(obj[f.name]); f.clearError(); } });
          node.dispatchEvent(new CustomEvent('r4-values'));
          rep._title(it);
          return it;
        },
        validate() { let ok = true; const v = it.getValues(true); it.getFields().forEach(f => { if (!f.validate(v)) ok = false; }); return ok; },
        isValid() { const v = it.getValues(true); return it.getFields().every(f => f.disabled || f.isValid(v)); },
        destroy() { if (R4.reactive) R4.reactive.release(node); destroyIn(body); node.remove(); }
      };
      node._r4sub = it;
      before ? this.listEl.insertBefore(node, before) : this.listEl.append(node);
      const tpl = String(this.template || '');
      if (tpl) {
        if (tpl.length > MAX_TEMPLATE) warnOnce('tpl', '<r4-repeater>: template grande demais (máx. ' + MAX_TEMPLATE + ' caracteres)');
        else { body.innerHTML = tpl; R4.scan(body); }
      } else if (Array.isArray(this.fields)) {
        this.fields.forEach(c => { if (c && typeof c === 'object') R4.create(Object.assign({}, R4.fieldCfg ? R4.fieldCfg(c) : c, { renderTo: body }), 'textfield'); });
      }
      const nf = it.getFields().length;
      if (nf > this.maxFields) warnOnce('nf' + this.id, '<r4-repeater>: ' + nf + ' campos por item (recomendado até ' + this.maxFields + ')');
      if (!nf) warnOnce('nf0' + this.id, '<r4-repeater name="' + this.name + '">: o item não tem campos com name (use <r4-item-template> ou fields)');
      if (this.disabled) it.getFields().forEach(f => f.setDisabled && f.setDisabled(true));
      if (values) it.setValues(values);
      return it;
    },
    _title(it) {
      const i = this._items.indexOf(it), n = i + 1;
      let t = this.itemTitle ? fmt(this.itemTitle, it.getValues(true)).replace(/\s+/g, ' ').trim() : '';
      if (!t || /^[\s\-–—·:,;/|]*$/.test(t)) t = T('r4.repeater.item', { n }, 'Item ' + n);
      if (it.titleEl.textContent !== t) it.titleEl.textContent = t;
      return t;
    },
    /** Atualiza títulos, botões (subir/descer/remover/adicionar) e o texto de lista vazia. */
    _refresh() {
      const n = this._items.length, lim = this._limit(), min = this._min(), off = !!(this.disabled || this.readOnly);
      this._items.forEach((it, i) => {
        const t = this._title(it);
        const [up, down, rm] = it.tools.children;
        up.disabled = off || i === 0; down.disabled = off || i === n - 1; rm.disabled = off || n <= min;
        up.setAttribute('aria-label', T('r4.repeater.up', { item: t }, 'Subir ' + t));
        down.setAttribute('aria-label', T('r4.repeater.down', { item: t }, 'Descer ' + t));
        rm.setAttribute('aria-label', T('r4.repeater.remove', { item: t }, 'Remover ' + t));
        up.title = T('r4.repeater.upShort', 0, 'Subir'); down.title = T('r4.repeater.downShort', 0, 'Descer'); rm.title = T('r4.remove', 0, 'Remover');
      });
      this.emptyEl.hidden = n > 0;
      this.addBtn.disabled = off || n >= lim;
      this.addBtn.hidden = min > 0 && min === lim;   // quantidade fixa: sem botão
    },
    relocalize() {
      if (!this.addText && this.addBtn) this.addBtn.lastChild.textContent = T('r4.repeater.add', 0, 'Adicionar');
      if (!this.emptyText && this.emptyEl) this.emptyEl.textContent = T('r4.repeater.empty', 0, 'Nenhum item.');
      this._items && this._refresh();
    },
    _say(t) { this.liveEl.textContent = ''; this.liveEl.textContent = t; },
    _onClick(ev) {
      const b = ev.target.closest && ev.target.closest('[data-act]');
      if (!b || b.disabled) return;
      const it = this._itemOf(b); if (!it) return;
      const i = this._items.indexOf(it), act = b.getAttribute('data-act');
      if (act === 'remove') this.remove(i, true);
      else { this.move(i, act === 'up' ? i - 1 : i + 1); (it.tools.querySelector('[data-act="' + act + '"]:not(:disabled)') || it.tools.querySelector('button:not(:disabled)') || this.addBtn).focus(); }
    },
    /** Adiciona um item (valores opcionais). Devolve o item ou null (no máximo). */
    add(values, focus) {
      if (this._items.length >= this._limit()) return null;
      const it = this._make(values && typeof values === 'object' ? values : null);
      this._items.push(it);
      this._refresh();
      this.fire('add', this, it, this._items.length - 1);
      this._changed();
      if (focus) { const f = it.getFields()[0]; f ? f.focus() : this.addBtn.focus(); this._say(T('r4.repeater.added', { item: it.titleEl.textContent }, it.titleEl.textContent + ' adicionado.')); }
      return it;
    },
    /** Remove o item i (respeita o mínimo). */
    remove(i, focus) {
      const it = this._items[i];
      if (!it || this._items.length <= this._min()) return this;
      const val = it.getValues(), t = it.titleEl.textContent;
      this._items.splice(i, 1); it.destroy();
      this._refresh();
      this.fire('remove', this, val, i);
      this._changed();
      if (focus) {
        const nx = this._items[Math.min(i, this._items.length - 1)];
        ((nx && (nx.tools.querySelector('[data-act="remove"]:not(:disabled)') || nx.tools.querySelector('button:not(:disabled)'))) || (this.addBtn.disabled ? this.box : this.addBtn)).focus();
        this._say(T('r4.repeater.removed', { item: t }, t + ' removido.'));
      }
      return this;
    },
    /** Move o item de `from` para `to`. */
    move(from, to) {
      const n = this._items.length;
      if (from === to || from < 0 || to < 0 || from >= n || to >= n || this.readOnly || this.disabled) return this;
      const [it] = this._items.splice(from, 1);
      this._items.splice(to, 0, it);
      const ref = this._items[to + 1];
      this.listEl.insertBefore(it.el, ref ? ref.el : null);
      this._refresh();
      this.fire('move', this, from, to);
      this._changed();
      this._say(T('r4.repeater.moved', { item: it.titleEl.textContent, n: to + 1 }, it.titleEl.textContent + ' movido para a posição ' + (to + 1) + '.'));
      return this;
    },
    getItems() { return this._items.slice(); },
    count() { return this._items.length; },
    // repeater desabilitado inteiro (ex.: r4-enable-if) mantém os valores dos itens; campo desabilitado DENTRO do item fica de fora
    getValue() { return (this._items || []).map(it => it.getValues(!!this.disabled)); },
    /** Troca os itens (array de objetos; texto JSON também vale). Não dispara change. Máx. `max` (ou 100). */
    setValue(v) {
      if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { v = []; } }
      let list = Array.isArray(v) ? v : [];
      const lim = this._limit();
      if (list.length > lim) { R4.warn('<r4-repeater name="' + this.name + '">: ' + list.length + ' itens recebidos; só os ' + lim + ' primeiros foram usados (max)'); list = list.slice(0, lim); }
      if (!this._items) return this;
      while (this._items.length > list.length) this._items.pop().destroy();
      list.forEach((o, i) => {
        const obj = o && typeof o === 'object' && !Array.isArray(o) ? o : {};
        if (this._items[i]) this._items[i].setValues(obj); else this._items.push(this._make(obj));
      });
      while (this._items.length < this._min()) this._items.push(this._make(null));
      this._refresh();
      return this;
    },
    isEmpty(v = this.getValue()) { return !v || !v.length; },
    _typeCheck(v) {
      const n = v.length, min = this._min(), max = Math.floor(+this.max);
      if (min && n < min) return T('r4.repeater.min', { n: min }, 'Adicione pelo menos ' + min + ' item(ns).');
      if (max > 0 && n > max) return T('r4.repeater.max', { n: max }, 'No máximo ' + max + ' item(ns).');
      if (!this._items.every(it => it.isValid())) return T('r4.repeater.invalid', 0, 'Corrija os itens destacados.');
      return true;
    },
    validate(values) {
      if (!this.disabled) this._items.forEach(it => it.validate());
      return FIELD.validate.call(this, values);
    },
    reset() {
      FIELD.reset.call(this);
      this._items.forEach(it => it.getFields().forEach(f => f.clearError()));
      return this;
    },
    _copy: v => JSON.parse(JSON.stringify(v || [])),
    _ctl() { return this.box; },
    _natives() { return []; },
    _applyState() {
      FIELD._applyState.call(this);
      if (!this._items) return;
      this._items.forEach(it => it.getFields().forEach(f => f.setDisabled && f.disabled !== !!this.disabled && f.setDisabled(!!this.disabled)));
      this._refresh();
    },
    _focusEl() {
      for (const it of this._items) { const f = it.getFields().find(x => x.getError()); if (f) return f._focusEl ? f._focusEl() : f._ctl(); }
      const f0 = this._items[0] && this._items[0].getFields()[0];
      return f0 ? (f0._focusEl ? f0._focusEl() : f0._ctl()) : this.addBtn;
    },
    /** arrastar pela alça (mouse); teclado: Alt+↑/↓ ou os botões */
    _dnd() {
      let from = -1;
      this.listEl.addEventListener('dragstart', ev => {
        const h = ev.target.closest && ev.target.closest('.r4-rep-handle'), it = h && this._itemOf(h);
        if (!it || this.readOnly || this.disabled) { ev.preventDefault(); return; }
        from = this._items.indexOf(it);
        it.el.classList.add('r4-rep-dragging');
        if (ev.dataTransfer) { ev.dataTransfer.effectAllowed = 'move'; try { ev.dataTransfer.setData('text/plain', String(from)); ev.dataTransfer.setDragImage(it.el, 16, 16); } catch (e) { /* */ } }
      });
      this.listEl.addEventListener('dragover', ev => { if (from >= 0) { ev.preventDefault(); if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'move'; } });
      this.listEl.addEventListener('drop', ev => {
        if (from < 0) return;
        ev.preventDefault();
        const it = this._itemOf(ev.target);
        if (it) this.move(from, this._items.indexOf(it));
      });
      this.listEl.addEventListener('dragend', () => { from = -1; this.listEl.querySelectorAll('.r4-rep-dragging').forEach(n => n.classList.remove('r4-rep-dragging')); });
    },
    _cleanup() { (this._items || []).forEach(it => R4.reactive && R4.reactive.release(it.el)); }
  }, {
    title: 'repeater', group: G,
    description: 'Lista editável de itens com campos (horários, links, telefones...). O item é definido por <r4-item-template> com tags de campo; valor = array de objetos. Adicionar, remover, reordenar (botões, Alt+↑/↓ ou arrastar pela alça), mínimo/máximo, título-resumo por item e validação por item. r4-bind e r4-show-if dentro do item enxergam os campos do PRÓPRIO item.',
    props: [
      { name: '<r4-item-template>', type: 'html', desc: 'Filho com os campos de UM item (HTML confiável da página; também vale <template>). Por JS: template (string) ou fields ([{type, name, label...}]).' },
      { name: 'min / max', type: 'number', default: '0 / 0', desc: 'Quantidade mínima (já nasce com esse número de itens) e máxima (0 = até 100, o limite absoluto). Arrays maiores no setValue são cortados com aviso.' },
      { name: 'itemTitle', type: 'string', default: "''", desc: 'Resumo do item com {campo}: "{dias} {inicio}–{fim}" (texto, nunca HTML). Vazio = "Item N".' },
      { name: 'addText / emptyText', type: 'string', default: "''", desc: 'Texto do botão Adicionar e da lista vazia (padrão no idioma atual).' },
      { name: 'sortable', type: 'boolean', default: 'true', desc: 'Mostra a alça de arrastar.' },
      { name: 'maxFields', type: 'number', default: '40', desc: 'Aviso no console se um item tiver mais campos que isso.' },
      { name: 'value', type: 'Array<object> | JSON', default: '[]', desc: 'Itens iniciais (também via setValue / setValues do form). Chaves __proto__/constructor/prototype são ignoradas.' },
      { name: 'add(valores) / remove(i) / move(de, para) / getItems() / count()', type: 'método', desc: 'Controle por código (add devolve o item: {el, getValues(), setValues(), getField(n)}).' },
      { name: 'name / label / required / disabled / readOnly / helpText', type: 'campo', desc: 'Como os demais campos do form (required = pelo menos 1 item).' }
    ],
    events: ['change', 'add', 'remove', 'move', 'invalid', 'reset']
  });
  R4.declare('repeater', (host, cfg) => {
    const t = [...host.children].find(k => k.localName === 'r4-item-template' || k.localName === 'template');
    if (t && cfg.template == null) {
      // HTML CONFIÁVEL da própria página (<template> ou <r4-item-template>); ids repetidos em cada item quebrariam label/aria: saem
      const tmp = document.createElement('template'); tmp.innerHTML = t.innerHTML;
      const withId = tmp.content.querySelectorAll('[id]');
      if (withId.length) { R4.warn('<r4-repeater>: atributos id dentro de <r4-item-template> foram removidos (cada item ganha ids próprios)'); withId.forEach(n => n.removeAttribute('id')); }
      cfg.template = tmp.innerHTML.trim();
    }
    return cfg;
  });

  /* =====================================================================
   * colorfield + contraste WCAG
   * ===================================================================== */
  const hex = v => (R4.preview && R4.preview.hex ? R4.preview.hex(v) : '');
  const lum = h => {
    const c = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255).map(x => (x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4)));
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  /** Razão de contraste WCAG 2 entre duas cores #rgb/#rrggbb (1 a 21) ou NaN. */
  const contrast = (a, b) => { a = hex(a); b = hex(b); if (!a || !b) return NaN; const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  R4.color = { hex, contrast, luminance: h => (hex(h) ? lum(hex(h)) : NaN) };
  const ratioTxt = r => (Math.floor(r * 100) / 100).toLocaleString(R4.i18n ? R4.i18n.locale : 'pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 2 });

  R4.define('colorfield', {
    extend: 'field',
    config: { presets: '', contrastWith: '', minContrast: 4.5, requiredContrast: 0, placeholder: '#rrggbb' },
    build() {
      const ids = this._ids(), v = hex(this.value);
      this.picker = el('input', { type: 'color', class: 'r4-cf-picker', value: v || '#000000' });
      U.tx(this.picker, 'r4.color.pick', 'Escolher cor', 'aria-label');
      this.input = el('input', { type: 'text', class: 'r4-input r4-cf-hex', id: ids.input, name: this.name || null, maxlength: '7', spellcheck: 'false', autocomplete: 'off', placeholder: this.placeholder || null });
      this.input.value = v || (this.value ? String(this.value) : '');
      this.swatch = el('span', { class: 'r4-cf-swatch', 'aria-hidden': 'true', text: 'Aa' });
      this.picker.addEventListener('click', ev => { if (this.readOnly) ev.preventDefault(); });
      this.picker.addEventListener('input', () => { this.input.value = this.picker.value.toLowerCase(); this._sync(); this._changed(); });
      this.picker.addEventListener('change', () => { this.input.value = this.picker.value.toLowerCase(); this._sync(); this._changed(); });
      this.input.addEventListener('input', () => { const h = hex(this.input.value); if (h) this.picker.value = h; this._sync(); this._changed(); });
      this.input.addEventListener('blur', () => { const h = hex(this.input.value); if (h && h !== this.input.value) { this.input.value = h; this._changed(); } });
      const kids = [el('div', { class: 'r4-cf-row' }, [this.swatch, this.picker, this.input])];
      const list = [...new Set(String(this.presets || '').split(/[\s,;]+/).map(hex).filter(Boolean))].slice(0, 24);
      if (list.length) {
        this.presetsEl = el('div', { class: 'r4-cf-presets', role: 'group' }, list.map(h => {
          const b = el('button', { type: 'button', class: 'r4-cf-preset', 'data-hex': h, 'aria-label': h, title: h, 'aria-pressed': 'false', onclick: () => { if (this.readOnly || this.disabled) return; this.setValue(h); this._changed(); } });
          b.style.setProperty('--r4-cf-c', h);
          return b;
        }));
        U.tx(this.presetsEl, 'r4.color.presets', 'Cores sugeridas', 'aria-label');
        kids.push(this.presetsEl);
      }
      this.ctrEl = el('div', { class: 'r4-cf-contrast r4-help', id: ids.input + '-ctr', 'aria-live': 'polite', hidden: true });
      kids.push(this.ctrEl);
      return this._wrap(el('div', { class: 'r4-cf' }, kids), 'r4-colorfield');
    },
    afterRender() {
      this._initField(); this._sync();
      // acompanha a outra cor (contrastWith) no form/item dono
      Promise.resolve().then(() => {
        if (this._destroyed || !this.contrastWith || hex(this.contrastWith)) return;
        const f = this._form();
        if (!f || !f.el) return warnOnce('cw' + this.id, '<r4-colorfield name="' + this.name + '">: contrast-with="' + this.contrastWith + '" precisa estar dentro de um <r4-form> (ou ser uma cor #rrggbb)');
        if (!f.getField(this.contrastWith)) warnOnce('cw2' + this.id, '<r4-colorfield name="' + this.name + '">: contrast-with: campo "' + this.contrastWith + '" não existe no form');
        this._owner = f.el;
        this._ownH = ev => { if (!(ev.detail && ev.detail.field === this)) this._contrast(); };
        ['input', 'r4-fieldchange', 'r4-values'].forEach(t => f.el.addEventListener(t, this._ownH));
        this._contrast();
      });
    },
    _cleanup() { if (this._owner) ['input', 'r4-fieldchange', 'r4-values'].forEach(t => this._owner.removeEventListener(t, this._ownH)); this._owner = null; },
    _ctl() { return this.input; },
    _natives() { return [this.input, this.picker]; },
    _extraDesc() { return this.ctrEl && !this.ctrEl.hidden ? [this.ctrEl.id] : []; },
    _other() {
      const c = String(this.contrastWith || '').trim();
      if (!c) return '';
      if (hex(c)) return hex(c);
      const f = this._form(), o = f && f.getField && f.getField(c);
      return o ? hex(o.getValue()) : '';
    },
    /** Razão de contraste atual com contrastWith (NaN sem as duas cores). */
    getContrast() { return contrast(this.getValue(), this._other()); },
    _contrast() {
      if (!this.ctrEl) return;
      const r = this.getContrast(), other = this._other();
      this.swatch.style.setProperty('--r4-cf-fg', other || 'currentColor');
      if (isNaN(r)) { this.ctrEl.hidden = true; this.ctrEl.textContent = ''; this._describe(); return; }
      const min = +this.minContrast || 0;
      const level = r >= 7 ? 'AAA' : r >= 4.5 ? 'AA' : r >= 3 ? T('r4.color.aaLarge', 0, 'AA só para texto grande') : T('r4.color.fail', 0, 'insuficiente');
      const low = min > 0 && r < min;
      this.ctrEl.textContent = low ? T('r4.color.low', { ratio: ratioTxt(r), min: ratioTxt(min) }, 'Contraste baixo: ' + ratioTxt(r) + ':1 (mínimo recomendado ' + ratioTxt(min) + ':1)')
        : T('r4.color.ratio', { ratio: ratioTxt(r), level }, 'Contraste ' + ratioTxt(r) + ':1 · ' + level);
      this.ctrEl.classList.toggle('r4-cf-low', low);
      this.ctrEl.hidden = false;
      this._describe();
      if (this._error && +this.requiredContrast > 0) this.validate();
    },
    _sync() {
      const h = this.getValue();
      if (this.swatch) { h ? this.swatch.style.setProperty('--r4-cf-bg', h) : this.swatch.style.removeProperty('--r4-cf-bg'); this.swatch.classList.toggle('r4-cf-none', !h); }
      if (this.presetsEl) this.presetsEl.querySelectorAll('[data-hex]').forEach(b => b.setAttribute('aria-pressed', b.getAttribute('data-hex') === h ? 'true' : 'false'));
      this._contrast();
    },
    relocalize() { this._contrast(); },
    getValue() { return hex(this.input ? this.input.value : this.value); },
    setValue(v) {
      const h = hex(v);
      if (!this.input) { this.value = h; return this; }
      this.input.value = h || (v == null ? '' : String(v).slice(0, 32));   // inválido fica visível (e reprova), sem cortar para algo "válido"
      this.picker.value = h || '#000000';
      this._sync();
      return this;
    },
    isEmpty() { return !String(this.input ? this.input.value : this.value || '').trim(); },
    _typeCheck() {
      const raw = String(this.input ? this.input.value : '').trim();
      if (raw && !hex(raw)) return T('r4.color.invalid', 0, 'Cor inválida: use o formato #rrggbb.');
      const need = +this.requiredContrast;
      if (need > 0) {
        const r = this.getContrast();
        if (!isNaN(r) && r < need) return T('r4.color.required', { ratio: ratioTxt(r), min: ratioTxt(need) }, 'Contraste ' + ratioTxt(r) + ':1 abaixo do mínimo de ' + ratioTxt(need) + ':1.');
      }
      return true;
    }
  }, {
    title: 'colorfield', group: G,
    description: 'Campo de cor: seletor nativo + código #rrggbb digitável + amostra, cores sugeridas clicáveis e contraste WCAG ao vivo com outra cor do form (razão e nível AA/AAA), com bloqueio opcional abaixo do mínimo. getValue() sempre #rrggbb minúsculo (#abc vira #aabbcc).',
    props: [
      { name: 'presets', type: 'string', default: "''", desc: 'Cores sugeridas separadas por vírgula: "#0b3d2e,#1e88e5,#fff". Inválidas são ignoradas (máx. 24).' },
      { name: 'contrastWith', type: 'string', default: "''", desc: 'Name de outro campo de cor do mesmo form (ou uma cor fixa "#ffffff"): mostra a razão de contraste WCAG ao vivo.' },
      { name: 'minContrast', type: 'number', default: '4.5', desc: 'Abaixo disso o aviso fica destacado (não bloqueia). 4.5 = AA para texto normal; 3 = texto grande.' },
      { name: 'requiredContrast', type: 'number', default: '0', desc: 'Se > 0, a validação reprova abaixo desse contraste (o form não envia).' },
      { name: 'getContrast()', type: 'método', desc: 'Razão atual (1 a 21) ou NaN. R4.color.contrast(a, b) e R4.color.hex(v) também ficam disponíveis.' },
      { name: 'name / label / value / required / disabled / helpText', type: 'campo', desc: 'Como os demais campos do form.' }
    ],
    events: ['change', 'blur', 'invalid', 'reset']
  });

  /* =====================================================================
   * choice — opções em cartões
   * ===================================================================== */
  function normChoice(list) {
    if (!Array.isArray(list)) return [];
    return list.slice(0, 60).map(o => {
      if (o == null) return null;
      if (typeof o !== 'object') return { value: String(o), label: String(o) };
      const value = o.value ?? o.valor ?? o.id;
      if (value == null) return null;
      return { value: String(value), label: String(o.label ?? o.texto ?? o.text ?? value), description: o.description ?? o.descricao ?? '',
        thumb: o.thumb ? U.safeUrl(o.thumb, 'img') : '', icon: o.icon || '', html: U.isRaw(o.html) ? o.html : (o.html != null ? String(o.html) : null),
        disabled: !!(o.disabled || o.desabilitado) };
    }).filter(Boolean);
  }
  R4.define('choice', {
    extend: 'field',
    config: { options: [], columns: 0 },
    _reqKey: 'requiredChoice',
    build() {
      const ids = this._ids();
      this._val = this.value == null ? '' : String(this.value);
      this.group = el('div', { class: 'r4-choice-grid', role: 'radiogroup', id: ids.input, 'aria-labelledby': this.label ? ids.label : null });
      const n = Math.max(0, Math.min(8, Math.floor(+this.columns) || 0));
      if (n) { this.group.classList.add('r4-choice-cols'); this.group.style.setProperty('--r4-choice-cols', String(n)); }
      this._render();
      return this._wrap(this.group, 'r4-choicefield', { labelTag: 'span' });
    },
    afterRender() { this._initField(); },
    _render() {
      this.opts = normChoice(typeof this.options === 'string' ? (() => { try { return JSON.parse(this.options); } catch (e) { return []; } })() : this.options);
      const nm = this.id + '-c', frag = document.createDocumentFragment();
      this.opts.forEach((o, i) => {
        const id = nm + i;
        const inp = el('input', { type: 'radio', class: 'r4-choice-input', name: nm, id, value: o.value, disabled: o.disabled || this.disabled,
          onchange: () => { if (inp.checked) { this._val = o.value; this._mark(); this._changed(); } },
          onclick: ev => { if (this.readOnly) ev.preventDefault(); } });
        inp.checked = o.value === this._val;
        const vis = el('span', { class: 'r4-choice-visual', 'aria-hidden': 'true' });
        if (o.html != null) U.setContent(vis, o.html);   // markup confiável (R4.raw / <r4-option> da página); texto comum vira texto
        else if (o.thumb) vis.append(el('img', { src: o.thumb, alt: '', loading: 'lazy' }));
        else if (o.icon) U.icon(vis, o.icon);
        else vis.classList.add('r4-choice-novis');
        const kids = [inp, vis, el('span', { class: 'r4-choice-label', text: o.label })];
        if (o.description) kids.push(el('span', { class: 'r4-choice-desc', text: String(o.description) }));
        frag.append(el('label', { class: 'r4-choice-card', for: id, 'data-value': o.value }, kids));
      });
      this.group.replaceChildren(frag);
      this._mark();
    },
    _mark() { this.group && this.group.querySelectorAll('.r4-choice-card').forEach(c => c.classList.toggle('r4-checked', c.getAttribute('data-value') === this._val)); },
    setOptions(list) { this.options = list; this._render(); this._applyState(); return this; },
    getOptions() { return (this.opts || []).map(o => ({ value: o.value, label: o.label })); },
    _ctl() { return this.group; },
    _natives() { return this.group ? [...this.group.querySelectorAll('input')] : []; },
    _applyState() {
      FIELD._applyState.call(this);
      this._natives().forEach((n, i) => { if (this.opts[i] && this.opts[i].disabled) n.disabled = true; });
    },
    getValue() { return this._val || ''; },
    setValue(v) {
      this._val = v == null ? '' : String(v);
      this.group && this.group.querySelectorAll('input').forEach(i => { i.checked = i.value === this._val; });
      this._mark();
      return this;
    },
    _focusEl() { const ins = this._natives().filter(i => !i.disabled); return ins.find(i => i.checked) || ins[0] || this.group; }
  }, {
    title: 'choice', group: G,
    description: 'Grupo de opções exclusivas em cartões (radio nativo acessível: setas trocam, Espaço marca), com miniatura, ícone ou SVG em cada opção. Para estilo de topo, layout de galeria, plano... Em HTML: <r4-option value label thumb icon description>conteúdo</r4-option> — o conteúdo é markup CONFIÁVEL da página; por JS, html só com R4.html/R4.raw (texto comum é escapado).',
    props: [
      { name: '<r4-option value label thumb icon description disabled>', type: 'html', desc: 'Filhos. O conteúdo (ex.: <svg>) vira a ilustração do cartão; sem conteúdo usa thumb (imagem, safeUrl) ou icon (R4.icon).' },
      { name: 'options', type: 'Array<{value, label, description, thumb, icon, html, disabled}>', default: '[]', desc: 'Opções por JS. html só vira HTML se vier de R4.html/R4.raw; label/description são sempre texto.' },
      { name: 'columns', type: 'number', default: '0', desc: 'Colunas fixas (1 a 8; empilha em telas estreitas); 0 = automático.' },
      { name: 'setOptions(lista) / getOptions()', type: 'método', desc: 'Troca/lê as opções.' },
      { name: 'name / label / value / required / disabled / readOnly / helpText', type: 'campo', desc: 'Como os demais campos do form.' }
    ],
    events: ['change', 'blur', 'invalid', 'reset']
  });
  R4.declare('choice', (host, cfg) => {
    const opts = [...host.children].filter(k => k.localName === 'r4-option').map(o => {
      const inner = o.innerHTML.trim();
      return { value: o.getAttribute('value') ?? o.getAttribute('label') ?? '', label: o.getAttribute('label') ?? o.textContent.trim(),
        description: o.getAttribute('description') || '', thumb: o.getAttribute('thumb') || '', icon: o.getAttribute('icon') || '',
        html: inner && o.children.length ? R4.raw(inner) : null, disabled: o.hasAttribute('disabled'), _sel: o.hasAttribute('selected') };
    });
    if (opts.length) {
      cfg.options = (Array.isArray(cfg.options) ? cfg.options : []).concat(opts.map(({ _sel, ...x }) => x));
      const sel = opts.find(x => x._sel);
      if (cfg.value == null && sel) cfg.value = sel.value;
    }
    return cfg;
  });

  /* =====================================================================
   * phonepreview — celular com a prévia ao lado do form
   * ===================================================================== */
  const KEY = /^[A-Za-z_][\w.-]{0,63}$/;
  const MAX_MSG = 65536;
  function mapOf(s) {
    const out = [];
    String(s || '').split(/[,;\n]/).slice(0, 100).forEach(p => {
      p = p.trim(); if (!p) return;
      const [f, k] = p.split(':').map(x => x.trim());
      const key = k || f;
      if (!KEY.test(f) || !KEY.test(key) || BAD.has(f) || BAD.has(key)) return warnOnce('map|' + p, '<r4-phonepreview>: item de map inválido "' + p.slice(0, 40) + '" (use campo:chave)');
      out.push([f, key]);
    });
    return out;
  }
  function packVal(v, depth) {
    if (v == null) return null;
    if (typeof v === 'string') return v.slice(0, 5000);
    if (typeof v === 'number') return Number.isFinite(v) ? v : null;
    if (typeof v === 'boolean') return v;
    if (Array.isArray(v) && !depth) return v.slice(0, 100).map(x => (x && typeof x === 'object' && !Array.isArray(x)
      ? Object.keys(x).filter(k => KEY.test(k) && !BAD.has(k)).slice(0, 30).reduce((o, k) => { const y = packVal(x[k], 2); if (y !== undefined && typeof y !== 'object') o[k] = y; else if (y === null) o[k] = null; return o; }, {})
      : packVal(x, 1))).filter(x => x !== undefined);
    return undefined;
  }
  const focusables = root => [...root.querySelectorAll('button:not([disabled]),[href],input:not([disabled]),select,textarea,iframe,[tabindex]:not([tabindex="-1"])')].filter(n => !n.hidden);

  R4.define('phonepreview', {
    config: { src: '', for: '', map: '', breakpoint: 1024, title: '', buttonText: '', reloadText: '', width: 390, height: 780, top: 16, html: '' },
    build() {
      const W = Math.max(240, Math.min(600, +this.width || 390)), H = Math.max(400, Math.min(1200, +this.height || 780));
      const root = el('div', { class: 'r4-pp' });
      root.style.setProperty('--r4-pp-w', W + 'px'); root.style.setProperty('--r4-pp-h', H + 'px');
      root.style.setProperty('--r4-pp-top', Math.max(0, Math.min(200, +this.top || 0)) + 'px');
      this._dims = { W, H };
      this.openBtn = el('button', { type: 'button', class: 'r4-btn r4-btn-primary r4-pp-open', 'aria-haspopup': 'dialog', onclick: () => this.open() },
        [ico('eye'), this.openTxt = el('span', { text: this.buttonText || T('r4.pp.open', 0, 'Visualizar pré-review') })]);
      this.screen = el('div', { class: 'r4-pp-screen' });
      this.phone = el('div', { class: 'r4-pp-phone' }, [el('span', { class: 'r4-pp-notch', 'aria-hidden': 'true' }), this.screen]);
      this.reloadBtn = el('button', { type: 'button', class: 'r4-btn r4-pp-reload', onclick: () => this.reload() }, [ico('refresh'), el('span', { text: this.reloadText || T('r4.pp.reload', 0, 'Atualizar prévia') })]);
      this.aside = el('aside', { class: 'r4-pp-aside', 'aria-label': this.title || T('r4.pp.title', 0, 'Pré-visualização') }, [
        el('div', { class: 'r4-pp-bar' }, [el('span', { class: 'r4-pp-label', text: this.title || T('r4.pp.title', 0, 'Pré-visualização') }), this.reloadBtn]),
        el('div', { class: 'r4-pp-fit' }, [this.phone])]);
      if (this.html) {
        this.main = el('div', { class: 'r4-pp-main' });
        this.main.innerHTML = this.html;   // HTML confiável (conteúdo da tag)
        root.append(this.openBtn, this.main, this.aside);
        root.classList.add('r4-pp-layout');
      } else root.append(this.openBtn, this.aside);
      this._map = mapOf(this.map);
      if (!this._map.length) warnOnce('nomap', '<r4-phonepreview>: map vazio — nenhum campo é enviado à prévia (use map="campo:chave,...")');
      return root;
    },
    afterRender() {
      const bp = Math.max(0, Math.min(4000, +this.breakpoint || 0));
      this._mq = typeof matchMedia === 'function' ? matchMedia('(min-width: ' + bp + 'px)') : null;
      this._mqH = () => this._mode();
      if (this._mq) this._mq.addEventListener ? this._mq.addEventListener('change', this._mqH) : this._mq.addListener && this._mq.addListener(this._mqH);
      this._rs = () => { if (!this._rsq) { this._rsq = true; requestAnimationFrame(() => { this._rsq = false; this._fit(); }); } };
      window.addEventListener('resize', this._rs);
      this._msg = ev => this._onMessage(ev);
      window.addEventListener('message', this._msg);
      this._mode();
      // o form (for) pode ainda não existir: o conteúdo é montado logo depois deste afterRender
      let n = 0;
      const find = () => { if (this._destroyed || this._st) return; if (!this._bindState(n > 0) && ++n < 60) requestAnimationFrame(find); };
      Promise.resolve().then(find);
    },
    _bindState(last) {
      const sel = String(this.for || '').trim();
      if (!sel) { const f = this.el.querySelector('.r4-form'); if (!f) return false; this._st = R4.state(f); }
      else {
        const id = sel.replace(/^#/, ''), c = R4.get(id);
        if (!c && !document.getElementById(id)) { if (last) warnOnce('for' + id, '<r4-phonepreview>: for="' + sel + '" não encontrado (ainda)'); return false; }
        this._st = R4.state(sel);
      }
      if (!this._st) return false;
      this._stH = () => this.send();
      this._st.on('change', this._stH);
      this.send();
      return true;
    },
    /** Mostra o celular ao lado (tela ≥ breakpoint) ou só o botão (abaixo). */
    _mode() {
      const wide = !!(this._mq && this._mq.matches);
      this.el.classList.toggle('r4-pp-wide', wide);
      this.openBtn.hidden = wide;
      this.aside.hidden = !wide;
      if (wide) { if (this._ov) this.close(); if (!this.frame) this.frame = this._frame(this.screen); this._fit(); }
    },
    _fit() {
      if (!this.el || !this.el.classList.contains('r4-pp-wide')) return;
      const avail = (window.innerHeight || 800) - 2 * (+this.top || 0) - 56;
      const s = Math.max(0.4, Math.min(1, avail / this._dims.H));
      this.el.style.setProperty('--r4-pp-s', s.toFixed(3));
    },
    /** URL da prévia: só mesma origem (http/https). */
    _url() {
      const s = String(this.src || '').trim();
      if (!s) return '';
      let u;
      try { u = new URL(s, location.href); } catch (e) { u = null; }
      if (!u || !/^https?:$/.test(u.protocol) || u.origin !== location.origin || !U.safeUrl(s)) {
        warnOnce('src' + s, '<r4-phonepreview>: src recusado "' + s.slice(0, 60) + '" (só páginas da mesma origem)');
        return '';
      }
      return u.href;
    },
    _frame(host) {
      const url = this._url();
      if (!url) { host.replaceChildren(el('p', { class: 'r4-pp-nosrc r4-help', text: T('r4.pp.noSrc', 0, 'Prévia indisponível: o endereço precisa ser da mesma origem.') })); return null; }
      const f = el('iframe', { class: 'r4-pp-frame', title: this.title || T('r4.pp.title', 0, 'Pré-visualização'), loading: 'lazy', referrerpolicy: 'same-origin' });
      f.setAttribute('sandbox', 'allow-same-origin allow-scripts');
      f.addEventListener('load', () => this.send(f));
      f.src = url;
      host.replaceChildren(f);
      return f;
    },
    /** Pacote {v:1, t:'estado', d} só com os campos do map (allowlist). */
    payload() {
      const vals = this._st ? this._st.values() : {}, d = {};
      this._map.forEach(([f, k]) => { const v = packVal(Object.prototype.hasOwnProperty.call(vals, f) ? vals[f] : null, 0); if (v !== undefined) d[k] = v; });
      return { v: 1, t: 'estado', d };
    },
    /** Envia o estado aos iframes (ou a um). */
    send(only) {
      if (this._destroyed || !this._map.length) return this;
      const frames = only ? [only] : [this.frame, this._ovFrame].filter(Boolean);
      if (!frames.length) return this;
      const msg = this.payload();
      let size = 0; try { size = JSON.stringify(msg).length; } catch (e) { size = Infinity; }
      if (size > MAX_MSG) { warnOnce('big' + this.id, '<r4-phonepreview>: estado grande demais para a prévia (' + size + ' bytes; máx. ' + MAX_MSG + ')'); return this; }
      frames.forEach(f => { try { f.contentWindow && f.contentWindow.postMessage(msg, location.origin); } catch (e) { /* iframe navegando */ } });
      this.fire('send', this, msg.d);
      return this;
    },
    _onMessage(ev) {
      if (ev.origin !== location.origin) return;
      const f = [this.frame, this._ovFrame].find(x => x && x.contentWindow && ev.source === x.contentWindow);
      const d = ev.data;
      if (f && d && typeof d === 'object' && d.v === 1 && d.t === 'pronto') this.send(f);
    },
    /** Recarrega a página de prévia (o estado é reenviado quando ela carregar). */
    reload() {
      [this.frame, this._ovFrame].filter(Boolean).forEach(f => { try { f.contentWindow.location.reload(); } catch (e) { const u = f.src; f.src = 'about:blank'; f.src = u; } });
      this.fire('reload', this);
      return this;
    },
    /** Abre a prévia em tela cheia (telas estreitas). O iframe só carrega aqui. */
    open() {
      if (this._ov || this._destroyed) return this;
      this._ret = document.activeElement;
      const tid = this.id + '-ovt';
      const close = el('button', { type: 'button', class: 'r4-btn r4-pp-close', onclick: () => this.close() }, [ico('close')]);
      U.tx(close, 'r4.pp.close', 'Fechar prévia', 'aria-label');
      const rl = el('button', { type: 'button', class: 'r4-btn r4-pp-reload', onclick: () => this.reload() }, [ico('refresh'), el('span', { text: this.reloadText || T('r4.pp.reload', 0, 'Atualizar prévia') })]);
      const body = el('div', { class: 'r4-pp-ovbody' });
      // foco preso por "sentinelas": funciona também quando o foco sai de DENTRO do iframe (lá o keydown não chega aqui)
      const guard = () => el('span', { class: 'r4-pp-guard', tabindex: '0', 'aria-hidden': 'true' });
      const g1 = guard(), g2 = guard();
      const ov = el('div', { class: 'r4-pp-overlay r4-cmp', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': tid, tabindex: '-1' }, [g1,
        el('div', { class: 'r4-pp-ovbar' }, [el('h2', { class: 'r4-pp-ovtitle', id: tid, text: this.title || T('r4.pp.title', 0, 'Pré-visualização') }), rl, close]), body, g2]);
      const inside = () => focusables(ov).filter(n => !n.classList.contains('r4-pp-guard'));
      g1.addEventListener('focus', () => { const f = inside(); f.reverse().some(n => { n.focus(); return document.activeElement === n; }); });
      g2.addEventListener('focus', () => { const f = inside(); f.length && f[0].focus(); });
      ov.addEventListener('keydown', ev => { if (ev.key === 'Escape') { ev.preventDefault(); this.close(); } });
      document.body.append(ov);
      document.documentElement.classList.add('r4-pp-lock');
      this._ov = ov;
      this._ovFrame = this._frame(body);
      this.openBtn.setAttribute('aria-expanded', 'true');
      close.focus();
      this.fire('open', this);
      return this;
    },
    close() {
      if (!this._ov) return this;
      this._ov.remove(); this._ov = null; this._ovFrame = null;
      document.documentElement.classList.remove('r4-pp-lock');
      this.openBtn.setAttribute('aria-expanded', 'false');
      const r = this._ret; this._ret = null;
      (r && r.isConnected && r !== document.body ? r : this.openBtn).focus();
      this.fire('close', this);
      return this;
    },
    isOpen() { return !!this._ov; },
    relocalize() {
      if (!this.buttonText && this.openTxt) this.openTxt.textContent = T('r4.pp.open', 0, 'Visualizar pré-review');
    },
    destroy() {
      if (this._destroyed) return;
      if (!this.fire('beforedestroy', this)) return;
      this.close();
      if (this._mq) this._mq.removeEventListener ? this._mq.removeEventListener('change', this._mqH) : this._mq.removeListener && this._mq.removeListener(this._mqH);
      window.removeEventListener('resize', this._rs);
      window.removeEventListener('message', this._msg);
      if (this._st) this._st.un('change', this._stH);
      if (this.el) destroyIn(this.el, this);
      this._destroyed = true;
      this.el && this.el.remove();
      delete R4.instances[this.id];
      this.fire('destroy', this);
    }
  }, {
    title: 'phonepreview', group: 'Interface',
    description: 'Moldura de celular (CSS puro) com um <iframe> da página de prévia, ao lado do formulário em telas ≥ breakpoint (fixa ao rolar e escalada para caber na altura da janela). Em telas menores vira o botão "Visualizar pré-review", que abre a prévia em tela cheia (diálogo acessível: foco preso, Esc fecha; o iframe só carrega no clique). As mudanças do form (for) são enviadas por postMessage só para a mesma origem e só os campos do map; a página de prévia aplica com R4.preview.listen.',
    props: [
      { name: 'src', type: 'string', default: "''", desc: 'Página de prévia — só MESMA origem (outra origem é recusada). iframe com sandbox="allow-same-origin allow-scripts" e loading="lazy".' },
      { name: 'for', type: 'string', default: "''", desc: '#id do <r4-form> cujo estado alimenta a prévia. Vazio = o form que estiver dentro do componente.' },
      { name: 'map', type: 'string', default: "''", desc: 'Allowlist "campo:chave,campo2:chave2" (ou só "campo"): só esses valores vão para a prévia, com esses nomes. Listas (repeater) vão como lista de objetos rasos.' },
      { name: 'conteúdo da tag', type: 'html', desc: 'Opcional: o formulário. Com conteúdo, o componente faz o layout lado a lado (form | celular).' },
      { name: 'breakpoint', type: 'number', default: '1024', desc: 'Largura mínima (px) para mostrar o celular ao lado.' },
      { name: 'width / height / top', type: 'number', default: '390 / 780 / 16', desc: 'Tamanho da tela do celular e distância do topo quando fixo (sticky).' },
      { name: 'title / buttonText / reloadText', type: 'string', default: "''", desc: 'Textos (padrão: Pré-visualização / Visualizar pré-review / Atualizar prévia).' },
      { name: 'send() / reload() / open() / close() / payload()', type: 'método', desc: 'Reenvia o estado, recarrega a página de prévia, abre/fecha a tela cheia, mostra o pacote que seria enviado.' },
      { name: 'Protocolo', type: 'postMessage', desc: '{v:1, t:"estado", d:{chave: valor}} com targetOrigin = location.origin; a prévia pode pedir o estado com {v:1, t:"pronto"}. Máx. 64 KB.' }
    ],
    events: ['send', 'open', 'close', 'reload']
  });

  /* =====================================================================
   * filedrop como campo (name, src, upload-url, remover)
   * ===================================================================== */
  (function augmentFiledrop() {
    const e = R4.registry.filedrop;
    if (!e) return;
    const P = e.cls.prototype, build0 = P.build;
    Object.assign(P.config, { name: '', label: '', src: '', value: '', uploadUrl: '', valueField: '', required: false });
    const pick = (b, path) => String(path).split('.').reduce((o, k) => (o == null || BAD.has(k) || typeof o !== 'object' || !Object.prototype.hasOwnProperty.call(o, k) ? undefined : o[k]), b);
    const own = {
      build() {
        const root = build0.call(this);
        if (!this.name && !this.src && !this.label) return root;
        root.classList.add('r4-fd-field');
        if (this.label) root.prepend(this.labelEl = el('span', { class: 'r4-label', id: this.id + '-lbl', text: String(this.label) }));
        if (this.labelEl) this.zone.setAttribute('aria-labelledby', this.labelEl.id), this.btn.setAttribute('aria-describedby', [this.labelEl.id, this.hintEl ? this.hintEl.id : ''].filter(Boolean).join(' '));
        this.curImg = el('img', { class: 'r4-fd-thumb', alt: '' });
        this.curImg.addEventListener('error', () => { this.curEl.hidden = true; });
        this.rmBtn = el('button', { type: 'button', class: 'r4-btn r4-fd-rmcur', onclick: () => this.removeImage() }, [ico('trash'), el('span', { text: T('r4.files.removeImage', 0, 'Remover imagem') })]);
        this.curEl = el('div', { class: 'r4-fd-current', hidden: true }, [this.curImg, this.rmBtn]);
        U.tx(this.curImg, 'r4.files.current', 'Imagem atual', 'alt');
        this.errEl = el('div', { class: 'r4-field-error', id: this.id + '-err', hidden: true });
        this.zone.before(this.curEl);
        root.append(this.errEl);
        this._url = String(this.value || this.src || '');
        this._showCurrent();
        this.on('files', (c, ok) => this._picked(ok));
        return root;
      },
      afterRender() { this._initial = this.getValue(); },
      _showCurrent(local) {
        if (!this.curEl) return;
        const s = local || U.safeUrl(this._url, 'img');
        this.curEl.hidden = !s;
        if (s) this.curImg.src = s; else this.curImg.removeAttribute('src');
      },
      async _picked(ok) {
        const f = (ok || []).find(x => /^image\//.test(x.type || ''));
        if (this._obj) { URL.revokeObjectURL(this._obj); this._obj = null; }
        if (f && URL.createObjectURL) { this._obj = URL.createObjectURL(f); this._showCurrent(this._obj); }
        if (!this.uploadUrl || !this.name) return;
        this._uploading = true; this.el.classList.add('r4-busy'); this.el.setAttribute('aria-busy', 'true');
        let out = [];
        try { out = await this.upload(this.uploadUrl); } finally {
          this._uploading = false;
          if (!this._destroyed) { this.el.classList.remove('r4-busy'); this.el.removeAttribute('aria-busy'); }
        }
        if (this._destroyed) return;
        const r = out.find(x => x.ok);
        if (!r) return;
        const paths = this.valueField ? [this.valueField] : ['url', 'retorno.url', 'data.url', 'retorno.arquivo', 'retorno.nome', 'nome'];
        const v = paths.map(p => pick(r.data, p)).find(x => typeof x === 'string' && x);
        if (!v) return R4.warn('<r4-filedrop name="' + this.name + '">: a resposta do upload não trouxe a URL/nome (use value-field="caminho")');
        this._url = v.slice(0, 2000);
        this.clearError();
        this._fchanged();
      },
      _fchanged() {
        const v = this.getValue();
        this.fire('change', this, v);
        this.el && this.el.dispatchEvent(new CustomEvent('r4-fieldchange', { bubbles: true, detail: { field: this, value: v } }));
      },
      /** Tira a imagem atual (valor vira ''). */
      removeImage() {
        if (this.disabled) return this;
        if (this._obj) { URL.revokeObjectURL(this._obj); this._obj = null; }
        this._url = ''; this.clear(); this._showCurrent(); this._fchanged();
        this.btn.focus();
        return this;
      },
      getValue() { return this._url || ''; },
      setValue(v) { this._url = typeof v === 'string' ? v.slice(0, 2000) : ''; if (this._obj) { URL.revokeObjectURL(this._obj); this._obj = null; } this._showCurrent(); return this; },
      getName() { return this.name; },
      isEmpty(v = this.getValue()) { return !v; },
      _check() {
        if (this._uploading) return T('r4.files.uploading', 0, 'Aguarde o envio do arquivo.');
        if (bool(this.required) && this.isEmpty()) return T('r4.form.required', 0, 'Campo obrigatório.');
        return true;
      },
      isValid() { return this._check() === true; },
      validate() { if (this.disabled) { this.clearError(); return true; } const r = this._check(); r === true ? this.clearError() : this.setError(r); return r === true; },
      getError() { return this._error || ''; },
      setError(m) {
        if (!m) return this.clearError();
        this._error = String(m);
        if (this.errEl) { this.errEl.textContent = this._error; this.errEl.hidden = false; this.errEl.setAttribute('role', 'alert'); this.el.classList.add('r4-invalid'); }
        this.fire('invalid', this, this._error);
        return this;
      },
      clearError() { this._error = ''; if (this.errEl) { this.errEl.textContent = ''; this.errEl.hidden = true; this.errEl.removeAttribute('role'); this.el.classList.remove('r4-invalid'); } return this; },
      commit() { this._initial = this.getValue(); return this; },
      reset() { this.setValue(this._initial || ''); this.clear(); this.clearError(); this.fire('reset', this); return this; },
      isDirty() { return this.getValue() !== (this._initial || ''); },
      focus() { this.btn && this.btn.focus(); return this; },
      _cleanup() { if (this._obj) { URL.revokeObjectURL(this._obj); this._obj = null; } }
    };
    // campo só quando tem name: sem name, o filedrop continua igual (getValue etc. não atrapalham)
    Object.defineProperties(P, Object.getOwnPropertyDescriptors(own));
    const d0 = P.destroy;
    P.destroy = function () { if (!this._destroyed) this._cleanup(); return d0.apply(this, arguments); };
    e.meta.props.push(
      { name: 'name / label / required', type: 'campo', desc: 'Com name, o filedrop vira campo do <r4-form>: valor = URL (ou nome) da imagem atual; required exige uma.' },
      { name: 'src', type: 'string', default: "''", desc: 'Imagem atual (miniatura com botão "Remover imagem"; passa por safeUrl). Também é o valor inicial.' },
      { name: 'uploadUrl / valueField', type: 'string', default: "''", desc: 'Ao escolher (e editar, com edit="image") o arquivo, já envia em multipart para upload-url; o valor passa a ser a URL devolvida (url, retorno.url, data.url, retorno.nome... ou o caminho de value-field). Enquanto envia, o form não valida (aviso "Aguarde o envio").' },
      { name: 'removeImage() / getValue() / setValue(url)', type: 'método', desc: 'Tira a imagem atual (valor vira "") / lê / troca. Como campo, também dispara change(cmp, valor) e reset.' }
    );
  })();

  /* =====================================================================
   * Atalhos R4.xtype(alvo, ...), playgrounds e i18n
   * ===================================================================== */
  const plain = v => v && typeof v === 'object' && !Array.isArray(v) && !v.nodeType;
  const Q = R4.quickMap || {};
  Q.repeater = (a, b) => (Array.isArray(a) ? Object.assign({ fields: a }, b) : typeof a === 'string' ? Object.assign({ template: a }, b) : a);
  Q.colorfield = (a, b) => (plain(a) ? a : Object.assign({ label: a }, b));
  Q.choice = (a, b) => (Array.isArray(a) ? Object.assign({ options: a }, b) : a);
  Q.phonepreview = (a, b) => (plain(a) ? a : Object.assign({ src: a }, b));

  const PG = (x, pg) => { R4.registry[x].meta.playground = pg; };
  PG('repeater', {
    html: '<r4-form>\n  <r4-repeater name="horarios" label="Horários"{attrs}>\n    <r4-item-template>\n      <r4-formrow>\n        <r4-textfield name="dias" label="Dias" required></r4-textfield>\n        <r4-textfield name="inicio" label="Início" input-type="time"></r4-textfield>\n        <r4-textfield name="fim" label="Fim" input-type="time"></r4-textfield>\n      </r4-formrow>\n    </r4-item-template>\n  </r4-repeater>\n</r4-form>',
    cfg: { name: 'horarios', label: 'Horários', fields: [{ type: 'row', items: [{ type: 'text', name: 'dias', label: 'Dias' }, { type: 'text', name: 'inicio', label: 'Início' }] }] },
    controls: { min: 1, max: 4, itemTitle: '{dias} {inicio}–{fim}', addText: 'Adicionar horário', sortable: true, required: false, disabled: false }
  });
  PG('colorfield', {
    html: '<r4-form>\n  <r4-colorfield name="fundo" label="Fundo" value="#ffffff"></r4-colorfield>\n  <r4-colorfield name="cor" label="Cor do texto"{attrs}></r4-colorfield>\n</r4-form>',
    cfg: { name: 'cor', label: 'Cor do texto' },
    controls: { value: '#0b3d2e', presets: '#0b3d2e,#1e88e5,#e53935,#fbc02d,#ffffff', contrastWith: 'fundo', minContrast: 4.5, requiredContrast: 0, required: false, disabled: false }
  });
  PG('choice', {
    html: '<r4-choice name="layout" label="Layout da galeria"{attrs}>\n  <r4-option value="grade" label="Grade" icon="grid"></r4-option>\n  <r4-option value="lista" label="Lista" icon="list"></r4-option>\n  <r4-option value="carrossel" label="Carrossel" icon="image"></r4-option>\n</r4-choice>',
    cfg: { name: 'layout', label: 'Layout da galeria', options: [{ value: 'grade', label: 'Grade', icon: 'grid' }, { value: 'lista', label: 'Lista', icon: 'list' }] },
    controls: { value: 'grade', columns: 3, required: false, disabled: false, readOnly: false, helpText: '' }
  });
  PG('phonepreview', {
    html: '<r4-phonepreview src="/showcase/preview-demo.html" map="titulo:titulo,cor:cor"{attrs}>\n  <r4-form>\n    <r4-textfield name="titulo" label="Título" value="Minha página"></r4-textfield>\n    <r4-colorfield name="cor" label="Cor" value="#3b5bdb"></r4-colorfield>\n  </r4-form>\n</r4-phonepreview>',
    cfg: { src: '/showcase/preview-demo.html', map: 'titulo' },
    controls: { breakpoint: 1024, width: 390, height: 780, title: '', buttonText: '' }
  });

  if (R4.i18n) {
    R4.i18n.add('pt-BR', { r4: {
      repeater: { add: 'Adicionar', empty: 'Nenhum item.', item: 'Item {n}', up: 'Subir {item}', down: 'Descer {item}', remove: 'Remover {item}',
        upShort: 'Subir', downShort: 'Descer', drag: 'Arrastar para reordenar', min: 'Adicione pelo menos {n} item(ns).', max: 'No máximo {n} item(ns).',
        invalid: 'Corrija os itens destacados.', added: '{item} adicionado.', removed: '{item} removido.', moved: '{item} movido para a posição {n}.' },
      color: { pick: 'Escolher cor', presets: 'Cores sugeridas', invalid: 'Cor inválida: use o formato #rrggbb.', ratio: 'Contraste {ratio}:1 · {level}',
        low: 'Contraste baixo: {ratio}:1 (mínimo recomendado {min}:1)', required: 'Contraste {ratio}:1 abaixo do mínimo de {min}:1.',
        aaLarge: 'AA só para texto grande', fail: 'insuficiente' },
      pp: { title: 'Pré-visualização', open: 'Visualizar pré-review', reload: 'Atualizar prévia', close: 'Fechar prévia',
        noSrc: 'Prévia indisponível: o endereço precisa ser da mesma origem.' },
      files: { current: 'Imagem atual', removeImage: 'Remover imagem', uploading: 'Aguarde o envio do arquivo.' }
    } });
    R4.i18n.add('en', { r4: {
      repeater: { add: 'Add', empty: 'No items.', item: 'Item {n}', up: 'Move {item} up', down: 'Move {item} down', remove: 'Remove {item}',
        upShort: 'Up', downShort: 'Down', drag: 'Drag to reorder', min: 'Add at least {n} item(s).', max: 'At most {n} item(s).',
        invalid: 'Fix the highlighted items.', added: '{item} added.', removed: '{item} removed.', moved: '{item} moved to position {n}.' },
      color: { pick: 'Pick a color', presets: 'Suggested colors', invalid: 'Invalid color: use the #rrggbb format.', ratio: 'Contrast {ratio}:1 · {level}',
        low: 'Low contrast: {ratio}:1 (recommended minimum {min}:1)', required: 'Contrast {ratio}:1 is below the minimum of {min}:1.',
        aaLarge: 'AA for large text only', fail: 'insufficient' },
      pp: { title: 'Preview', open: 'Open preview', reload: 'Refresh preview', close: 'Close preview',
        noSrc: 'Preview unavailable: the address must be same-origin.' },
      files: { current: 'Current image', removeImage: 'Remove image', uploading: 'Wait for the upload to finish.' }
    } });
  }
})(window.R4);
