/**
 * ============================================
 * libr4 / components.js  —  R4 dev
 * ============================================
 * Componentes visuais padrão (estilo ExtJS): viewport, panel, toolbar,
 * button, tabpanel, treepanel, grid, window, textfield + R4.msg.
 * Cada um é registrado com R4.define(xtype, proto, meta); o `meta` alimenta
 * a documentação automática da vitrine.
 * ============================================
 */
(function (R4) {
  'use strict';
  const { el, esc, debounce } = R4.util;

  /* ================= button ================= */
  R4.define('button', {
    config: { text: '', handler: null, disabled: false, variant: 'default', icon: '' },
    build() {
      const b = el('button', { type: 'button', class: 'r4-btn r4-btn-' + this.variant, disabled: this.disabled,
        onclick: ev => { if (!this.disabled) { this.fire('click', this, ev); this.handler && this.handler(this, ev); } } });
      this.label = el('span', { text: this.text });
      if (this.icon) b.append(el('span', { class: 'r4-ico', text: this.icon }));
      b.append(this.label);
      return b;
    },
    setText(t) { this.text = t; this.label.textContent = t; return this; },
    setDisabled(d) { this.disabled = !!d; this.el.disabled = !!d; return this; }
  }, {
    title: 'button', group: 'Componentes', description: 'Botão com handler, ícone e variantes de cor.',
    props: [
      { name: 'text', type: 'string', default: "''", desc: 'Texto do botão.' },
      { name: 'handler', type: 'function(btn, ev)', default: 'null', desc: 'Chamado ao clicar.' },
      { name: 'variant', type: "'default'|'primary'|'danger'", default: "'default'", desc: 'Cor.' },
      { name: 'icon', type: 'string', default: "''", desc: 'Texto/emoji exibido antes do rótulo.' },
      { name: 'disabled', type: 'boolean', default: 'false', desc: 'Desabilita o botão.' },
      { name: 'setText(t) / setDisabled(b)', type: 'método', desc: 'Atualizam o botão depois de renderizado.' }
    ]
  });

  /* ================= toolbar ================= */
  R4.define('toolbar', {
    config: { items: [] },
    build() { const t = el('div', { class: 'r4-toolbar' }); this.renderItems(t, this.items, 'button'); return t; }
  }, {
    title: 'toolbar', description: "Barra horizontal de itens. Use '->' para empurrar o resto à direita e '-' como separador. Itens sem xtype viram button.",
    props: [{ name: 'items', type: "Array<cfg|'->'|'-'>", default: '[]', desc: 'Botões, campos ou qualquer componente.' }]
  });

  /* ================= panel ================= */
  R4.define('panel', {
    config: { title: '', html: '', items: [], tbar: null, collapsible: false, collapsed: false, header: true, padding: true },
    build() {
      const p = el('div', { class: 'r4-panel' });
      if (this.title && this.header !== false) {
        this.headerEl = el('div', { class: 'r4-header' }, [el('span', { class: 'r4-title', text: this.title })]);
        if (this.collapsible) {
          this.headerEl.append(el('span', { class: 'r4-tool', text: '▾' }));
          this.headerEl.addEventListener('click', () => this.toggle());
        }
        p.append(this.headerEl);
      }
      if (this.tbar) { this.tb = R4.create({ xtype: 'toolbar', items: this.tbar }); this.tb.render(p); }
      this.body = el('div', { class: 'r4-body' + (this.padding ? ' r4-pad' : '') });
      if (this.html) this.body.innerHTML = this.html;
      this.renderItems(this.body, this.items);
      p.append(this.body);
      if (this.collapsed) p.classList.add('r4-collapsed');
      return p;
    },
    setHtml(h) { this.body.innerHTML = h; return this; },
    setTitle(t) { this.title = t; this.headerEl && (this.headerEl.firstChild.textContent = t); return this; },
    toggle() { this.el.classList.toggle('r4-collapsed'); this.fire('toggle', this, this.el.classList.contains('r4-collapsed')); return this; }
  }, {
    title: 'panel', description: 'Contêiner básico com título, barra de ferramentas, corpo (html ou items) e recolhimento.',
    props: [
      { name: 'title', type: 'string', default: "''", desc: 'Texto do cabeçalho.' },
      { name: 'html', type: 'string', default: "''", desc: 'HTML do corpo.' },
      { name: 'items', type: 'Array<cfg>', default: '[]', desc: 'Componentes filhos (xtype padrão: panel).' },
      { name: 'tbar', type: 'Array<cfg>', default: 'null', desc: 'Itens da toolbar superior.' },
      { name: 'collapsible / collapsed', type: 'boolean', default: 'false', desc: 'Permite recolher clicando no cabeçalho.' },
      { name: 'padding', type: 'boolean', default: 'true', desc: 'Espaçamento interno do corpo.' },
      { name: 'setHtml(h) / setTitle(t) / toggle()', type: 'método', desc: 'Manipulação em tempo de execução.' }
    ],
    events: ['render', 'toggle', 'destroy']
  });

  /* ================= textfield ================= */
  R4.define('textfield', {
    config: { label: '', value: '', placeholder: '', inputType: 'text' },
    build() {
      this.input = el('input', { class: 'r4-input', type: this.inputType, value: this.value, placeholder: this.placeholder,
        oninput: () => this.fire('change', this, this.input.value),
        onkeydown: ev => { if (ev.key === 'Enter') this.fire('enter', this, this.input.value); } });
      return el('label', { class: 'r4-field' }, [this.label ? el('span', { class: 'r4-label', text: this.label }) : null, this.input]);
    },
    getValue() { return this.input.value; },
    setValue(v) { this.input.value = v; return this; },
    focus() { this.input.focus(); return this; }
  }, {
    title: 'textfield', description: 'Campo de texto com rótulo e eventos change/enter.',
    props: [
      { name: 'label', type: 'string', default: "''", desc: 'Rótulo acima do campo.' },
      { name: 'value', type: 'string', default: "''", desc: 'Valor inicial.' },
      { name: 'placeholder', type: 'string', default: "''", desc: 'Dica.' },
      { name: 'inputType', type: 'string', default: "'text'", desc: 'text, password, number...' },
      { name: 'getValue() / setValue(v)', type: 'método', desc: 'Lê e altera o valor.' }
    ],
    events: ['change', 'enter']
  });

  /* ================= tabpanel ================= */
  R4.define('tabpanel', {
    config: { items: [], activeTab: 0 },
    build() {
      const root = el('div', { class: 'r4-tabs' });
      this.strip = el('div', { class: 'r4-tabstrip' });
      this.stage = el('div', { class: 'r4-tabbody' });
      root.append(this.strip, this.stage);
      this.tabs = [];
      this.items.forEach(it => this.add(it, false));
      return root;
    },
    afterRender() { this.tabs.length && this.setActive(Math.min(this.activeTab, this.tabs.length - 1)); },
    /** add(cfg) → cria a aba (cfg.title, cfg.closable, cfg.key) e ativa */
    add(cfg, activate = true) {
      const panel = R4.create(Object.assign({ header: false }, cfg, { renderTo: null, xtype: cfg.xtype || 'panel' }));
      const tabEl = el('div', { class: 'r4-tab' }, [el('span', { text: cfg.title || 'Aba' })]);
      const tab = { cmp: panel, el: tabEl, key: cfg.key };
      tabEl.addEventListener('click', () => this.setActive(tab));
      if (cfg.closable) tabEl.append(el('span', { class: 'r4-x', text: '×', onclick: ev => { ev.stopPropagation(); this.remove(tab); } }));
      this.strip.append(tabEl);
      panel.render(this.stage);
      panel.hide();
      this.tabs.push(tab);
      if (activate) this.setActive(tab);
      return panel;
    },
    find(key) { return this.tabs.find(t => t.key === key); },
    setActive(t) {
      t = typeof t === 'number' ? this.tabs[t] : t;
      if (!t || t === this.current) return this;
      if (!this.fire('beforetabchange', this, t.cmp)) return this;
      this.tabs.forEach(x => { x.el.classList.toggle('r4-active', x === t); x.cmp.el.hidden = x !== t; });
      this.current = t;
      this.fire('tabchange', this, t.cmp);
      return this;
    },
    remove(t) {
      const i = this.tabs.indexOf(t); if (i < 0) return;
      t.el.remove(); t.cmp.destroy(); this.tabs.splice(i, 1);
      if (this.current === t) { this.current = null; this.tabs.length && this.setActive(this.tabs[Math.max(0, i - 1)]); }
    }
  }, {
    title: 'tabpanel', description: 'Painel com abas. Cada item é um panel (ou outro xtype) com title; closable permite fechar; key evita abas duplicadas via find(key).',
    props: [
      { name: 'items', type: 'Array<cfg>', default: '[]', desc: 'Abas iniciais.' },
      { name: 'activeTab', type: 'number', default: '0', desc: 'Índice da aba inicial.' },
      { name: 'add(cfg)', type: 'método', desc: 'Adiciona e ativa uma aba.' },
      { name: 'find(key) / setActive(tab|i) / remove(tab)', type: 'método', desc: 'Navegação e remoção.' }
    ],
    events: ['beforetabchange', 'tabchange']
  });

  /* ================= treepanel ================= */
  R4.define('treepanel', {
    config: { nodes: [], filterable: true, placeholder: 'Buscar...' },
    build() {
      const root = el('div', { class: 'r4-tree' });
      if (this.filterable) {
        root.append(el('input', { class: 'r4-input r4-tree-filter', type: 'search', placeholder: this.placeholder,
          oninput: debounce(ev => this.filter(ev.target.value), 120) }));
      }
      this.list = el('div', { class: 'r4-tree-list' });
      root.append(this.list);
      this.nodeEls = {};
      this.nodes.forEach(n => this.list.append(this._node(n, 0)));
      return root;
    },
    _node(n, depth) {
      const kids = n.children || [];
      const row = el('div', { class: 'r4-node', style: { paddingLeft: 12 + depth * 16 + 'px' } }, [
        el('span', { class: 'r4-arrow', text: kids.length ? '▸' : '' }),
        el('span', { class: 'r4-node-text', text: n.text }),
        n.badge ? el('span', { class: 'r4-badge', text: n.badge }) : null
      ]);
      const wrap = el('div', { class: 'r4-node-wrap' }, [row]);
      const box = el('div', { class: 'r4-node-kids' });
      kids.forEach(k => box.append(this._node(k, depth + 1)));
      if (kids.length) {
        wrap.append(box);
        const open = n.expanded !== false;
        wrap.classList.toggle('r4-open', open);
        row.firstChild.textContent = open ? '▾' : '▸';
      }
      row.addEventListener('click', () => {
        if (kids.length) {
          const o = wrap.classList.toggle('r4-open');
          row.firstChild.textContent = o ? '▾' : '▸';
        } else this.select(n.id ?? n.text);
      });
      this.nodeEls[n.id ?? n.text] = { node: n, row, wrap };
      return wrap;
    },
    select(id, silent) {
      const e = this.nodeEls[id]; if (!e) return this;
      if (this.sel) this.sel.row.classList.remove('r4-selected');
      this.sel = e; e.row.classList.add('r4-selected');
      if (!silent) this.fire('select', this, e.node);
      return this;
    },
    filter(q) {
      q = (q || '').trim().toLowerCase();
      const walk = (wrap, n) => {
        const kids = n.children || [];
        let hit = !q || n.text.toLowerCase().includes(q);
        let any = false;
        kids.forEach(k => { if (walk(this.nodeEls[k.id ?? k.text].wrap, k)) any = true; });
        const show = hit || any;
        wrap.hidden = !show;
        if (kids.length && q) { wrap.classList.add('r4-open'); wrap.querySelector('.r4-arrow').textContent = '▾'; }
        return show;
      };
      this.nodes.forEach(n => walk(this.nodeEls[n.id ?? n.text].wrap, n));
    }
  }, {
    title: 'treepanel', description: 'Árvore hierárquica com filtro. É o menu lateral padrão da vitrine.',
    props: [
      { name: 'nodes', type: 'Array<{id,text,children,expanded,badge}>', default: '[]', desc: 'Nós da árvore; folhas disparam select.' },
      { name: 'filterable', type: 'boolean', default: 'true', desc: 'Mostra campo de busca.' },
      { name: 'select(id) / filter(texto)', type: 'método', desc: 'Seleciona um nó / filtra a árvore.' }
    ],
    events: ['select']
  });

  /* ================= grid ================= */
  R4.define('grid', {
    config: { columns: [], data: [], pageSize: 0, filter: true, emptyText: 'Nenhum registro.', striped: true },
    build() {
      const root = el('div', { class: 'r4-grid' });
      this.sortKey = null; this.sortDir = 1; this.page = 0; this.q = '';
      if (this.filter) {
        root.append(el('div', { class: 'r4-grid-bar' }, [el('input', { class: 'r4-input', type: 'search', placeholder: 'Filtrar...',
          oninput: debounce(ev => { this.q = ev.target.value.toLowerCase(); this.page = 0; this.refresh(); }, 120) })]));
      }
      this.table = el('table', { class: 'r4-table' + (this.striped ? ' r4-striped' : '') });
      this.thead = el('thead'); this.tbody = el('tbody');
      this.table.append(this.thead, this.tbody);
      root.append(el('div', { class: 'r4-grid-scroll' }, [this.table]));
      this.pager = el('div', { class: 'r4-pager' });
      root.append(this.pager);
      return root;
    },
    afterRender() { this.refresh(); },
    loadData(d) { this.data = d; this.page = 0; this.refresh(); this.fire('load', this, d); return this; },
    _rows() {
      let rows = this.data;
      if (this.q) rows = rows.filter(r => this.columns.some(c => String(r[c.dataIndex] ?? '').toLowerCase().includes(this.q)));
      if (this.sortKey) {
        const k = this.sortKey, d = this.sortDir;
        rows = rows.slice().sort((a, b) => {
          const x = a[k], y = b[k];
          return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x ?? '').localeCompare(String(y ?? ''), 'pt-BR', { numeric: true })) * d;
        });
      }
      return rows;
    },
    refresh() {
      this.thead.replaceChildren(el('tr', {}, this.columns.map(c => {
        const th = el('th', { text: c.header, style: c.width ? { width: c.width + 'px' } : null });
        if (c.sortable !== false) {
          th.classList.add('r4-sortable');
          if (this.sortKey === c.dataIndex) th.append(el('span', { class: 'r4-sort', text: this.sortDir > 0 ? ' ▲' : ' ▼' }));
          th.addEventListener('click', () => {
            this.sortDir = this.sortKey === c.dataIndex ? -this.sortDir : 1;
            this.sortKey = c.dataIndex; this.refresh();
          });
        }
        return th;
      })));
      const all = this._rows();
      const size = this.pageSize || all.length || 1;
      const pages = Math.max(1, Math.ceil(all.length / size));
      this.page = Math.min(this.page, pages - 1);
      const slice = all.slice(this.page * size, this.page * size + size);
      const frag = document.createDocumentFragment();
      slice.forEach(r => {
        const tr = el('tr', { onclick: () => {
          this.tbody.querySelectorAll('.r4-selected').forEach(x => x.classList.remove('r4-selected'));
          tr.classList.add('r4-selected'); this.fire('rowclick', this, r);
        } });
        this.columns.forEach(c => {
          const raw = r[c.dataIndex];
          const td = el('td');
          if (c.renderer) td.innerHTML = c.renderer(raw, r); else td.textContent = raw ?? '';
          if (c.align) td.style.textAlign = c.align;
          tr.append(td);
        });
        frag.append(tr);
      });
      this.tbody.replaceChildren(frag);
      if (!slice.length) this.tbody.append(el('tr', {}, [el('td', { colspan: this.columns.length, class: 'r4-empty', text: this.emptyText })]));
      this.pager.hidden = !this.pageSize;
      if (this.pageSize) {
        this.pager.replaceChildren(
          el('button', { class: 'r4-btn', disabled: this.page === 0, text: '‹', onclick: () => { this.page--; this.refresh(); } }),
          el('span', { text: ` ${this.page + 1} / ${pages}  ·  ${all.length} registros ` }),
          el('button', { class: 'r4-btn', disabled: this.page >= pages - 1, text: '›', onclick: () => { this.page++; this.refresh(); } }));
      }
    }
  }, {
    title: 'grid', description: 'Tabela de dados com ordenação por coluna, filtro, paginação e renderers. Renderiza só a página visível.',
    props: [
      { name: 'columns', type: 'Array<{header,dataIndex,width,align,sortable,renderer}>', default: '[]', desc: 'Definição das colunas. renderer(valor, linha) devolve HTML.' },
      { name: 'data', type: 'Array<object>', default: '[]', desc: 'Registros.' },
      { name: 'pageSize', type: 'number', default: '0', desc: 'Linhas por página (0 = sem paginação).' },
      { name: 'filter', type: 'boolean', default: 'true', desc: 'Barra de filtro.' },
      { name: 'loadData(array)', type: 'método', desc: 'Substitui os dados.' }
    ],
    events: ['rowclick', 'load']
  });

  /* ================= window ================= */
  R4.define('window', {
    config: { title: '', html: '', items: [], buttons: [], width: 420, modal: true, closable: true },
    build() {
      const win = el('div', { class: 'r4-window', style: { width: this.width + 'px' }, role: 'dialog' });
      const head = el('div', { class: 'r4-header' }, [el('span', { class: 'r4-title', text: this.title })]);
      if (this.closable) head.append(el('span', { class: 'r4-tool', text: '×', onclick: () => this.close() }));
      this.body = el('div', { class: 'r4-body r4-pad' });
      if (this.html) this.body.innerHTML = this.html;
      this.renderItems(this.body, this.items);
      win.append(head, this.body);
      if (this.buttons.length) {
        const foot = el('div', { class: 'r4-foot' });
        this.renderItems(foot, this.buttons.map(b => ({ xtype: 'button', ...b, handler: (btn, ev) => { b.handler && b.handler(this, ev); if (b.close !== false) this.close(); } })));
        win.append(foot);
      }
      this._win = win;
      const mask = el('div', { class: 'r4-mask' }, [win]);
      mask.addEventListener('mousedown', ev => { if (ev.target === mask && this.closable) this.close(); });
      this._esc = ev => { if (ev.key === 'Escape' && this.closable) this.close(); };
      return mask;
    },
    show() {
      if (!this.rendered) this.render(document.body);
      this.el.hidden = false;
      document.addEventListener('keydown', this._esc);
      this.fire('show', this); return this;
    },
    close() { document.removeEventListener('keydown', this._esc); this.fire('close', this); this.destroy(); }
  }, {
    title: 'window', description: 'Janela modal com título, corpo, botões no rodapé. Fecha com Esc, clique fora ou ×.',
    props: [
      { name: 'title / html / items', type: 'mixed', desc: 'Conteúdo da janela.' },
      { name: 'buttons', type: 'Array<{text,handler,variant,close}>', default: '[]', desc: 'Botões do rodapé; fecham a janela, exceto close:false.' },
      { name: 'width', type: 'number', default: '420', desc: 'Largura em px.' },
      { name: 'show() / close()', type: 'método', desc: 'Abre e fecha.' }
    ],
    events: ['show', 'close']
  });

  /* ================= viewport ================= */
  R4.define('viewport', {
    config: { items: [] },
    build() {
      const vp = el('div', { class: 'r4-viewport' });
      this._children = [];
      this.items.forEach(it => {
        const c = R4.create(Object.assign({}, it, { renderTo: null }), 'panel');
        c.render(vp);
        c.el.style.gridArea = it.region || 'center';
        this._children.push(c);
      });
      return vp;
    }
  }, {
    title: 'viewport', description: "Ocupa a tela inteira e distribui os itens por região: north, west, center, east, south (layout border).",
    props: [{ name: 'items', type: 'Array<cfg & {region}>', default: '[]', desc: "Cada item informa region: 'north' | 'west' | 'center' | 'east' | 'south'." }]
  });

  /* ================= R4.msg ================= */
  R4.module('msg', {
    alert(title, text, cb) {
      return R4.create({ xtype: 'window', title, html: '<p>' + esc(text) + '</p>', width: 360,
        buttons: [{ text: 'OK', variant: 'primary', handler: () => cb && cb() }] }).show();
    },
    confirm(title, text, cb) {
      return R4.create({ xtype: 'window', title, html: '<p>' + esc(text) + '</p>', width: 380,
        buttons: [{ text: 'Cancelar', handler: () => cb && cb(false) }, { text: 'Sim', variant: 'primary', handler: () => cb && cb(true) }] }).show();
    }
  }, {
    title: 'R4.msg', group: 'Núcleo', description: 'Atalhos de diálogo baseados em window.',
    props: [
      { name: 'alert(titulo, texto, cb)', type: 'window', desc: 'Mensagem com OK.' },
      { name: 'confirm(titulo, texto, cb(bool))', type: 'window', desc: 'Pergunta Sim/Cancelar.' }
    ]
  });
  R4.msg = R4.modules.msg.api;
})(window.R4);
