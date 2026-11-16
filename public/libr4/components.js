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
    config: { label: '', name: '', value: '', placeholder: '', inputType: 'text' },
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
    title: 'textfield', group: 'Formulários', description: 'Campo de texto com rótulo e eventos change/enter.',
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
  /*
   * Tabela de dados. Pontos de desempenho:
   *  - um único listener por tipo de evento na <table> (delegação);
   *  - linhas reaproveitadas (pool de <tr>): rolar/ordenar/filtrar só troca o texto das células;
   *  - virtualização (virtual / automática acima de virtualThreshold): só a janela visível + folga
   *    existe no DOM; espaçadores em <tbody> próprios mantêm a altura total da rolagem;
   *  - ordenação estável com chaves pré-extraídas e cache (versão dos dados + critérios);
   *  - texto de busca por linha calculado uma vez por versão dos dados.
   * Segurança: sem renderer o valor vai por textContent. renderer(valor, linha) devolve HTML e
   * NÃO é escapado — quem escreve o renderer deve usar R4.util.esc nos dados.
   */
  const COLL = new Intl.Collator('pt-BR', { numeric: true });
  const BUF = 8;   // linhas extras acima/abaixo da janela virtual
  const toNum = v => typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' && isFinite(v) ? +v : NaN;
  const nums = v => { const o = []; for (const x of v) { const n = toNum(x); if (n === n) o.push(n); } return o; };
  const AGG = {
    sum: v => nums(v).reduce((a, b) => a + b, 0),
    avg: v => { const n = nums(v); return n.length ? n.reduce((a, b) => a + b, 0) / n.length : null; },
    count: v => v.filter(x => x != null && x !== '').length,
    min: v => { const n = nums(v); return n.length ? n.reduce((a, b) => (b < a ? b : a)) : null; },
    max: v => { const n = nums(v); return n.length ? n.reduce((a, b) => (b > a ? b : a)) : null; }
  };
  const fmtVal = (c, v) => {
    if (v == null) return '';
    const f = c.format && R4.formats && R4.formats[c.format];
    return f ? String(f(v)) : String(v);
  };
  const withQuery = (src, p) => {
    const u = new URL(src, location.href);
    Object.keys(p).forEach(k => { if (p[k] != null && p[k] !== '') u.searchParams.set(k, p[k]); });
    return u.origin === location.origin ? u.pathname + u.search : u.href;
  };
  // {campo} no r4-click de uma ação vira o valor da linha (sem ';' para não encadear ações)
  const fillTpl = (tpl, row) => String(tpl).replace(/\{(\w+)\}/g, (_, k) => String(row[k] ?? '').replace(/[;\r\n]/g, ' '));

  const Grid = R4.define('grid', {
    config: { columns: [], data: [], pageSize: 0, filter: true, emptyText: 'Nenhum registro.', striped: true, src: '', method: 'GET', encrypt: false, params: null,
      virtual: false, virtualThreshold: 1000, rowHeight: 36, height: 0, selectable: '', idProperty: 'id', remote: false,
      resizable: false, columnMenu: false, exportable: false, exportName: 'dados', summaryLabel: 'Total',
      loadingText: 'Carregando...', errorText: 'Falha ao carregar.' },
    build() {
      const root = el('div', { class: 'r4-grid' });
      this.sortKey = null; this.sortDir = 1; this.page = 0; this.q = '';
      this.sorters = []; this._sel = new Map(); this._act = { r: 0, c: 0 }; this._win = [0, 0];
      this._ver = 0; this._pv = 0; this._pool = []; this._view = []; this._rows = []; this._base = 0; this._count = 0; this._total = 0; this._seq = 0;
      const bar = el('div', { class: 'r4-grid-bar' });
      if (this.filter) {
        this.filterEl = el('input', { class: 'r4-input', type: 'search', placeholder: 'Filtrar...', 'aria-label': 'Filtrar registros' });
        this.filterEl.addEventListener('input', () => {
          clearTimeout(this._qt);
          this._qt = setTimeout(() => this.setFilter(this.filterEl.value), this.remote ? 300 : 120);
        });
        bar.append(this.filterEl);
      }
      if (this.columnMenu || this.exportable) {
        bar.append(el('span', { class: 'r4-fill' }));
        const tool = (k, t, l) => el('button', { type: 'button', class: 'r4-btn r4-grid-tool', 'data-menu': k, 'aria-haspopup': 'menu', 'aria-expanded': 'false', title: l, text: t });
        if (this.columnMenu) bar.append(tool('cols', '☰ Colunas', 'Mostrar ou ocultar colunas'));
        if (this.exportable) bar.append(tool('export', '⇩ Exportar', 'Exportar os registros filtrados'));
        bar.addEventListener('click', ev => { const b = ev.target.closest('[data-menu]'); b && this._toggleMenu(b.getAttribute('data-menu'), b); });
      }
      if (bar.childNodes.length) root.append(bar);
      this.table = el('table', { class: 'r4-table' + (this.striped ? ' r4-striped' : ''), role: 'grid' });
      this.thead = el('thead'); this.tbody = el('tbody'); this.tfoot = el('tfoot', { hidden: true });
      // espaçadores da virtualização ficam em <tbody> próprios: as listras (nth-child) do tbody principal não mudam
      const spacer = () => { const td = el('td', { class: 'r4-vspace' }); return [el('tbody', { role: 'presentation', 'aria-hidden': 'true', hidden: true }, [el('tr', {}, [td])]), td]; };
      [this._tTop, this._topTd] = spacer(); [this._tBot, this._botTd] = spacer();
      this._msgTd = el('td', { class: 'r4-empty' });
      this._msg = el('tr', { class: 'r4-msgrow', hidden: true }, [this._msgTd]);
      this.tbody.append(this._msg);
      this.table.append(this.thead, this._tTop, this.tbody, this._tBot, this.tfoot);
      this.scroller = el('div', { class: 'r4-grid-scroll' }, [this.table]);
      this.mask = el('div', { class: 'r4-grid-mask', hidden: true }, [el('span', { class: 'r4-grid-spin', 'aria-hidden': 'true' }), el('span', { text: this.loadingText })]);
      this.pager = el('div', { class: 'r4-pager' });
      root.append(this.scroller, this.mask, this.pager);
      root.style.setProperty('--r4-rh', this.rowHeight + 'px');
      // delegação: um listener por tipo de evento para a tabela inteira
      this.table.addEventListener('click', ev => this._onClick(ev));
      this.table.addEventListener('dblclick', ev => this._onDbl(ev));
      this.table.addEventListener('keydown', ev => this._onKey(ev));
      this.table.addEventListener('pointerdown', ev => this._onDown(ev));
      this.scroller.addEventListener('scroll', () => this._onScroll(), { passive: true });
      return root;
    },
    afterRender() {
      this.refresh();
      this.src && this.load();
      if (window.ResizeObserver) { this._ro = new ResizeObserver(() => this._v && this._schedule()); this._ro.observe(this.scroller); }
    },

    /* ---------- dados ---------- */
    /** Busca this.src (JSON); aceita array puro ou {retorno|data|rows: [...]} (remote: {total, retorno}). Em erro, this.data fica intacto. */
    async load() {
      if (!this.src) return this;
      const seq = ++this._seq;
      this._busy(true);
      try {
        let url = this.src, data = this.params;
        if (this.remote) {
          const s = this._sorters()[0];
          const p = { page: this.page + 1, size: this._size(), sort: s ? s.key : null, dir: s ? (s.dir > 0 ? 'asc' : 'desc') : null, q: this.q || null };
          if (/^get$/i.test(this.method)) url = withQuery(this.src, Object.assign({}, this.params, p));
          else data = Object.assign({}, this.params, p);
        }
        const r = await this._request(url, data);
        if (seq !== this._seq || this._dead) return this;
        const rows = Array.isArray(r) ? r : r && (r.retorno || r.data || r.rows);
        const msg = r && !Array.isArray(r) && (typeof r.retorno === 'string' ? r.retorno : r.mensagem || r.message);
        // status de erro no corpo ({status: 500, ...}) também é falha — this.data só muda em caso de sucesso
        if ((r && !Array.isArray(r) && +r.status >= 400) || (!Array.isArray(rows) && msg)) throw new Error(msg || 'HTTP ' + r.status);
        if (rows != null && !Array.isArray(rows)) throw new Error('Resposta sem lista de registros.');
        this._err = null;
        if (this.remote) this._setRemote(rows || [], r && r.total);
        else this.loadData(rows || []);
      } catch (e) {
        if (seq !== this._seq || this._dead) return this;
        this._err = e;
        this.fire('loaderror', this, e);
        this._render();
      } finally {
        if (seq === this._seq && !this._dead) this._busy(false);
      }
      return this;
    },
    /**
     * Requisição JSON verificando o status HTTP (R4.http.request não expõe res.ok).
     * Mesmo formato do R4.http: corpo criptografado com R4.crypto quando encrypt=true.
     */
    async _request(url, data) {
      const get = /^get$/i.test(this.method);
      const body = data == null || get ? undefined : JSON.stringify(this.encrypt ? await R4.crypto.encrypt(data) : data);
      const res = await fetch(url, { method: this.method, headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body });
      let r = null, bad = false;
      try { r = await res.json(); } catch (e) { bad = true; }
      if (!res.ok) {
        const m = r && (typeof r.retorno === 'string' ? r.retorno : r.mensagem || r.message);
        throw new Error('HTTP ' + res.status + (m ? ': ' + m : ''));
      }
      if (bad) throw new Error('A resposta não é JSON válido.');
      return r;
    },
    reload() { return this.load(); },
    loadData(d) {
      this.data = Array.isArray(d) ? d : []; this.page = 0; this._ver++; this._err = null;
      const had = this._sel.size; this._sel.clear(); this._anchor = null;
      if (this._act.r > 0) this._act.r = 0;
      this.refresh();
      this.fire('load', this, this.data);
      had && this.fire('selectionchange', this, []);
      return this;
    },
    _setRemote(rows, total) {
      this.data = rows; this._ver++;
      this._total = Math.max(0, +total || rows.length);
      rows.forEach(r => { const k = this._key(r); if (this._sel.has(k)) this._sel.set(k, r); });
      if (!this.columns.length) this.refresh(); else this._update();
      this.fire('load', this, rows);
    },
    /** Dados atuais (com as edições feitas na grade). */
    getData() { return this.data.slice(); },
    /** Linhas como aparecem: filtradas e ordenadas (todas as páginas; no modo remoto, a página atual). */
    getView() { return this._view.slice(); },
    setFilter(q) {
      this.q = String(q ?? '').trim().toLowerCase();
      if (this.filterEl && this.filterEl.value.trim().toLowerCase() !== this.q) this.filterEl.value = q;
      this.page = 0;
      if (this.remote) this.load(); else { this.scroller.scrollTop = 0; this._update(false); }
      return this;
    },

    /* ---------- ordenação ---------- */
    _sorters() {   // mantém compatibilidade com quem usa grid.sortKey / grid.sortDir
      const s = this.sorters;
      if (this.sortKey != null && (!s.length || s[0].key !== this.sortKey || s[0].dir !== this.sortDir)) this.sorters = [{ key: this.sortKey, dir: this.sortDir < 0 ? -1 : 1 }];
      else if (this.sortKey == null && s.length) this.sorters = [];
      return this.sorters;
    },
    /** sort('nome') alterna asc/desc; sort('nome', 'desc'); sort('uf', 'asc', true) acrescenta (multi-coluna) */
    sort(key, dir, add) {
      let s = this._sorters().slice();
      const i = s.findIndex(x => x.key === key), cur = i >= 0 ? s[i].dir : 0;
      const d = dir === 'desc' || dir === -1 ? -1 : dir === 'asc' || dir === 1 ? 1 : cur ? -cur : 1;
      if (add) { if (i >= 0) s[i] = { key, dir: d }; else s.push({ key, dir: d }); } else s = [{ key, dir: d }];
      return this.setSorters(s);
    },
    /** setSorters([{key, dir:'asc'|'desc'}]) — [] remove a ordenação */
    setSorters(list) {
      this.sorters = (list || []).filter(x => x && x.key != null).map(x => ({ key: x.key, dir: x.dir === 'desc' || x.dir < 0 ? -1 : 1 }));
      this.sortKey = this.sorters.length ? this.sorters[0].key : null;
      this.sortDir = this.sorters.length ? this.sorters[0].dir : 1;
      this.fire('sortchange', this, this.getSorters());
      if (this.remote) { this.page = 0; this._buildHead(); this.load(); } else this._update();
      return this;
    },
    getSorters() { return this._sorters().map(s => ({ key: s.key, dir: s.dir > 0 ? 'asc' : 'desc' })); },
    _sorted(s) {
      const sig = s.map(x => x.key + (x.dir > 0 ? '+' : '-')).join('|'), c = this._sortCache;
      if (c && c.ver === this._ver && c.sig === sig && c.src === this.data) return c.rows;
      const data = this.data, n = data.length;
      const keys = s.map(({ key, dir }) => {   // extrai as chaves uma vez (e decide número x texto por coluna)
        const vals = new Array(n); let num = true;
        for (let i = 0; i < n; i++) { const v = data[i] == null ? null : data[i][key]; vals[i] = v; if (num && v != null && typeof v !== 'number') num = false; }
        if (!num) for (let i = 0; i < n; i++) vals[i] = vals[i] == null ? '' : String(vals[i]);
        return { vals, num, dir };
      });
      const idx = new Array(n);
      for (let i = 0; i < n; i++) idx[i] = i;
      idx.sort((a, b) => {
        for (let k = 0; k < keys.length; k++) {
          const K = keys[k], x = K.vals[a], y = K.vals[b];
          let d;
          if (K.num) d = x == null ? (y == null ? 0 : -1) : y == null ? 1 : x - y;
          else d = x === y ? 0 : COLL.compare(x, y);
          if (d) return d * K.dir;
        }
        return a - b;   // estável: empate mantém a ordem original
      });
      const rows = new Array(n);
      for (let i = 0; i < n; i++) rows[i] = data[idx[i]];
      this._sortCache = { ver: this._ver, sig, src: data, rows };
      return rows;
    },
    _texts() {   // texto de busca por linha, calculado sob demanda e guardado até os dados mudarem
      const keys = this.columns.map(c => c.dataIndex).filter(k => k != null), sig = this._ver + '|' + keys.join(',');
      if (!this._txt || this._txtSig !== sig) { this._txt = new Map(); this._txtSig = sig; }
      const m = this._txt;
      return r => {
        let t = m.get(r);
        if (t === undefined) { t = keys.map(k => String((r && r[k]) ?? '')).join('\u0001').toLowerCase(); m.set(r, t); }
        return t;
      };
    },
    _compute() {
      if (this.remote) { this._view = this.data; return; }
      let rows = this.data;
      const s = this._sorters();
      if (s.length) rows = this._sorted(s);
      if (this.q) { const txt = this._texts(), q = this.q; rows = rows.filter(r => txt(r).includes(q)); }
      this._view = rows;
    },

    /* ---------- montagem ---------- */
    refresh() {
      if (!this.el) return this;
      if (this._editor) this._endEdit(true, true);
      if (!this.columns.length && this.data.length && this.data[0] && typeof this.data[0] === 'object') this.columns = Object.keys(this.data[0]);
      this.columns = this.columns.map(c => typeof c === 'string' ? { header: c.replace(/[_-]+/g, ' ').replace(/^./, m => m.toUpperCase()), dataIndex: c } : c);
      this._mode = this.selectable === 'multi' ? 'multi' : this.selectable ? 'single' : '';
      this._multi = this._mode === 'multi'; this._off = this._multi ? 1 : 0;
      this._cols = this.columns.filter(c => !c.hidden);
      this._v = !!(this.virtual || (!this.pageSize && !this.remote && this.virtualThreshold > 0 && this.data.length > this.virtualThreshold));
      this.el.classList.toggle('r4-grid-v', this._v);
      this.table.classList.toggle('r4-fixed', this._v || !!this._fixed);
      const h = this._v || this.height ? (this.height || 420) + 'px' : '';
      this.scroller.style.height = h; this.scroller.style.maxHeight = h ? 'none' : '';
      if (this._multi) this.table.setAttribute('aria-multiselectable', 'true'); else this.table.removeAttribute('aria-multiselectable');
      const span = this._cols.length + this._off;
      this._topTd.colSpan = this._botTd.colSpan = this._msgTd.colSpan = Math.max(1, span);
      this._pool.forEach(tr => tr.remove()); this._pool = []; this._pv++;
      this._buildHead();
      this._compute();
      this._render();
      return this;
    },
    _update(head = true) { this._compute(); head && this._buildHead(); this._render(); },
    _size() { return this.pageSize || (this.remote ? 25 : 0); },
    _buildHead() {
      const tr = el('tr', { 'aria-rowindex': 1 }), s = this._sorters();
      if (this._multi) {
        this._all = el('input', { type: 'checkbox', class: 'r4-check-all', tabindex: '-1', 'aria-label': 'Selecionar todos os registros filtrados' });
        tr.append(el('th', { class: 'r4-check-cell', tabindex: '-1' }, [this._all]));
      } else this._all = null;
      this._cols.forEach(c => {
        const th = el('th', { scope: 'col', tabindex: '-1' }, [el('span', { class: 'r4-th-text', text: c.header ?? c.dataIndex ?? '' })]);
        if (c.width) th.style.width = c.width + 'px';
        if (c.minWidth) th.style.minWidth = c.minWidth + 'px';
        if (c.align) th.style.textAlign = c.align;
        if (c.sortable !== false && c.dataIndex != null && !c.actions) {
          th.classList.add('r4-sortable');
          const i = s.findIndex(x => x.key === c.dataIndex);
          if (i >= 0) {
            th.setAttribute('aria-sort', s[i].dir > 0 ? 'ascending' : 'descending');
            th.append(el('span', { class: 'r4-sort', text: (s[i].dir > 0 ? ' ▲' : ' ▼') + (s.length > 1 ? i + 1 : '') }));
          }
        }
        if (this.resizable && c.resizable !== false) th.append(el('span', { class: 'r4-col-resize', title: 'Arraste para redimensionar', 'aria-hidden': 'true' }));
        tr.append(th);
      });
      this.thead.replaceChildren(tr);
      this.table.setAttribute('aria-colcount', this._cols.length + this._off);
      this._tab = null;
      this._syncWidth();
    },
    _render() {
      const view = this._view, size = this._size();
      let rows = view, base = 0, total = view.length;
      if (this.remote) { total = this._total; base = this.page * size; }
      else if (size) {
        this.page = Math.max(0, Math.min(this.page, Math.ceil(total / size) - 1));
        base = this.page * size; rows = view.slice(base, base + size);
      }
      if (this._err) { rows = []; total = 0; }
      this._rows = rows; this._base = base; this._count = total;
      if (this._act.r >= rows.length) this._act.r = rows.length - 1;
      const sum = this._cols.some(c => c.summary);
      this.table.setAttribute('aria-rowcount', total + 1 + (sum ? 1 : 0));
      this._paint();
      this._msg.hidden = rows.length > 0;
      if (!rows.length) {
        this._msgTd.className = this._err ? 'r4-empty r4-grid-err' : 'r4-empty';
        this._msgTd.replaceChildren(...(this._err
          ? [el('span', { text: this.errorText + (this._err.message ? ' (' + this._err.message + ')' : '') }), ' ',
            this.src ? el('button', { type: 'button', class: 'r4-btn r4-grid-retry', text: '↻ Tentar de novo' }) : '']
          : [this._loading ? this.loadingText : this.emptyText]));
      } else if (this._msgTd.firstChild) this._msgTd.replaceChildren();
      this._renderSummary(sum);
      this._renderPager();
      this._syncAll();
    },
    _mkRow() {
      const tr = document.createElement('tr');
      if (this._multi) tr.append(el('td', { class: 'r4-check-cell', tabindex: '-1' }, [el('input', { type: 'checkbox', class: 'r4-check', tabindex: '-1', 'aria-label': 'Selecionar linha' })]));
      for (const c of this._cols) {
        const td = document.createElement('td');
        td.tabIndex = -1;
        if (c.align) td.style.textAlign = c.align;
        if (c.actions) td.className = 'r4-actions';
        else if (c.editable) td.className = 'r4-editable';
        tr.append(td);
      }
      return tr;
    },
    _fill(tr, row) {
      tr._row = row; tr._pv = this._pv;
      const cols = this._cols, off = this._off;
      for (let j = 0; j < cols.length; j++) {
        const c = cols[j], td = tr.cells[j + off];
        if (c.actions) { td.replaceChildren(...this._actionBtns(c, row)); continue; }
        const v = c.dataIndex != null && row != null ? row[c.dataIndex] : undefined;
        if (c.renderer) td.innerHTML = c.renderer(v, row) ?? '';   // HTML de quem escreveu o renderer (não escapado)
        else td.textContent = fmtVal(c, v);
      }
    },
    _actionBtns(c, row) {
      return c.actions.map((a, i) => {
        const b = el('button', { type: 'button', class: 'r4-btn r4-grid-act' + (a.variant ? ' r4-btn-' + a.variant : ''), 'data-act': i, tabindex: '-1',
          title: a.title || a.text || null, 'aria-label': a.text || a.title || 'Ação' },
          [a.icon ? el('span', { class: 'r4-ico', 'aria-hidden': 'true', text: a.icon }) : null, a.text && !(a.icon && a.iconOnly) ? el('span', { text: a.text }) : null]);
        const rc = a['r4-click'] || a.r4Click;
        if (rc) b.setAttribute('r4-click', fillTpl(rc, row));
        if (a['r4-confirm'] || a.confirm) b.setAttribute('r4-confirm', fillTpl(a['r4-confirm'] || a.confirm, row));
        return b;
      });
    },
    _state(tr, row, ri) {
      const sel = this._sel.size > 0 && this._sel.has(this._key(row));
      if (tr._sel !== sel) {
        tr._sel = sel;
        tr.classList.toggle('r4-selected', sel);
        if (this._mode) tr.setAttribute('aria-selected', sel ? 'true' : 'false');
        if (this._multi) tr.cells[0].firstChild.checked = sel;
      }
      tr._ri = ri;
      tr.setAttribute('aria-rowindex', this._base + ri + 2);
    },
    /** Desenha as linhas da janela atual reaproveitando os <tr> do pool. */
    _paint() {
      if (this._editor) this._endEdit(true, true);
      const rows = this._rows, n = rows.length, rh = this.rowHeight, pool = this._pool, tb = this.tbody;
      let a = 0, b = n;
      if (this._v) {
        const sc = this.scroller, vh = sc.clientHeight || this.height || 420;
        const top = Math.max(0, sc.scrollTop - (this.thead.offsetHeight || 0));
        b = Math.min(n, Math.ceil((top + vh) / rh) + BUF);
        a = Math.max(0, Math.min(Math.floor(top / rh) - BUF, b - Math.ceil(vh / rh) - BUF));
        a -= a % 2;   // início sempre par: as listras não "piscam" ao rolar
        this._topTd.style.height = a * rh + 'px'; this._botTd.style.height = (n - b) * rh + 'px';
      }
      this._tTop.hidden = this._tBot.hidden = !this._v;
      this._win = [a, b];
      const k = b - a;
      while (pool.length < k) pool.push(this._mkRow());
      if (pool.length > k + 200) pool.splice(k + 200).forEach(tr => tr.remove());
      for (let i = 0; i < pool.length; i++) {
        const tr = pool[i];
        if (i >= k) { if (tr.parentNode) tr.remove(); continue; }
        if (tr.parentNode !== tb) tb.insertBefore(tr, this._msg);
        const ri = a + i, row = rows[ri];
        if (tr._row !== row || tr._pv !== this._pv) this._fill(tr, row);
        this._state(tr, row, ri);
      }
      this._syncTab(false);
    },
    _schedule() { if (!this._raf) this._raf = requestAnimationFrame(() => { this._raf = 0; !this._dead && this._paint(); }); },
    _onScroll() { if (this._v) this._schedule(); },
    _renderSummary(has) {
      this.tfoot.hidden = !has;
      if (!has) return;
      const view = this._err ? [] : this._view;
      const tr = el('tr', { class: 'r4-summary', 'aria-rowindex': this._count + 2 });
      if (this._multi) tr.append(el('td'));
      this._cols.forEach((c, j) => {
        let txt = '';
        if (c.summary) {
          const fn = typeof c.summary === 'function' ? c.summary : AGG[c.summary];
          const v = fn ? fn(view.map(r => r[c.dataIndex]), view, c) : null;
          txt = v == null || (typeof v === 'number' && !isFinite(v)) ? ''
            : c.summary === 'count' ? R4.util.number(v, 0)
            : typeof v === 'number' && !c.format ? R4.util.number(v, Number.isInteger(v) ? 0 : 2) : fmtVal(c, v);
        } else if (j === 0) txt = this.summaryLabel;
        tr.append(el('td', { text: txt, style: c.align ? { textAlign: c.align } : null }));
      });
      this.tfoot.replaceChildren(tr);
    },
    _renderPager() {
      const size = this._size(), total = this._count, show = !!size || this._v;
      this.pager.hidden = !show;
      if (!show) return;
      if (!size) { this.pager.replaceChildren(el('span', { text: R4.util.number(total, 0) + ' registros' })); return; }
      const pages = Math.max(1, Math.ceil(total / size));
      this.pager.replaceChildren(
        el('button', { type: 'button', class: 'r4-btn', disabled: this.page === 0, text: '‹', 'aria-label': 'Página anterior', onclick: () => this.setPage(this.page - 1) }),
        el('span', { text: ` ${this.page + 1} / ${pages}  ·  ${total} registros ` }),
        el('button', { type: 'button', class: 'r4-btn', disabled: this.page >= pages - 1, text: '›', 'aria-label': 'Próxima página', onclick: () => this.setPage(this.page + 1) }));
    },
    setPage(p) {
      const size = this._size(); if (!size) return this;
      this.page = Math.max(0, Math.min(p, Math.ceil(this._count / size) - 1));
      this.scroller.scrollTop = 0; this._act.r = Math.min(this._act.r, 0);
      if (this.remote) this.load(); else this._render();
      return this;
    },
    _busy(on) {
      this._loading = on;
      this.el && this.el.setAttribute('aria-busy', on ? 'true' : 'false');
      this.mask.hidden = !on;
      if (!this._rows.length && !this._err) this._msgTd.textContent = on ? this.loadingText : this.emptyText;
    },

    /* ---------- seleção ---------- */
    _key(r) { const p = this.idProperty, k = p && r && typeof r === 'object' ? r[p] : undefined; return k != null && k !== '' ? k : r; },
    getSelection() { return [...this._sel.values()]; },
    isSelected(row) { return this._sel.has(this._key(row)); },
    clearSelection() { if (this._sel.size) { this._sel.clear(); this._selChanged(); } return this; },
    /** select(linha | [linhas] | fn(linha)) — fn escolhe entre as linhas filtradas; keep=true soma à seleção atual */
    select(rows, keep) {
      const list = typeof rows === 'function' ? this._view.filter(rows) : [].concat(rows ?? []);
      if (!keep || this._mode !== 'multi') this._sel.clear();
      (this._mode === 'multi' ? list : list.slice(-1)).forEach(r => this._sel.set(this._key(r), r));
      this._selChanged();
      return this;
    },
    deselect(rows) { [].concat(rows ?? []).forEach(r => this._sel.delete(this._key(r))); this._selChanged(); return this; },
    /** Seleciona todas as linhas que passam no filtro (modo multi). */
    selectAll() { return this._toggleAll(true); },
    _toggleAll(on) {
      const v = this._err ? [] : this._view;
      if (on && this._mode === 'multi') v.forEach(r => this._sel.set(this._key(r), r)); else v.forEach(r => this._sel.delete(this._key(r)));
      this._selChanged();
      return this;
    },
    _rowSel(ri, ev, toggle) {
      const row = this._rows[ri], k = this._key(row);
      if (this._multi && ev && ev.shiftKey && this._anchor != null) {
        const [x, y] = this._anchor < ri ? [this._anchor, ri] : [ri, this._anchor];
        if (!(ev.ctrlKey || ev.metaKey)) this._sel.clear();
        for (let i = x; i <= y; i++) this._sel.set(this._key(this._rows[i]), this._rows[i]);
      } else if (this._multi && (toggle || (ev && (ev.ctrlKey || ev.metaKey)))) {
        this._sel.has(k) ? this._sel.delete(k) : this._sel.set(k, row);
        this._anchor = ri;
      } else {
        if (this._sel.size === 1 && this._sel.has(k)) return;   // nada mudou
        this._sel.clear(); this._sel.set(k, row); this._anchor = ri;
      }
      this._selChanged();
    },
    _selChanged() {
      for (const tr of this._pool) if (tr.parentNode) this._state(tr, tr._row, tr._ri);
      this._syncAll();
      this.fire('selectionchange', this, this.getSelection());
    },
    _syncAll() {
      if (!this._all) return;
      const v = this._err ? [] : this._view; let k = 0;
      if (this._sel.size) for (const r of v) if (this._sel.has(this._key(r))) k++;
      this._all.checked = v.length > 0 && k === v.length;
      this._all.indeterminate = k > 0 && k < v.length;
    },

    /* ---------- teclado e foco (role=grid, tabindex móvel) ---------- */
    _cellOf(t) {
      for (let n = t; n && n !== this.table; n = n.parentNode) {
        if ((n.localName === 'td' || n.localName === 'th') && n.parentNode && n.parentNode.parentNode) {
          const g = n.parentNode.parentNode;
          if (g === this.tbody || g === this.thead) return n;
        }
      }
      return null;
    },
    _cellAt(r, c) {
      if (r < 0) { const h = this.thead.rows[0]; return h ? h.cells[c] : null; }
      const [a, b] = this._win;
      return r >= a && r < b && this._pool[r - a] ? this._pool[r - a].cells[c] : null;
    },
    _syncTab(focus) {
      const { r, c } = this._act;
      let cell = this._cellAt(r, c);
      if (!cell && !focus) cell = this._cellAt(this._win[0] < this._win[1] ? this._win[0] : -1, c) || this._cellAt(-1, 0);
      if (this._tab && this._tab !== cell) this._tab.tabIndex = -1;
      if (cell) { cell.tabIndex = 0; this._tab = cell; if (focus) cell.focus(); }
    },
    _setAct(r, c, focus) {
      const n = this._rows.length, last = this._cols.length + this._off - 1;
      r = Math.max(-1, Math.min(r, n - 1)); c = Math.max(0, Math.min(c, last));
      this._act = { r, c };
      if (r >= 0 && this._v) this._scrollTo(r);
      this._syncTab(focus);
    },
    _scrollTo(r) {
      const sc = this.scroller, rh = this.rowHeight, vh = sc.clientHeight || this.height || 420, hh = this.thead.offsetHeight || 0;
      const y = r * rh, st = sc.scrollTop;
      let nt = st;
      if (y < st) nt = y; else if (y + rh > st + vh - hh) nt = y + rh - vh + hh;
      if (nt !== st) sc.scrollTop = nt;
      if (nt !== st || r < this._win[0] || r >= this._win[1]) this._paint();
    },
    _onKey(ev) {
      const t = ev.target;
      if (this._editor || t.closest('.r4-cell-editor')) return;
      if (t.classList.contains('r4-grid-act')) {   // dentro da célula de ações: ←/→ entre botões, Esc volta à célula
        const sib = ev.key === 'ArrowRight' ? t.nextElementSibling : ev.key === 'ArrowLeft' ? t.previousElementSibling : null;
        if (sib) { ev.preventDefault(); sib.focus(); }
        else if (ev.key === 'Escape') { ev.preventDefault(); this._syncTab(true); }
        return;
      }
      const cell = this._cellOf(t);
      if (!cell || cell.parentNode === this._msg) return;
      const n = this._rows.length, last = this._cols.length + this._off - 1;
      const pg = Math.max(1, Math.floor((this.scroller.clientHeight || this.height || 420) / this.rowHeight) - 1);
      let { r, c } = this._act;
      if (cell !== this._cellAt(r, c)) { r = cell.parentNode.parentNode === this.thead ? -1 : cell.parentNode._ri; c = cell.cellIndex; }
      const col = this._cols[c - this._off];
      switch (ev.key) {
        case 'ArrowDown': r = Math.min(n - 1, r + 1); break;
        case 'ArrowUp': r = Math.max(-1, r - 1); break;
        case 'ArrowRight':
          if (ev.altKey && r < 0 && col) return ev.preventDefault(), this._resizeBy(col, 16);
          c = Math.min(last, c + 1); break;
        case 'ArrowLeft':
          if (ev.altKey && r < 0 && col) return ev.preventDefault(), this._resizeBy(col, -16);
          c = Math.max(0, c - 1); break;
        case 'Home': if (ev.ctrlKey) r = n ? 0 : -1; else c = 0; break;
        case 'End': if (ev.ctrlKey) r = n - 1; else c = last; break;
        case 'PageDown': r = Math.min(n - 1, Math.max(0, r) + pg); break;
        case 'PageUp': r = Math.max(r < 0 ? -1 : 0, r - pg); break;
        case 'F2': case 'Enter': case ' ': case 'Spacebar': {
          ev.preventDefault();
          if (t.localName === 'input' && t.type === 'checkbox' && ev.key !== 'Enter') return t.click();
          if (r < 0) {
            if (this._multi && c === 0) return this._toggleAll(!this._all.checked);
            if (col && col.dataIndex != null && col.sortable !== false && !col.actions) this.sort(col.dataIndex, undefined, ev.shiftKey);
            return this._setAct(-1, c, true);
          }
          if (ev.key !== ' ' && ev.key !== 'Spacebar' && col && col.actions) { const b = cell.querySelector('.r4-grid-act'); b && b.focus(); return; }
          if (ev.key !== ' ' && ev.key !== 'Spacebar' && col && col.editable) return this._edit(r, c);
          if (ev.key === 'F2') return;
          this._rowSel(r, ev, this._multi && ev.key !== 'Enter');
          if (ev.key === 'Enter') this.fire('rowclick', this, this._rows[r], ev);
          return;
        }
        default: return;
      }
      ev.preventDefault();
      this._setAct(r, c, true);
    },

    /* ---------- mouse ---------- */
    _onClick(ev) {
      const t = ev.target;
      if (t.closest('.r4-grid-retry')) return this.reload();
      const cell = this._cellOf(t);
      if (!cell) return;
      if (cell.parentNode.parentNode === this.thead) {
        if (t.classList.contains('r4-check-all')) return this._toggleAll(t.checked);
        if (t.closest('.r4-col-resize') || Date.now() - (this._resizedAt || 0) < 350) return;
        this._setAct(-1, cell.cellIndex, true);
        const c = this._cols[cell.cellIndex - this._off];
        if (c && c.dataIndex != null && c.sortable !== false && !c.actions) this.sort(c.dataIndex, undefined, ev.shiftKey);
        return;
      }
      const tr = cell.parentNode, ri = tr._ri, row = tr._row;
      if (ri == null || row === undefined || (this._editor && this._editor.td === cell)) return;
      const ab = t.closest('[data-act]');
      if (ab) {
        const c = this._cols[cell.cellIndex - this._off], a = c && c.actions && c.actions[+ab.getAttribute('data-act')];
        if (a) { a.handler && a.handler(row, this, ev); this.fire('action', this, a.name || a.text || a.icon, row, ev); }
        return;
      }
      this._setAct(ri, cell.cellIndex, !t.closest('input,select,textarea,button,a'));
      if (t.classList.contains('r4-check')) return this._rowSel(ri, ev, true);
      this._rowSel(ri, ev, false);
      this.fire('rowclick', this, row, ev);
    },
    _onDbl(ev) {
      const cell = this._cellOf(ev.target);
      if (!cell || cell.parentNode.parentNode !== this.tbody || cell.parentNode._ri == null) return;
      const c = this._cols[cell.cellIndex - this._off];
      if (c && c.editable && !c.actions) this._edit(cell.parentNode._ri, cell.cellIndex);
      this.fire('rowdblclick', this, cell.parentNode._row, ev);
    },
    /* redimensionar coluna arrastando a borda do cabeçalho */
    _onDown(ev) {
      const h = ev.target.closest && ev.target.closest('.r4-col-resize');
      if (!h) return;
      ev.preventDefault(); ev.stopPropagation();
      const th = h.parentNode, c = this._cols[th.cellIndex - this._off];
      if (!c) return;
      this._freeze();
      const x0 = ev.clientX, w0 = th.offsetWidth || c.width || 120, min = c.minWidth || 40;
      const move = e => { c.width = Math.max(min, Math.round(w0 + e.clientX - x0)); th.style.width = c.width + 'px'; this._syncWidth(); };
      const up = () => {
        document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', up);
        this._drag = null; this._resizedAt = Date.now(); this.el && this.el.classList.remove('r4-resizing');
        this.fire('columnresize', this, c, c.width);
      };
      document.addEventListener('pointermove', move); document.addEventListener('pointerup', up);
      this._drag = up; this.el.classList.add('r4-resizing');
    },
    _resizeBy(c, dx) {
      this._freeze();
      c.width = Math.max(c.minWidth || 40, (c.width || 120) + dx);
      this._buildHead(); this._syncTab(true);
      this.fire('columnresize', this, c, c.width);
    },
    _freeze() {   // passa a usar larguras fixas (table-layout: fixed) a partir das larguras atuais
      if (this._fixed) return;
      const cells = this.thead.rows[0] ? this.thead.rows[0].cells : [];
      this._cols.forEach((c, j) => { const w = cells[j + this._off] && cells[j + this._off].offsetWidth; if (!c.width && w) c.width = w; });
      this._fixed = true; this.table.classList.add('r4-fixed'); this._syncWidth();
    },
    _syncWidth() {
      if (!this._fixed) { this.table.style.width = ''; return; }
      this.table.style.width = this._cols.reduce((s, c) => s + (c.width || 120), this._off ? 40 : 0) + 'px';
    },

    /* ---------- colunas ---------- */
    _colOf(key) { return typeof key === 'object' ? key : this.columns.find(c => c.dataIndex === key || c.header === key); },
    setColumnVisible(key, show) {
      const c = this._colOf(key);
      if (!c || !!c.hidden === !show) return this;
      if (!show && this._cols.length <= 1) return this;   // sempre sobra uma coluna
      c.hidden = !show; this.refresh();
      this.fire('columnchange', this, c, !!show);
      return this;
    },
    showColumn(k) { return this.setColumnVisible(k, true); },
    hideColumn(k) { return this.setColumnVisible(k, false); },

    /* ---------- edição na célula ---------- */
    /** startEdit(índiceDaLinhaNaPágina, 'campo') */
    startEdit(ri, field) {
      const j = this._cols.findIndex(c => c.dataIndex === field);
      return j >= 0 ? this._edit(ri, j + this._off) : false;
    },
    _edit(ri, ci) {
      const col = this._cols[ci - this._off];
      if (!col || !col.editable || col.actions || ri < 0 || ri >= this._rows.length) return false;
      if (this._editor) this._endEdit(true, true);
      this._setAct(ri, ci, false);
      const td = this._cellAt(ri, ci);
      if (!td) return false;
      const row = this._rows[ri], old = row[col.dataIndex], ed = col.editable;
      const type = typeof ed === 'object' ? ed.type || (ed.options ? 'select' : 'text') : ed === true ? (typeof old === 'number' ? 'number' : 'text') : ed;
      let input;
      if (type === 'select' || (typeof ed === 'object' && ed.options)) {
        const opts = ((ed && ed.options) || []).map(o => o && typeof o === 'object' ? { v: o.value ?? o.valor, t: o.text ?? o.texto ?? o.value ?? o.valor } : { v: o, t: o });
        input = el('select', { class: 'r4-input r4-cell-editor' }, opts.map(o => el('option', { value: String(o.v ?? ''), text: String(o.t ?? '') })));
        input._opts = opts;
      } else input = el('input', { class: 'r4-input r4-cell-editor', type: type === 'number' ? 'number' : type === 'date' ? 'date' : 'text', step: type === 'number' ? 'any' : null });
      input.value = old == null ? '' : type === 'date' ? String(old).slice(0, 10) : String(old);
      input.setAttribute('aria-label', 'Editar ' + (col.header ?? col.dataIndex));
      this._editor = { input, td, tr: td.parentNode, row, col, ri, ci, old, type };
      td.classList.add('r4-editing');
      td.replaceChildren(input);
      input.addEventListener('keydown', ev => {
        ev.stopPropagation();
        if (ev.key === 'Enter' || ev.key === 'Tab') { ev.preventDefault(); this._endEdit(true); }
        else if (ev.key === 'Escape') { ev.preventDefault(); this._endEdit(false); }
      });
      input.addEventListener('blur', () => this._endEdit(true, true));
      input.focus(); input.select && input.select();
      return true;
    },
    _endEdit(commit, quiet) {
      const e = this._editor;
      if (!e) return;
      this._editor = null;
      e.td.classList.remove('r4-editing');
      let ctx = null;
      if (commit) {
        const raw = e.input.value;
        let v = raw;
        if (e.input._opts) { const o = e.input._opts.find(x => String(x.v ?? '') === raw); v = o ? o.v : raw; }
        else if (e.type === 'number') v = raw.trim() === '' ? null : Number(raw.replace(',', '.'));
        else if (e.type === 'date') v = raw || null;
        const invalid = typeof v === 'number' && !isFinite(v);
        if (!invalid && v !== e.old && !(v === null && e.old == null)) {
          ctx = { row: e.row, field: e.col.dataIndex, value: v, oldValue: e.old, column: e.col };
          if (this.fire('beforecellchange', this, ctx) === false) ctx = null;
          else { e.row[ctx.field] = ctx.value; this._ver++; }
        }
      }
      if (e.tr._row === e.row) this._fill(e.tr, e.row);
      if (ctx) { this._renderSummary(this._cols.some(c => c.summary)); this.fire('cellchange', this, ctx); }
      if (!quiet) this._syncTab(true);
    },

    /* ---------- menus (colunas / exportar) ---------- */
    _toggleMenu(kind, btn) {
      const same = this._menuEl && this._menuKind === kind;
      this._closeMenu();
      if (!same) this._openMenu(kind, btn);
    },
    _openMenu(kind, btn) {
      const m = el('div', { class: 'r4-grid-menu r4-cmp', role: 'menu', 'aria-label': kind === 'cols' ? 'Colunas' : 'Exportar' });
      if (kind === 'export') {
        [['csv', 'CSV (.csv)'], ['xlsx', 'Excel (.xlsx)'], ['json', 'JSON (.json)'], ['print', 'Imprimir']]
          .forEach(([k, t]) => m.append(el('button', { type: 'button', role: 'menuitem', class: 'r4-grid-mi', 'data-k': k, text: t })));
      } else {
        this.columns.forEach((c, i) => {
          if (c.dataIndex == null && !c.header) return;
          const cb = el('input', { type: 'checkbox', 'data-ci': i, tabindex: '-1' }); cb.checked = !c.hidden;
          m.append(el('label', { class: 'r4-grid-mi', role: 'menuitemcheckbox', tabindex: '-1', 'aria-checked': String(!c.hidden) }, [cb, el('span', { text: c.header ?? c.dataIndex })]));
        });
        if (this._sorters().length) m.append(el('button', { type: 'button', role: 'menuitem', class: 'r4-grid-mi', 'data-k': 'unsort', text: 'Limpar ordenação' }));
      }
      m.addEventListener('change', ev => {
        const i = ev.target.getAttribute('data-ci'); if (i == null) return;
        this.setColumnVisible(this.columns[+i], ev.target.checked);
        ev.target.checked = !this.columns[+i].hidden;
        ev.target.parentNode.setAttribute('aria-checked', String(ev.target.checked));
      });
      m.addEventListener('click', ev => {
        const b = ev.target.closest('[data-k]'); if (!b) return;
        const k = b.getAttribute('data-k');
        this._closeMenu(true);
        if (k === 'unsort') this.setSorters([]);
        else if (k === 'print') this.print();
        else this['export' + k.toUpperCase()]();
      });
      m.addEventListener('keydown', ev => {
        const items = [...m.querySelectorAll('.r4-grid-mi')], i = items.indexOf(document.activeElement);
        if (ev.key === 'Escape') { ev.preventDefault(); this._closeMenu(true); }
        else if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') { ev.preventDefault(); const n = items[(i + (ev.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]; n && n.focus(); }
        else if ((ev.key === ' ' || ev.key === 'Enter') && document.activeElement.localName === 'label') { ev.preventDefault(); document.activeElement.querySelector('input').click(); }
        else if (ev.key === 'Tab') this._closeMenu();
      });
      const r = btn.getBoundingClientRect();
      Object.assign(m.style, { top: Math.round(r.bottom + 4) + 'px', right: Math.max(8, Math.round(document.documentElement.clientWidth - r.right)) + 'px' });
      document.body.append(m);
      this._menuEl = m; this._menuKind = kind; this._menuBtn = btn;
      btn.setAttribute('aria-expanded', 'true');
      this._outside = ev => { if (!m.contains(ev.target) && !btn.contains(ev.target)) this._closeMenu(); };
      document.addEventListener('mousedown', this._outside, true);
      const first = m.querySelector('.r4-grid-mi'); first && first.focus();
    },
    _closeMenu(refocus) {
      if (!this._menuEl) return;
      document.removeEventListener('mousedown', this._outside, true);
      this._menuEl.remove(); this._menuEl = null;
      this._menuBtn.setAttribute('aria-expanded', 'false');
      if (refocus) this._menuBtn.focus();
    },

    /* ---------- exportar / imprimir (usa R4.files, carregado depois deste arquivo) ---------- */
    _files() { if (!R4.files) throw new Error('R4.files não carregado: inclua libr4/files.js'); return R4.files; },
    _exportCols() {
      return this._cols.filter(c => !c.actions && c.dataIndex != null)
        .map(c => ({ key: c.dataIndex, header: c.header ?? c.dataIndex, format: c.format, width: c.width, align: c.align, col: c }));
    },
    _fname(n, ext) { return String(n || this.exportName || 'dados').replace(/\.[a-z0-9]+$/i, '') + '.' + ext; },
    /** CSV (; e vírgula decimal, como o Excel pt-BR espera) das linhas filtradas/ordenadas e colunas visíveis */
    exportCSV(nome, opts) {
      const F = this._files();
      F.download(F.toCSV(this._view, Object.assign({ columns: this._exportCols(), delimiter: ';', decimal: ',' }, opts)), this._fname(nome, 'csv'), 'text/csv;charset=utf-8');
      this.fire('export', this, 'csv');
      return this;
    },
    exportXLSX(nome, opts) {
      const F = this._files();
      F.download(F.toXLSX(this._view, Object.assign({ columns: this._exportCols(), sheetName: String(nome || this.exportName || 'Planilha1') }, opts)), this._fname(nome, 'xlsx'));
      this.fire('export', this, 'xlsx');
      return this;
    },
    exportJSON(nome) {
      const F = this._files();
      F.download(F.toJSON(this._view, { columns: this._exportCols() }), this._fname(nome, 'json'), 'application/json;charset=utf-8');
      this.fire('export', this, 'json');
      return this;
    },
    _printHtml(title) {
      const cols = this._exportCols(), t = esc(title || this.exportName || 'Relatório');
      const al = c => c.align === 'right' || c.align === 'center' ? ' style="text-align:' + c.align + '"' : '';
      const body = this._view.map(r => '<tr>' + cols.map(c => '<td' + al(c) + '>' + esc(fmtVal(c.col, r[c.key])) + '</td>').join('') + '</tr>').join('');
      const foot = this.tfoot.hidden ? '' : '<tfoot><tr>' + [...this.tfoot.rows[0].cells].slice(this._off).filter((_, j) => !this._cols[j].actions && this._cols[j].dataIndex != null)
        .map(td => '<td>' + esc(td.textContent) + '</td>').join('') + '</tr></tfoot>';
      return '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>' + t + '</title><style>' +
        'body{font:12px system-ui,sans-serif;margin:16px;color:#000}table{border-collapse:collapse;width:100%}' +
        'th,td{border:1px solid #888;padding:4px 6px;text-align:left}th{background:#eee}tfoot td{font-weight:700}' +
        '</style></head><body><h3>' + t + '</h3><table><thead><tr>' + cols.map(c => '<th' + al(c) + '>' + esc(c.header) + '</th>').join('') +
        '</tr></thead><tbody>' + body + '</tbody>' + foot + '</table></body></html>';
    },
    /** Imprime as linhas filtradas/ordenadas (colunas visíveis) por um iframe oculto — a página não navega. */
    print(title) {
      this._printFrame && this._printFrame.remove();
      const f = el('iframe', { class: 'r4-print-frame', title: 'Impressão', 'aria-hidden': 'true', tabindex: '-1' });
      f.addEventListener('load', () => { try { f.contentWindow.focus(); f.contentWindow.print(); } catch (e) { console.error('[R4] grid.print:', e); } }, { once: true });
      f.srcdoc = this._printHtml(title);
      document.body.append(f);
      this._printFrame = f;
      this.fire('export', this, 'print');
      return this;
    },

    destroy() {
      R4.Component.prototype.destroy.call(this);
      if (R4.instances[this.id] === this) return;   // cancelado por beforedestroy
      this._dead = true; this._seq++;
      clearTimeout(this._qt);
      this._raf && cancelAnimationFrame(this._raf);
      this._ro && this._ro.disconnect();
      this._drag && this._drag();
      this._closeMenu();
      this._printFrame && this._printFrame.remove();
    }
  }, {
    title: 'grid', group: 'Componentes',
    description: 'Tabela de dados: ordenação multi-coluna (Shift+clique), filtro, paginação local ou no servidor (remote), virtualização para dezenas de milhares de linhas, seleção simples/múltipla com teclado, edição na célula, rodapé de totais, colunas redimensionáveis/ocultáveis, coluna de ações e exportação CSV/XLSX/JSON/impressão. Sem renderer o valor vai por textContent (seguro); renderer devolve HTML e NÃO é escapado — use R4.util.esc nos dados.',
    props: [
      { name: 'columns', type: 'Array<string | coluna>', default: '[]', desc: 'Colunas. Vazio = automáticas a partir das chaves do primeiro registro.' },
      { name: 'coluna.header / dataIndex', type: 'string', desc: 'Título e campo do registro.' },
      { name: 'coluna.format', type: "'money'|'number'|'date'|'bytes'|'bool'|'upper'", desc: 'Formata o valor (R4.formats) — também no rodapé e na impressão. Exportação CSV/XLSX/JSON leva o valor bruto (XLSX aplica o formato de célula).' },
      { name: 'coluna.renderer', type: 'function(valor, linha) → HTML', desc: 'HTML livre na célula. NÃO é escapado: escape os dados com R4.util.esc. Sem renderer o texto vai por textContent.' },
      { name: 'coluna.align / width / minWidth', type: "'left'|'center'|'right' / number / number", desc: 'Alinhamento e larguras em px.' },
      { name: 'coluna.sortable / hidden / resizable', type: 'boolean', desc: 'sortable:false não ordena; hidden começa oculta (volta pelo menu de colunas); resizable:false impede arrastar.' },
      { name: 'coluna.editable', type: "true | 'number' | 'date' | 'text' | {options:[...], type}", desc: 'Edição na célula: duplo clique, Enter ou F2 abre; Enter/Tab/sair confirma; Esc cancela. options aceita valores ou {value,text}/{valor,texto}.' },
      { name: 'coluna.summary', type: "'sum'|'avg'|'count'|'min'|'max'|fn(valores, linhas, coluna)", desc: 'Rodapé de resumo, calculado sobre as linhas filtradas (no modo remoto, sobre a página carregada) e formatado com format.' },
      { name: 'coluna.actions', type: "Array<{text, icon, title, variant, handler(linha, grid, ev), 'r4-click', 'r4-confirm'}>", desc: 'Coluna de botões. Em r4-click/r4-confirm, {campo} vira o valor da linha (ex.: "toast:Abrir {nome}").' },
      { name: 'data', type: 'Array<object>', default: '[]', desc: 'Registros.' },
      { name: 'pageSize', type: 'number', default: '0', desc: 'Linhas por página (0 = sem paginação; no modo remoto o padrão é 25).' },
      { name: 'filter', type: 'boolean', default: 'true', desc: 'Barra de filtro (busca em todas as colunas, com atraso de digitação).' },
      { name: 'striped / emptyText / height', type: "boolean / string / number", default: "true / 'Nenhum registro.' / 0", desc: 'Listras, texto de vazio, altura fixa da área de rolagem em px (0 = automática, máx. 420).' },
      { name: 'virtual', type: 'boolean', default: 'false', desc: 'Renderiza só as linhas visíveis (altura fixa rowHeight). Liga sozinho sem paginação acima de virtualThreshold linhas.' },
      { name: 'virtualThreshold / rowHeight', type: 'number / number', default: '1000 / 36', desc: 'Limite da virtualização automática (0 desliga) e altura da linha em px no modo virtual.' },
      { name: 'selectable', type: "'' | 'single' | 'multi'", default: "''", desc: "multi adiciona coluna de caixas (a do cabeçalho seleciona todos os filtrados), Ctrl+clique alterna e Shift+clique seleciona intervalo." },
      { name: 'idProperty', type: 'string', default: "'id'", desc: 'Campo que identifica a linha na seleção (mantém a seleção entre páginas do modo remoto).' },
      { name: 'src / method / encrypt / params', type: 'string / string / boolean / object', default: "'' / 'GET' / false / null", desc: 'Carrega os dados de uma URL ao renderizar (JSON; com encrypt o corpo vai como no R4.http). Mostra "carregando"; status HTTP fora de 2xx, {status ≥ 400} no corpo ou JSON inválido viram estado de erro com botão Tentar de novo, sem apagar os dados atuais. reload() busca de novo.' },
      { name: 'remote', type: 'boolean', default: 'false', desc: 'Paginação, ordenação e filtro no servidor: envia page (1…), size, sort, dir (asc|desc), q e lê {total, retorno}. Multi-coluna envia só o critério principal.' },
      { name: 'resizable / columnMenu', type: 'boolean', default: 'false', desc: 'Arrastar a borda do cabeçalho (ou Alt+←/→ no cabeçalho) muda a largura; menu "Colunas" mostra/oculta colunas.' },
      { name: 'exportable / exportName', type: "boolean / string", default: "false / 'dados'", desc: 'Botão "Exportar" (CSV, Excel, JSON, imprimir) com as linhas filtradas/ordenadas e colunas visíveis.' },
      { name: 'summaryLabel / loadingText / errorText', type: 'string', default: "'Total' / 'Carregando...' / 'Falha ao carregar.'", desc: 'Textos do rodapé e dos estados.' },
      { name: 'loadData(array) / getData() / getView()', type: 'método', desc: 'Substitui os dados / dados atuais (com edições) / linhas filtradas e ordenadas.' },
      { name: 'sort(campo, dir, somar) / setSorters([{key,dir}]) / getSorters()', type: 'método', desc: 'Ordenação por código; somar=true acrescenta critério (multi-coluna).' },
      { name: 'setFilter(texto) / setPage(n) / reload()', type: 'método', desc: 'Filtro, página (0…) e recarga.' },
      { name: 'getSelection() / clearSelection() / select(linhas|fn, manter) / selectAll() / deselect(linhas) / isSelected(linha)', type: 'método', desc: 'Seleção.' },
      { name: 'startEdit(linha, campo)', type: 'método', desc: 'Abre o editor da célula (linha = índice na página).' },
      { name: 'setColumnVisible(campo, bool) / showColumn / hideColumn', type: 'método', desc: 'Mostra ou oculta colunas.' },
      { name: 'exportCSV(nome) / exportXLSX(nome) / exportJSON(nome) / print(título)', type: 'método', desc: 'Exporta/imprime o que está filtrado e ordenado, colunas visíveis (requer files.js).' },
      { name: 'Teclado', type: 'role="grid"', desc: 'Setas movem a célula; Home/End início/fim da linha; Ctrl+Home/End primeira/última linha; PageUp/PageDown; Espaço seleciona; Enter edita/ativa (no cabeçalho ordena, Shift+Enter soma critério); F2 edita; Esc cancela edição.' },
      { name: 'HTML', type: '<r4-grid> / <r4-col>', desc: '<r4-grid selectable="multi" virtual remote exportable column-menu resizable src="..."> e <r4-col field header width min-width align format sortable hidden resizable editable options summary actions>.' }
    ],
    events: ['rowclick', 'rowdblclick', 'load', 'loaderror', 'selectionchange', 'sortchange', 'beforecellchange', 'cellchange', 'columnresize', 'columnchange', 'action', 'export']
  });
  /** Lê as <r4-col> de um <r4-grid> (usado pelo gancho R4.declare('grid') registrado em files.js). */
  Grid.colsFromHost = function (host) {
    const KNOWN = new Set(['field', 'header', 'width', 'min-width', 'align', 'sortable', 'format', 'hidden', 'resizable', 'editable', 'options', 'summary', 'actions', 'class', 'style', 'id']);
    const json = (v, d) => { try { return JSON.parse(v); } catch (e) { return d; } };
    return [...host.children].filter(k => k.localName === 'r4-col').map(c => {
      const g = n => c.getAttribute(n), has = n => c.hasAttribute(n), on = n => has(n) && g(n) !== 'false';
      const cfg = { header: g('header') ?? g('field'), dataIndex: g('field'), align: g('align') || undefined, sortable: g('sortable') !== 'false' };
      if (has('width')) cfg.width = +g('width');
      if (has('min-width')) cfg.minWidth = +g('min-width');
      if (g('format')) cfg.format = g('format');
      if (on('hidden')) cfg.hidden = true;
      if (has('resizable')) cfg.resizable = on('resizable');
      if (has('editable')) {
        const v = g('editable').trim();
        cfg.editable = v === '' || v === 'true' ? true : v === 'false' ? false : /^[[{]/.test(v) ? json(v, true) : v;
        if (Array.isArray(cfg.editable)) cfg.editable = { options: cfg.editable };
      }
      if (has('options')) {
        const v = g('options').trim(), opts = /^\[/.test(v) ? json(v, []) : v.split(',').map(s => s.trim()).filter(Boolean);
        cfg.editable = Object.assign(typeof cfg.editable === 'object' && cfg.editable ? cfg.editable : {}, { options: opts });
      }
      if (g('summary')) cfg.summary = g('summary');
      if (has('actions')) cfg.actions = json(g('actions'), []);
      for (const a of c.attributes) if (!KNOWN.has(a.name) && !/^(data-|aria-)/.test(a.name)) R4.warn && R4.warn('<r4-col>: atributo desconhecido "' + a.name + '"');
      return cfg;
    });
  };

  /* ================= window ================= */
  R4.define('window', {
    config: { title: '', html: '', items: [], buttons: [], width: 420, modal: true, closable: true, closeAction: 'destroy' },
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
    close() {
      document.removeEventListener('keydown', this._esc); this.fire('close', this);
      this.closeAction === 'hide' ? (this.el.hidden = true) : this.destroy();
    }
  }, {
    title: 'window', description: 'Janela modal com título, corpo, botões no rodapé. Fecha com Esc, clique fora ou ×.',
    props: [
      { name: 'title / html / items', type: 'mixed', desc: 'Conteúdo da janela.' },
      { name: 'buttons', type: 'Array<{text,handler,variant,close}>', default: '[]', desc: 'Botões do rodapé; fecham a janela, exceto close:false.' },
      { name: 'width', type: 'number', default: '420', desc: 'Largura em px.' },
      { name: 'closeAction', type: "'destroy'|'hide'", default: "'destroy'", desc: 'hide mantém a janela para reabrir com show().' },
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

  /* ================= div (layout) ================= */
  const gapOf = v => (/^[0-4]$/.test(v) ? ['0', '4px', '8px', '16px', '24px'][+v] : v);
  R4.define('div', {
    config: { html: '', cols: '', gap: '2', flex: false, column: false, wrap: false, align: '', justify: '', pad: '', keep: false, items: [] },
    build() {
      const d = el('div', { class: 'r4-div' });
      const s = d.style;
      if (this.cols) {
        d.classList.add('r4-div-cols');
        s.gridTemplateColumns = /^\d+$/.test(this.cols) ? 'repeat(' + this.cols + ', minmax(0, 1fr))' : this.cols;
        if (this.keep) d.classList.add('r4-div-keep');
      } else if (this.flex || this.column) {
        s.display = 'flex'; if (this.column) s.flexDirection = 'column'; if (this.wrap) s.flexWrap = 'wrap';
      }
      s.gap = gapOf(this.gap);
      if (this.align) s.alignItems = this.align;
      if (this.justify) s.justifyContent = { between: 'space-between', around: 'space-around' }[this.justify] || this.justify;
      if (this.pad) s.padding = gapOf(this.pad);
      if (this.html) d.innerHTML = this.html;
      this.renderItems(d, this.items);
      return d;
    },
    setHtml(h) { this.el.innerHTML = h; return this; }
  }, {
    title: 'div', group: 'Componentes',
    description: 'Contêiner de layout. Com cols vira colunas (grid), com flex/column vira linha/coluna. Em telas pequenas as colunas empilham sozinhas (use keep para impedir).',
    props: [
      { name: 'cols', type: "'2' | '3' | '1fr 2fr' ...", default: "''", desc: 'Número de colunas iguais, ou um modelo livre ("200px 1fr").' },
      { name: 'gap', type: "'0'..'4' | '12px'", default: "'2'", desc: 'Espaço entre os filhos (0, 4, 8, 16, 24px ou um valor CSS).' },
      { name: 'flex / column', type: 'boolean', default: 'false', desc: 'Linha ou coluna em flexbox.' },
      { name: 'wrap', type: 'boolean', default: 'false', desc: 'Quebra de linha no flex.' },
      { name: 'align', type: "'start' | 'center' | 'end' | 'stretch'", default: "''", desc: 'Alinhamento cruzado.' },
      { name: 'justify', type: "'start' | 'center' | 'end' | 'between' | 'around'", default: "''", desc: 'Distribuição no eixo principal.' },
      { name: 'pad', type: "'0'..'4' | '10px'", default: "''", desc: 'Espaçamento interno.' },
      { name: 'keep', type: 'boolean', default: 'false', desc: 'Mantém as colunas também no celular.' }
    ]
  });

  /* ================= playground (painel de propriedades da vitrine) ================= */
  // controls: nome -> array (lista de opções) | valor inicial (boolean/number/string)
  const PG = (x, pg) => { R4.registry[x].meta.playground = pg; };
  PG('button', { html: '<r4-button{attrs}>Clique aqui</r4-button>', cfg: { text: 'Clique aqui' },
    controls: { variant: ['default', 'primary', 'danger'], icon: '', disabled: false } });
  PG('panel', { html: '<r4-panel{attrs}>Conteúdo do painel</r4-panel>', cfg: { html: 'Conteúdo do painel' },
    controls: { title: 'Meu painel', collapsible: false, collapsed: false, padding: true } });
  PG('textfield', { html: '<r4-textfield{attrs}></r4-textfield>', cfg: {},
    controls: { label: 'Nome', placeholder: 'Digite...', value: '', inputType: ['text', 'password', 'email', 'number'] } });
  PG('div', { html: '<r4-div{attrs}>\n  <div class="r4-card">1</div>\n  <div class="r4-card">2</div>\n  <div class="r4-card">3</div>\n</r4-div>',
    cfg: { html: '<div class="r4-card">1</div><div class="r4-card">2</div><div class="r4-card">3</div>' },
    controls: { cols: '3', gap: ['2', '0', '1', '3', '4'], flex: false, column: false, wrap: false, align: ['', 'start', 'center', 'end'], justify: ['', 'start', 'center', 'end', 'between'], pad: '', keep: false } });
  PG('grid', { html: `<r4-grid{attrs} data='[{"id":1,"nome":"Ana","uf":"SP","valor":1200},{"id":2,"nome":"Bruno","uf":"RJ","valor":830.5},{"id":3,"nome":"Carla","uf":"SP","valor":2210},{"id":4,"nome":"Davi","uf":"MG","valor":95}]'>\n  <r4-col field="nome" header="Nome" editable></r4-col>\n  <r4-col field="uf" header="UF" width="80" options="SP,RJ,MG"></r4-col>\n  <r4-col field="valor" header="Valor" format="money" align="right" editable="number" summary="sum"></r4-col>\n</r4-grid>`,
    cfg: { data: [{ id: 1, nome: 'Ana', uf: 'SP', valor: 1200 }, { id: 2, nome: 'Bruno', uf: 'RJ', valor: 830.5 }, { id: 3, nome: 'Carla', uf: 'SP', valor: 2210 }, { id: 4, nome: 'Davi', uf: 'MG', valor: 95 }],
      columns: [{ header: 'Nome', dataIndex: 'nome', editable: true }, { header: 'UF', dataIndex: 'uf', width: 80, editable: { options: ['SP', 'RJ', 'MG'] } },
        { header: 'Valor', dataIndex: 'valor', format: 'money', align: 'right', editable: 'number', summary: 'sum' }] },
    controls: { selectable: ['', 'single', 'multi'], pageSize: 0, filter: true, striped: true, resizable: false, columnMenu: false, exportable: false, virtual: false, summaryLabel: 'Total', emptyText: 'Nenhum registro.' } });
  PG('treepanel', { html: '<r4-treepanel{attrs} style="height:180px">\n  <r4-node text="Frutas"><r4-node id="pg-a" text="Maçã"></r4-node><r4-node id="pg-b" text="Banana"></r4-node></r4-node>\n</r4-treepanel>',
    cfg: { nodes: [{ text: 'Frutas', children: [{ id: 'a', text: 'Maçã' }, { id: 'b', text: 'Banana' }] }] },
    controls: { filterable: true, placeholder: 'Buscar...' } });
})(window.R4);
