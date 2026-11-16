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
  const { el, esc, debounce, tx } = R4.util;
  const T = R4.util.T;   // R4.t com reserva; resolvido em tempo de uso (theme.js carrega por último)

  /* ================= button ================= */
  R4.define('button', {
    config: { text: '', handler: null, disabled: false, variant: 'default', icon: '' },
    build() {
      const b = el('button', { type: 'button', class: 'r4-btn r4-btn-' + this.variant, disabled: this.disabled,
        onclick: ev => { if (!this.disabled) { this.fire('click', this, ev); this.handler && this.handler(this, ev); } } });
      this.label = el('span', { text: this.text });
      if (this.icon) b.append(this._ico = R4.util.icon(el('span', { class: 'r4-ico' }), this.icon));
      b.append(this.label);
      return b;
    },
    setText(t) { this.text = t; this.label.textContent = t; return this; },
    /** Troca o ícone (nome de R4.icon ou texto/emoji; '' remove). */
    setIcon(v) {
      this.icon = v;
      if (!v) { this._ico && this._ico.remove(); this._ico = null; }
      else if (this._ico) R4.util.icon(this._ico, v);
      else this.el.prepend(this._ico = R4.util.icon(el('span', { class: 'r4-ico' }), v));
      return this;
    },
    setDisabled(d) { this.disabled = !!d; this.el.disabled = !!d; return this; }
  }, {
    title: 'button', group: 'Componentes', description: 'Botão com handler, ícone e variantes de cor.',
    props: [
      { name: 'text', type: 'string', default: "''", desc: 'Texto do botão.' },
      { name: 'handler', type: 'function(btn, ev)', default: 'null', desc: 'Chamado ao clicar.' },
      { name: 'variant', type: "'default'|'primary'|'danger'", default: "'default'", desc: 'Cor.' },
      { name: 'icon', type: 'string', default: "''", desc: 'Nome de ícone (R4.icon: "edit", "trash"...) ou texto/emoji exibido antes do rótulo.' },
      { name: 'disabled', type: 'boolean', default: 'false', desc: 'Desabilita o botão.' },
      { name: 'setText(t) / setDisabled(b) / setIcon(v)', type: 'método', desc: 'Atualizam o botão depois de renderizado.' }
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
          this.headerEl.append(R4.util.icon(el('span', { class: 'r4-tool' }), 'chevron-down'));
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
      { name: 'html', type: 'string', default: "''", desc: 'HTML do corpo — HTML CONFIÁVEL (não é escapado). Dado de fora: monte com R4.html`...${dado}...` ou R4.util.esc.' },
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
      const tabEl = el('div', { class: 'r4-tab' }, [el('span', { text: cfg.title || T('r4.tab', 0, 'Aba') })]);
      const tab = { cmp: panel, el: tabEl, key: cfg.key };
      tabEl.addEventListener('click', () => this.setActive(tab));
      if (cfg.closable) tabEl.append(R4.util.tx(R4.util.icon(el('span', { class: 'r4-x', onclick: ev => { ev.stopPropagation(); this.remove(tab); } }), 'close'), 'r4.close', 'Fechar', 'title'));
      this.strip.append(tabEl);
      panel.render(this.stage);
      (this._children = this._children || []).push(panel);   // destroy() do tabpanel também destrói as abas
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
    config: { nodes: [], filterable: true, placeholder: '' },
    build() {
      const root = el('div', { class: 'r4-tree' });
      if (this.filterable) {
        const inp = el('input', { class: 'r4-input r4-tree-filter', type: 'search', oninput: debounce(ev => this.filter(ev.target.value), 120) });
        if (this.placeholder) { inp.placeholder = this.placeholder; inp.setAttribute('aria-label', this.placeholder); }
        else ['placeholder', 'aria-label'].forEach(a => R4.util.tx(inp, 'r4.search', 'Buscar...', a));   // sem texto próprio: acompanha o idioma
        root.append(inp);
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
        el('span', { class: 'r4-arrow', 'aria-hidden': 'true' }, kids.length ? R4.icon('caret-right') : null),
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
      }
      row.addEventListener('click', () => {
        if (kids.length) wrap.classList.toggle('r4-open');   // a seta gira por CSS
        else this.select(n.id ?? n.text);
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
        if (kids.length && q) wrap.classList.add('r4-open');
        return show;
      };
      this.nodes.forEach(n => walk(this.nodeEls[n.id ?? n.text].wrap, n));
    }
  }, {
    title: 'treepanel', description: 'Árvore hierárquica com filtro. É o menu lateral padrão da vitrine.',
    props: [
      { name: 'nodes', type: 'Array<{id,text,children,expanded,badge}>', default: '[]', desc: 'Nós da árvore; folhas disparam select.' },
      { name: 'filterable / placeholder', type: 'boolean / string', default: "true / ''", desc: 'Mostra campo de busca; placeholder vazio = "Buscar..." no idioma atual.' },
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
   * Segurança: sem renderer o valor vai por textContent. renderer(valor, linha) que devolve string
   * também vira TEXTO; para HTML devolva R4.html`<b>${v}</b>` (escapa os dados) ou um Node.
   * html:true na coluna mantém o modo antigo (string = HTML confiável, sem escape).
   */
  const COLL = new Intl.Collator('pt-BR', { numeric: true });
  const BUF = 8;   // linhas extras acima/abaixo da janela virtual
  const MAXPX = 8e6;   // altura máxima do "espaço rolável" (px). Navegadores travam entre ~17 e ~33 milhões de px; acima disto a rolagem é ESCALADA
  const VCH = 100;     // linhas por pedido ao servidor no modo janela remota (o servidor limita em 500)
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
  /** Acrescenta filtro[coluna][]=valor (um por valor marcado) à URL — PHP lê como $_GET['filtro']['coluna'] = [...]. */
  const withFilters = (src, f) => {
    const ks = Object.keys(f || {}); if (!ks.length) return src;
    const u = new URL(src, location.href);
    ks.forEach(k => f[k].forEach(v => u.searchParams.append('filtro[' + k + '][]', v)));
    return u.origin === location.origin ? u.pathname + u.search : u.href;
  };
  // {campo} no r4-click de uma ação vira o valor da linha (sem ';' para não encadear ações)
  const fillTpl = (tpl, row) => String(tpl).replace(/\{(\w+)\}/g, (_, k) => String(row[k] ?? '').replace(/[;\r\n]/g, ' '));

  const Grid = R4.define('grid', {
    config: { columns: [], data: [], pageSize: 0, filter: true, emptyText: '', striped: true, src: '', method: 'GET', encrypt: false, params: null,
      virtual: false, virtualThreshold: 1000, rowHeight: 36, height: 0, selectable: '', idProperty: 'id', remote: false,
      resizable: false, columnMenu: false, exportable: false, exportName: 'dados', summaryLabel: '',
      loadingText: '', errorText: '',   // '' = texto padrão no idioma atual (R4.i18n)
      highlight: true, pageSizeSelector: false, pageSizes: [], columnFilters: false },
    build() {
      const root = el('div', { class: 'r4-grid' });
      this.sortKey = null; this.sortDir = 1; this.page = 0; this.q = '';
      this.sorters = []; this._sel = new Map(); this._act = { r: 0, c: 0 }; this._win = [0, 0];
      this._cf = {}; this._cfT = null; this._cfCache = {}; this._cfP = null;
      this._ver = 0; this._pv = 0; this._pool = []; this._view = []; this._rows = []; this._base = 0; this._count = 0; this._total = 0; this._seq = 0;
      const bar = el('div', { class: 'r4-grid-bar' });
      if (this.filter) {
        this.filterEl = el('input', { class: 'r4-input', type: 'search' });
        tx(this.filterEl, 'r4.filter', 'Filtrar...', 'placeholder'); tx(this.filterEl, 'r4.grid.filterLabel', 'Filtrar registros', 'aria-label');
        this.filterEl.addEventListener('input', () => {
          clearTimeout(this._qt);
          this._qt = setTimeout(() => this.setFilter(this.filterEl.value), this.remote ? 300 : 120);
        });
        bar.append(this.filterEl);
      }
      if (this.columnMenu || this.exportable) {
        bar.append(el('span', { class: 'r4-fill' }));
        const tool = (k, ico, t, tf, l, lf) => {
          const b = el('button', { type: 'button', class: 'r4-btn r4-grid-tool', 'data-menu': k, 'aria-haspopup': 'menu', 'aria-expanded': 'false' }, [R4.icon(ico), ' ', tx(el('span'), t, tf)]);
          return tx(b, l, lf, 'title');
        };
        if (this.columnMenu) bar.append(tool('cols', 'list', 'r4.grid.cols', 'Colunas', 'r4.grid.colsTitle', 'Mostrar ou ocultar colunas'));
        if (this.exportable) bar.append(tool('export', 'download', 'r4.grid.export', 'Exportar', 'r4.grid.exportTitle', 'Exportar os registros filtrados'));
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
      this.mask = el('div', { class: 'r4-grid-mask', hidden: true }, [el('span', { class: 'r4-grid-spin', 'aria-hidden': 'true' }), this.loadingText ? el('span', { text: this.loadingText }) : tx(el('span'), 'r4.loading', 'Carregando...')]);
      this.pager = el('div', { class: 'r4-pager' });
      this._pNav = el('span', { class: 'r4-pager-nav' });   // navegação (refeita a cada render); o seletor de tamanho fica FORA, para não perder o foco
      this.pager.append(this._pNav);
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
      if (this._vr()) return this._vrReset();
      const seq = ++this._seq;
      this._busy(true);
      try {
        let url = this.src, data = this.params;
        if (this.remote) {
          const s = this._sorters()[0];
          const p = { page: this.page + 1, size: this._size(), sort: s ? s.key : null, dir: s ? (s.dir > 0 ? 'asc' : 'desc') : null, q: this.q || null };
          const fl = this._cfActive();
          if (/^get$/i.test(this.method)) url = withFilters(withQuery(this.src, Object.assign({}, this.params, p)), fl);
          else data = Object.assign({}, this.params, p, Object.keys(fl).length ? { filtro: fl } : null);
        }
        const r = await this._request(url, data);
        if (seq !== this._seq || this._dead) return this;
        const rows = Array.isArray(r) ? r : r && (r.retorno || r.data || r.rows);
        const msg = r && !Array.isArray(r) && (typeof r.retorno === 'string' ? r.retorno : r.mensagem || r.message);
        // status de erro no corpo ({status: 500, ...}) também é falha — this.data só muda em caso de sucesso
        if ((r && !Array.isArray(r) && +r.status >= 400) || (!Array.isArray(rows) && msg)) throw new Error(msg || 'HTTP ' + r.status);
        if (rows != null && !Array.isArray(rows)) throw new Error(T('r4.grid.noList', 0, 'Resposta sem lista de registros.'));
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
    async _request(url, data, metodo) {
      const mth = metodo || this.method;
      url = R4.http.check(url);   // recusa javascript:/data:, avisa (ou bloqueia, com strictOrigins) outra origem
      const get = /^get$/i.test(mth);
      const body = data == null || get ? undefined : JSON.stringify(this.encrypt ? await R4.crypto.encrypt(data, { metodo: mth, caminho: url }) : data);
      const res = await fetch(url, { method: mth, credentials: 'same-origin', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body });
      let r = null, bad = false;
      try { r = await res.json(); } catch (e) { bad = true; }
      if (!res.ok) {
        const m = r && (typeof r.retorno === 'string' ? r.retorno : r.mensagem || r.message);
        throw new Error('HTTP ' + res.status + (m ? ': ' + m : ''));
      }
      if (bad) throw new Error(T('r4.grid.badJson', 0, 'A resposta não é JSON válido.'));
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
      const pr = this._cfPred(); if (pr) rows = rows.filter(pr);   // filtro por valores das colunas
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
      this._v = !!(this.virtual || this._vr() || (!this._size() && !this.remote && this.virtualThreshold > 0 && this.data.length > this.virtualThreshold));
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
    _size() { return this._todos ? 0 : this.pageSize || (this.remote ? 25 : 0); },
    /** Modo JANELA REMOTA: remoto + "Todos". A barra de rolagem representa TODAS as linhas do servidor e só o trecho visível é montado e buscado. */
    _vr() { return !!(this.remote && this._size() === 0); },
    /** Tamanhos oferecidos: pageSizes (array ou texto "10,30,all"; 0/all/todos = todas). Padrão 10, 30, 50, 100 e Todas (no modo remoto sem Todas). O tamanho atual sempre entra na lista. */
    _sizes() {
      let l = this.pageSizes;
      if (typeof l === 'string') l = l.split(',');
      const out = [];
      (Array.isArray(l) ? l : []).forEach(v => {
        const s = String(v).trim().toLowerCase(), n = s === 'all' || s === 'todos' || s === 'todas' ? 0 : Math.floor(Number(s));
        if (Number.isFinite(n) && n >= 0 && n <= 100000 && !out.includes(n)) out.push(n);
      });
      if (!out.length) { out.push(10, 30, 50, 100); if (!this.remote) out.push(0); }
      const cur = this._size();
      if (!out.includes(cur) && !(cur === 0 && this.remote && !out.includes(0))) out.push(cur);
      return out.sort((a, b) => (a || Infinity) - (b || Infinity));
    },
    /** Tamanho da página atual (0 = todas). */
    getPageSize() { return this._size(); },
    /** setPageSize(30) | setPageSize(0) (todas). Mantém visível o registro do topo, dispara pagesizechange e, no modo remoto, recarrega. */
    setPageSize(n) {
      n = Math.max(0, Math.floor(Number(n)) || 0);
      const old = this._size(), top = this.page * (old || 0);
      if (n === old) return this;
      this._todos = n === 0; this.pageSize = n;
      this.page = n ? Math.floor(top / n) : 0;
      this._act.r = Math.min(this._act.r, 0);
      if (this.scroller) this.scroller.scrollTop = 0;
      if (this.el) this._reflags();
      this.fire('pagesizechange', this, n);
      if (this.remote) this.load(); else this._render();
      return this;
    },
    /** Reavalia a virtualização depois de mudar o tamanho da página (sem refazer cabeçalho). */
    _reflags() {
      this._v = !!(this.virtual || this._vr() || (!this._size() && !this.remote && this.virtualThreshold > 0 && this.data.length > this.virtualThreshold));
      this.el.classList.toggle('r4-grid-v', this._v);
      this.table.classList.toggle('r4-fixed', this._v || !!this._fixed);
      const h = this._v || this.height ? (this.height || 420) + 'px' : '';
      this.scroller.style.height = h; this.scroller.style.maxHeight = h ? 'none' : '';
      this._pool.forEach(tr => tr.remove()); this._pool = []; this._pv++;
    },
    _buildHead() {
      const tr = el('tr', { 'aria-rowindex': 1 }), s = this._sorters();
      if (this._multi) {
        this._all = el('input', { type: 'checkbox', class: 'r4-check-all', tabindex: '-1', 'aria-label': T('r4.grid.selectAll', 0, 'Selecionar todos os registros filtrados') });
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
            th.append(el('span', { class: 'r4-sort', 'aria-hidden': 'true' }, [R4.icon(s[i].dir > 0 ? 'caret-up' : 'caret-down'), s.length > 1 ? String(i + 1) : '']));
          }
        }
        if (this._cfOn(c)) th.append(this._cfBtn(c));
        if (this.resizable && c.resizable !== false) th.append(el('span', { class: 'r4-col-resize', title: T('r4.grid.resize', 0, 'Arraste para redimensionar'), 'aria-hidden': 'true' }));
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
      if (this._vr()) { rows = this._wrows || []; total = this._err ? 0 : this._total; base = 0; }
      else if (this.remote) { total = this._total; base = this.page * size; }
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
          ? [el('span', { text: (this.errorText || T('r4.loadFail', 0, 'Falha ao carregar.')) + (this._err.message ? ' (' + this._err.message + ')' : '') }), ' ',
            this.src ? el('button', { type: 'button', class: 'r4-btn r4-grid-retry' }, [R4.icon('refresh'), ' ', tx(el('span'), 'r4.grid.retry', 'Tentar de novo')]) : '']
          : [this._msgText()]));
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
      if (row == null && this._vr()) {   // janela remota: a linha ainda está a caminho do servidor
        tr.classList.add('r4-row-wait');
        for (let j = 0; j < cols.length; j++) { const td = tr.cells[j + off]; if (!cols[j].actions) td.textContent = ''; else td.replaceChildren(); }
        return;
      }
      tr.classList.remove('r4-row-wait');
      for (let j = 0; j < cols.length; j++) {
        const c = cols[j], td = tr.cells[j + off];
        if (c.actions) { td.replaceChildren(...this._actionBtns(c, row)); continue; }
        const v = c.dataIndex != null && row != null ? row[c.dataIndex] : undefined;
        if (c.renderer) {
          // seguro por padrão: string/número viram TEXTO; HTML só se vier de R4.html/R4.raw (ou Node).
          // html:true na coluna = modo antigo (a string do renderer é HTML confiável, sem escape).
          const r = c.renderer(v, row);
          if (c.html === true && typeof r === 'string') td.innerHTML = r;
          else R4.util.setContent(td, r);
        } else td.textContent = fmtVal(c, v);
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
      let scaled = false;
      if (this._v) {
        const sc = this.scroller, vh = sc.clientHeight || this.height || 420;
        if (n * rh > MAXPX) {
          // ROLAGEM ESCALADA (milhões de linhas): a barra cobre MAXPX px, não n*rh. A linha do topo vem da PROPORÇÃO da rolagem
          // (frac * linhas) e o trecho montado é posicionado junto da janela visível (espaçador de cima + deslocamento fino).
          scaled = true;
          const view = Math.max(rh, vh - (this.thead.offsetHeight || 0)), maxScroll = Math.max(1, MAXPX - view);
          const frac = Math.min(1, Math.max(0, sc.scrollTop / maxScroll));
          const rowF = frac * Math.max(0, n - view / rh), a0 = Math.floor(rowF), fino = (rowF - a0) * rh;
          b = Math.min(n, a0 + Math.ceil(view / rh) + 1 + BUF);
          a = Math.max(0, a0 - BUF); a -= a % 2;
          const y = sc.scrollTop - fino - (a0 - a) * rh, top = Math.max(0, y);
          this.tbody.style.transform = y < 0 ? 'translateY(' + y + 'px)' : '';
          this._topTd.style.height = top + 'px';
          this._botTd.style.height = Math.max(0, MAXPX - top - (b - a) * rh) + 'px';
          this._first = a0;
        } else {
          const top = Math.max(0, sc.scrollTop - (this.thead.offsetHeight || 0));
          b = Math.min(n, Math.ceil((top + vh) / rh) + BUF);
          a = Math.max(0, Math.min(Math.floor(top / rh) - BUF, b - Math.ceil(vh / rh) - BUF));
          a -= a % 2;   // início sempre par: as listras não "piscam" ao rolar
          this._topTd.style.height = a * rh + 'px'; this._botTd.style.height = (n - b) * rh + 'px';
          this._first = Math.floor(top / rh);
          if (this.tbody.style.transform) this.tbody.style.transform = '';
        }
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
        this._mark(tr);
      }
      this._syncTab(false);
      if (this._vr()) { this._vrInfoUpdate(a, b); this._vrNeed(a, b); }
    },
    /* ---------- janela remota (remoto + "Todos") ---------- */
    /** Zera a janela (nova busca, ordenação ou "Todos"): pede o 1º bloco, descobre o total e prepara o vetor esparso de linhas. */
    async _vrReset() {
      const seq = ++this._seq;
      this._chunks = new Map(); this._pend = new Set(); this._wrows = []; this._total = 0; this._count = 0; this._view = [];
      clearTimeout(this._vrT);
      if (this.scroller) this.scroller.scrollTop = 0;
      this._busy(true);
      try {
        const r = await this._vrRequest(0);
        if (seq !== this._seq || this._dead) return this;
        this._err = null;
        this._total = Math.max(0, +r.total || r.rows.length);
        this._wrows = new Array(this._total);   // vetor esparso: só os blocos vistos ficam preenchidos
        r.rows.forEach((row, i) => { this._wrows[i] = row; });
        this._chunks.set(0, true);
        this._render();
        this.fire('load', this, r.rows);
      } catch (e) {
        if (seq !== this._seq || this._dead) return this;
        this._err = e; this.fire('loaderror', this, e); this._render();
      } finally { if (seq === this._seq && !this._dead) this._busy(false); }
      return this;
    },
    /** Pede o bloco ci (VCH linhas) ao servidor com a mesma ordenação/busca atuais. Devolve {rows, total}. */
    async _vrRequest(ci) {
      const s = this._sorters()[0];
      const p = { page: ci + 1, size: VCH, sort: s ? s.key : null, dir: s ? (s.dir > 0 ? 'asc' : 'desc') : null, q: this.q || null };
      let url = this.src, data = this.params;
      const fl = this._cfActive();
      if (/^get$/i.test(this.method)) url = withFilters(withQuery(this.src, Object.assign({}, this.params, p)), fl); else data = Object.assign({}, this.params, p, Object.keys(fl).length ? { filtro: fl } : null);
      const r = await this._request(url, data);
      const rows = Array.isArray(r) ? r : r && (r.retorno || r.data || r.rows);
      if (!Array.isArray(rows)) throw new Error((r && (typeof r.retorno === 'string' ? r.retorno : r.mensagem || r.message)) || T('r4.grid.noList', 0, 'Resposta sem lista de registros.'));
      return { rows, total: r && r.total };
    },
    /** Depois de rolar: agenda (debounce) a busca dos blocos que a janela atual ainda não tem. Rolar rápido não dispara pedidos inúteis. */
    _vrNeed(a, b) {
      if (!this._chunks || !this._total) return;
      const c0 = Math.floor(a / VCH), c1 = Math.floor((Math.max(a, b - 1)) / VCH);
      for (let c = c0; c <= c1; c++) if (this._chunks.has(c)) { this._chunks.delete(c); this._chunks.set(c, true); }   // "usado agora": sai da frente da fila de descarte
      clearTimeout(this._vrT);
      this._vrT = setTimeout(() => {
        if (this._dead || !this._vr()) return;
        const [wa, wb] = this._win, seq = this._seq;
        for (let c = Math.floor(wa / VCH); c <= Math.floor((Math.max(wa, wb - 1)) / VCH); c++) {
          if (c * VCH >= this._total || this._chunks.has(c) || this._pend.has(c) || this._pend.size >= 4) continue;
          this._pend.add(c);
          this._vrRequest(c).then(r => {
            this._pend.delete(c);
            if (seq !== this._seq || this._dead) return;
            r.rows.forEach((row, i) => { this._wrows[c * VCH + i] = row; });
            this._chunks.set(c, true);
            while (this._chunks.size > 150) {   // memória limitada: descarta os blocos mais antigos (voltam do servidor se forem revistos)
              const old = this._chunks.keys().next().value; this._chunks.delete(old);
              for (let i = 0; i < VCH; i++) this._wrows[old * VCH + i] = undefined;
            }
            this._schedule(); this._vrNeed(this._win[0], this._win[1]);
          }, () => { this._pend.delete(c); });
        }
      }, 60);
    },
    _vrInfoUpdate(a, b) {
      if (!this._vrInfo || !this._total) return;
      const f = this._first || 0, last = Math.min(this._total, f + Math.max(1, Math.ceil((this.scroller.clientHeight - (this.thead.offsetHeight || 0)) / this.rowHeight)));
      this._vrInfo.textContent = T('r4.grid.vrInfo', { a: R4.util.number(f + 1, 0), b: R4.util.number(last, 0), n: R4.util.number(this._total, 0) },
        R4.util.number(f + 1, 0) + ' a ' + R4.util.number(last, 0) + ' de ' + R4.util.number(this._total, 0) + ' registros');
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
        } else if (j === 0) txt = this.summaryLabel || T('r4.grid.total', 0, 'Total');
        tr.append(el('td', { text: txt, style: c.align ? { textAlign: c.align } : null }));
      });
      this.tfoot.replaceChildren(tr);
    },
    _renderPager() {
      const size = this._size(), total = this._count, show = !!size || this._v || this.pageSizeSelector;
      this.pager.hidden = !show;
      if (!show) return;
      this._renderSizeSel();
      if (!size && this._vr()) { this._vrInfo = el('span', { class: 'r4-vr-info' }); this._pNav.replaceChildren(this._vrInfo); this._vrInfoUpdate(0, 0); return; }
      this._vrInfo = null;
      if (!size) { this._pNav.replaceChildren(el('span', { text: T('r4.grid.count', { n: total, total: R4.util.number(total, 0) }, R4.util.number(total, 0) + ' registros') })); return; }
      const pages = Math.max(1, Math.ceil(total / size));
      this._pNav.replaceChildren(
        el('button', { type: 'button', class: 'r4-btn', disabled: this.page === 0, 'aria-label': T('r4.pager.prev', 0, 'Página anterior'), onclick: () => this.setPage(this.page - 1) }, [R4.icon('chevron-left')]),
        el('span', { text: ' ' + T('r4.pager.info', { page: this.page + 1, pages, n: total }, `${this.page + 1} / ${pages}  ·  ${total} registros`) + ' ' }),
        el('button', { type: 'button', class: 'r4-btn', disabled: this.page >= pages - 1, 'aria-label': T('r4.pager.next', 0, 'Próxima página'), onclick: () => this.setPage(this.page + 1) }, [R4.icon('chevron-right')]));
    },
    /** <select> "Linhas por página": criado uma vez (fica fora de _pNav para manter o foco); aqui só atualiza opções e valor. */
    _renderSizeSel() {
      if (!this.pageSizeSelector) { if (this._pSel) { this._pSel.remove(); this._pSel = null; } return; }
      if (!this._pSel) {
        const id = 'r4-ps-' + R4.util.uid();
        this._psSelect = el('select', { class: 'r4-input r4-pager-size-select', id });
        this._psSelect.addEventListener('change', () => this.setPageSize(this._psSelect.value === 'all' ? 0 : +this._psSelect.value));
        this._psLabel = el('label', { for: id });
        this._pSel = el('span', { class: 'r4-pager-size' }, [this._psLabel, this._psSelect]);
        this.pager.append(this._pSel);
        this._psSig = '';
      }
      const sizes = this._sizes(), cur = this._size(), sig = sizes.join(',') + '|' + (R4.i18n && R4.i18n.locale || '');
      this._psLabel.textContent = T('r4.grid.pageSize', 0, 'Linhas por página');
      if (this._psSig !== sig) {
        this._psSig = sig;
        this._psSelect.replaceChildren(...sizes.map(n => el('option', { value: n ? String(n) : 'all', text: n ? String(n) : T('r4.grid.all', 0, 'Todos') })));
      }
      this._psSelect.value = cur ? String(cur) : 'all';
    },
    /** Destaque da busca: cada célula de dados que contém o termo (texto exibido ou valor bruto) ganha .r4-hit. Só as linhas desenhadas (nunca varre todos os dados). */
    _mark(tr) {
      const q = this.highlight !== false ? this.q : '';
      if (!q && !tr._hit) return;
      const cols = this._cols, off = this._off, row = tr._row; let any = false;
      for (let j = 0; j < cols.length; j++) {
        const c = cols[j], td = tr.cells[j + off];
        if (!td) continue;
        let hit = false;
        if (q && !c.actions) {
          hit = td.textContent.toLowerCase().includes(q);
          if (!hit && c.dataIndex != null && row != null) { const v = row[c.dataIndex]; hit = v != null && typeof v !== 'object' && String(v).toLowerCase().includes(q); }
        }
        if (td.classList.contains('r4-hit') !== hit) td.classList.toggle('r4-hit', hit);
        if (hit) any = true;
      }
      tr._hit = any;
    },
    setPage(p) {
      const size = this._size(); if (!size) return this;
      this.page = Math.max(0, Math.min(p, Math.ceil(this._count / size) - 1));
      this.scroller.scrollTop = 0; this._act.r = Math.min(this._act.r, 0);
      if (this.remote) this.load(); else this._render();
      return this;
    },
    /** Texto da linha de mensagem: carregando ou vazio (no idioma atual quando não definido). */
    _msgText() { return this._loading ? (this.loadingText || T('r4.loading', 0, 'Carregando...')) : (this.emptyText || T('r4.empty', 0, 'Nenhum registro.')); },
    /** Troca de idioma (R4.i18n.set): refaz cabeçalho, mensagens e paginação. */
    relocalize() { this.refresh(); },
    _busy(on) {
      this._loading = on;
      this.el && this.el.setAttribute('aria-busy', on ? 'true' : 'false');
      this.mask.hidden = !on;
      if (!this._rows.length && !this._err) this._msgTd.textContent = this._msgText();
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
      if (t.classList.contains('r4-th-filter')) {   // botão do funil: Enter/Espaço/↓ abrem o filtro
        if (['Enter', ' ', 'Spacebar', 'ArrowDown'].includes(ev.key)) { ev.preventDefault(); ev.stopPropagation(); this._cfToggle(this._cols[t.closest('th').cellIndex - this._off], t); }
        return;
      }
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
        case 'ArrowDown':
          if (ev.altKey && r < 0 && col && this._cfOn(col)) { ev.preventDefault(); const fb = cell.querySelector('.r4-th-filter'); fb && this._cfToggle(col, fb); return; }   // Alt+↓ no cabeçalho abre o filtro
          r = Math.min(n - 1, r + 1); break;
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
        const fb = t.closest('.r4-th-filter');
        if (fb) { this._cfToggle(this._cols[cell.cellIndex - this._off], fb); return; }   // o funil NÃO ordena
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
      input.setAttribute('aria-label', T('r4.grid.edit', { col: col.header ?? col.dataIndex }, 'Editar ' + (col.header ?? col.dataIndex)));
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
      const m = el('div', { class: 'r4-grid-menu r4-cmp', role: 'menu', 'aria-label': kind === 'cols' ? T('r4.grid.cols', 0, 'Colunas') : T('r4.grid.export', 0, 'Exportar') });
      if (kind === 'export') {
        [['csv', 'CSV (.csv)'], ['xlsx', 'Excel (.xlsx)'], ['json', 'JSON (.json)'], ['print', T('r4.grid.print', 0, 'Imprimir')]]
          .forEach(([k, t]) => m.append(el('button', { type: 'button', role: 'menuitem', class: 'r4-grid-mi', 'data-k': k, text: t })));
      } else {
        this.columns.forEach((c, i) => {
          if (c.dataIndex == null && !c.header) return;
          const cb = el('input', { type: 'checkbox', 'data-ci': i, tabindex: '-1' }); cb.checked = !c.hidden;
          m.append(el('label', { class: 'r4-grid-mi', role: 'menuitemcheckbox', tabindex: '-1', 'aria-checked': String(!c.hidden) }, [cb, el('span', { text: c.header ?? c.dataIndex })]));
        });
        if (this._sorters().length) m.append(el('button', { type: 'button', role: 'menuitem', class: 'r4-grid-mi', 'data-k': 'unsort', text: T('r4.grid.unsort', 0, 'Limpar ordenação') }));
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

    /* ---------- filtro por valores da coluna (estilo Excel / legenda de gráfico) ---------- */
    /** A coluna tem filtro? columnFilters liga em todas; coluna.filterValues=true só nela; filterable/filterValues=false desliga. */
    _cfOn(c) { return !!(c && c.dataIndex != null && !c.actions && c.filterable !== false && (c.filterValues === true || (this.columnFilters && c.filterValues !== false))); },
    _cfBtn(c) {
      const k = String(c.dataIndex), n = (this._cf[k] || []).length, name = c.header ?? c.dataIndex;
      const b = el('button', { type: 'button', class: 'r4-th-filter' + (n ? ' r4-on' : ''), tabindex: '-1', 'data-cf': k, 'aria-haspopup': 'dialog', 'aria-expanded': String(!!(this._cfP && this._cfP.key === k)),
        'aria-label': T('r4.grid.cfTitle', { col: name }, 'Filtrar valores de ' + name), title: T('r4.grid.cfBtn', 0, 'Filtrar valores') }, [R4.icon('filter'), el('span', { class: 'r4-fn', text: n ? String(n) : '' })]);
      return b;
    },
    _cfBadges() {
      this.thead.querySelectorAll('.r4-th-filter').forEach(b => {
        const n = (this._cf[b.getAttribute('data-cf')] || []).length;
        b.classList.toggle('r4-on', n > 0); b.lastChild.textContent = n ? String(n) : '';
      });
    },
    /** Filtros ativos: { coluna: [valores] } (só colunas com pelo menos um valor marcado). */
    _cfActive() { const o = {}; for (const k in this._cf) if (this._cf[k].length) o[k] = this._cf[k].slice(); return o; },
    getColumnFilters() { return this._cfActive(); },
    /** setColumnFilter('status', ['pago','aberto']) — lista vazia remove o filtro da coluna. Volta à página 1 e recarrega (remoto). */
    setColumnFilter(key, values) {
      const v = [...new Set([].concat(values ?? []).map(x => x == null ? '' : String(x)))];
      if (v.length) this._cf[String(key)] = v; else delete this._cf[String(key)];
      return this._cfApply();
    },
    clearColumnFilters() { this._cf = {}; return this._cfApply(); },
    _cfApply() {
      this._cfT = null; this.page = 0;
      if (this._cfP && this._cfP.el) this._cfFoot();
      this._cfBadges();
      this.fire('filterchange', this, this._cfActive());
      if (this.remote) { if (this.src) this.load(); else this._update(false); }
      else { if (this.scroller) this.scroller.scrollTop = 0; this._update(false); }
      return this;
    },
    /** Texto exibido da célula (renderer/format quando existir), guardado por versão dos dados. */
    _cfText(c, row) {
      let ca = this._cfT;
      if (!ca || ca.ver !== this._ver) ca = this._cfT = { ver: this._ver, m: {} };
      const k = c.dataIndex, m = ca.m[k] || (ca.m[k] = new Map());
      let t = m.get(row);
      if (t === undefined) {
        const v = row == null ? undefined : row[k];
        let r = null;
        if (c.renderer && c.html !== true) { try { r = c.renderer(v, row); } catch (e) { r = null; } }
        if (r != null && (typeof r === 'string' || typeof r === 'number' || typeof r === 'boolean')) t = String(r).trim();
        else if (r != null && r.nodeType) t = (r.textContent || '').trim();
        else t = fmtVal(c, v).trim();
        m.set(row, t);
      }
      return t;
    },
    /** Predicado das linhas: E entre colunas, OU entre os valores da coluna. `skip` ignora uma coluna (contagens do popover). */
    _cfPred(skip) {
      const act = this._cfActive(), ks = Object.keys(act).filter(k => k !== skip);
      if (!ks.length) return null;
      const tests = ks.map(k => {
        const c = this.columns.find(x => x && String(x.dataIndex) === k), set = new Set(act[k]);
        return c ? row => { const raw = row == null ? undefined : row[k]; return set.has(this._cfText(c, row)) || set.has(raw == null ? '' : String(raw)); } : () => true;
      });
      return row => { for (let i = 0; i < tests.length; i++) if (!tests[i](row)) return false; return true; };
    },
    _cfNorm(o) {
      if (o && typeof o === 'object') { const v = o.value ?? o.valor ?? '', l = o.label ?? o.texto ?? o.text; return { value: String(v), label: l != null ? String(l) : String(v), count: o.count ?? o.qtd ?? null }; }
      const v = o == null ? '' : String(o); return { value: v, label: v, count: null };
    },
    /** Valores do popover. Local: distintos da coluna sobre o que sobra da busca e dos OUTROS filtros. Remoto: optionsUrl; sem ela, os valores já carregados. */
    async _cfItems(c) {
      const key = String(c.dataIndex);
      let items, many = false;
      const contar = rows => {
        const tx = new Map(), rw = new Map();
        for (const r of rows) { const t = this._cfText(c, r), v = r == null || r[key] == null ? '' : String(r[key]); tx.set(t, (tx.get(t) || 0) + 1); if (v !== t) rw.set(v, (rw.get(v) || 0) + 1); }
        return { tx, rw };
      };
      if (this.remote && c.optionsUrl) {
        const ca = this._cfCache[key];
        if (ca && ca.q === this.q) return ca;
        const r = await this._request(withQuery(c.optionsUrl, { col: key, q: this.q || null }), null, 'GET');
        const rows = Array.isArray(r) ? r : r && (r.retorno || r.data || r.rows);
        if (!Array.isArray(rows)) throw new Error((r && (typeof r.retorno === 'string' ? r.retorno : r.mensagem || r.message)) || T('r4.grid.noList', 0, 'Resposta sem lista de registros.'));
        items = rows.map(o => (o && typeof o === 'object' ? this._cfNorm({ value: o.valor ?? o.value ?? '', label: o.label ?? o.texto, count: o.qtd ?? o.count }) : this._cfNorm(o)));
        return (this._cfCache[key] = { q: this.q, items, many: false });
      }
      if (Array.isArray(c.options)) {
        items = c.options.map(o => this._cfNorm(o));
        if (!this.remote && items.some(i => i.count == null)) {
          let rows = this.data; if (this.q) { const txt = this._texts(), q = this.q; rows = rows.filter(r => txt(r).includes(q)); }
          const pr = this._cfPred(key); if (pr) rows = rows.filter(pr);
          const { tx, rw } = contar(rows);
          items.forEach(i => { if (i.count == null) i.count = tx.get(i.value) ?? rw.get(i.value) ?? 0; });
        }
        return { items, many: false };
      }
      let rows = this.remote ? (this._vr() ? (this._wrows || []).filter(Boolean) : this.data) : this.data;
      if (!this.remote) {
        if (this.q) { const txt = this._texts(), q = this.q; rows = rows.filter(r => txt(r).includes(q)); }
        const pr = this._cfPred(key); if (pr) rows = rows.filter(pr);
      }
      const { tx } = contar(rows);
      items = [...tx].map(([v, n]) => ({ value: v, label: v, count: n }));
      many = items.length > 1000;
      return { items, many };
    },
    _cfToggle(c, btn) {
      const same = this._cfP && this._cfP.btn === btn;
      this._cfClose();
      if (!same && c) this._cfOpen(c, btn);
    },
    _cfOpen(c, btn) {
      this._closeMenu(); this._cfT = null;
      const key = String(c.dataIndex), name = c.header ?? c.dataIndex;
      const sel = new Set(this._cf[key] || []);
      const search = el('input', { type: 'search', class: 'r4-input r4-cf-search', 'aria-label': T('r4.grid.cfSearch', 0, 'Buscar valor...') });
      search.placeholder = T('r4.grid.cfSearch', 0, 'Buscar valor...');
      const bAll = el('button', { type: 'button', class: 'r4-btn r4-cf-btn', 'data-k': 'all', text: T('r4.grid.cfAll', 0, 'Selecionar todos') });
      const bClr = el('button', { type: 'button', class: 'r4-btn r4-cf-btn', 'data-k': 'clear', text: T('r4.grid.cfClear', 0, 'Limpar') });
      const bOrd = el('button', { type: 'button', class: 'r4-btn r4-cf-btn', 'data-k': 'ord' });
      const list = el('div', { class: 'r4-cf-list', role: 'group', 'aria-label': T('r4.grid.cfTitle', { col: name }, 'Filtrar valores de ' + name) });
      const foot = el('div', { class: 'r4-cf-foot', 'aria-live': 'polite' });
      const m = el('div', { class: 'r4-grid-menu r4-cmp r4-cf', role: 'dialog', 'aria-label': T('r4.grid.cfTitle', { col: name }, 'Filtrar valores de ' + name) },
        [el('div', { class: 'r4-cf-title', text: String(name) }), search, el('div', { class: 'r4-cf-tools' }, [bAll, bClr, bOrd]), list, foot]);
      const p = this._cfP = { c, key, btn, el: m, sel, search, list, foot, bOrd, items: [], many: false, order: 'count', loading: true, error: null, t: null };
      const apply = () => { clearTimeout(p.t); p.t = setTimeout(() => { p.t = null; this._cfCommit(); }, 150); };
      p.apply = apply;
      m.addEventListener('change', ev => {
        const cb = ev.target; if (cb.type !== 'checkbox' || cb._v === undefined) return;
        cb.checked ? sel.add(cb._v) : sel.delete(cb._v);
        this._cfFoot(); apply();
      });
      m.addEventListener('click', ev => {
        const b = ev.target.closest('[data-k]'); if (!b) return;
        const k = b.getAttribute('data-k');
        if (k === 'all') this._cfVisible(p).forEach(i => sel.add(i.value));
        else if (k === 'clear') sel.clear();
        else if (k === 'ord') p.order = p.order === 'count' ? 'alpha' : 'count';
        this._cfList(); apply();
      });
      search.addEventListener('input', () => this._cfList());
      m.addEventListener('keydown', ev => {
        if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); this._cfClose(true); return; }
        if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
          const f = [...m.querySelectorAll('input,button')].filter(x => !x.disabled), i = f.indexOf(document.activeElement);
          if (document.activeElement === search && ev.key === 'ArrowUp') return;
          ev.preventDefault(); const n = f[Math.max(0, Math.min(f.length - 1, i + (ev.key === 'ArrowDown' ? 1 : -1)))]; n && n.focus();
        }
      });
      m.addEventListener('focusout', ev => { if (ev.relatedTarget && !m.contains(ev.relatedTarget) && ev.relatedTarget !== btn) this._cfClose(); });
      document.body.append(m);
      btn.setAttribute('aria-expanded', 'true');
      p.out = ev => { if (!m.contains(ev.target) && !btn.contains(ev.target)) this._cfClose(); };
      p.rs = () => this._cfClose();
      document.addEventListener('mousedown', p.out, true);
      window.addEventListener('resize', p.rs);
      this.scroller.addEventListener('scroll', p.rs, { passive: true });
      this._cfList(); this._cfPlace();
      search.focus();
      this._cfItems(c).then(r => {
        if (this._cfP !== p) return;
        p.items = r.items; p.many = r.many; p.loading = false; this._cfList(); this._cfPlace();
      }, e => { if (this._cfP !== p) return; p.loading = false; p.error = e; this._cfList(); });
    },
    _cfVisible(p) {
      const q = p.search.value.trim().toLowerCase();
      let l = p.items;
      if (p.many && !q) return [];
      if (q) l = l.filter(i => i.label.toLowerCase().includes(q) || i.value.toLowerCase().includes(q));
      l = l.slice().sort(p.order === 'alpha' ? (a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }) : (a, b) => (b.count || 0) - (a.count || 0) || a.label.localeCompare(b.label, undefined, { numeric: true }));
      return l.slice(0, p.many ? 200 : 1000);
    },
    _cfList() {
      const p = this._cfP; if (!p) return;
      p.bOrd.textContent = p.order === 'count' ? T('r4.grid.cfSortCount', 0, 'Por quantidade') : T('r4.grid.cfSortAlpha', 0, 'A–Z');
      const f = document.createDocumentFragment();
      if (p.loading) f.append(el('div', { class: 'r4-cf-msg', text: T('r4.loading', 0, 'Carregando...') }));
      else if (p.error) f.append(el('div', { class: 'r4-cf-msg r4-cf-err', role: 'alert', text: T('r4.grid.cfFail', 0, 'Falha ao carregar valores') + (p.error.message ? ' (' + p.error.message + ')' : '') }));
      else {
        if (p.many && !p.search.value.trim()) f.append(el('div', { class: 'r4-cf-msg', text: T('r4.grid.cfMany', { n: R4.util.number(p.items.length, 0) }, 'Muitos valores (' + R4.util.number(p.items.length, 0) + '): use a busca acima.') }));
        this._cfVisible(p).forEach(i => {
          const cb = el('input', { type: 'checkbox' }); cb._v = i.value; cb.checked = p.sel.has(i.value);
          f.append(el('label', { class: 'r4-grid-mi r4-cf-item' }, [cb, el('span', { class: 'r4-cf-val', text: i.value === '' && i.label === '' ? T('r4.grid.cfEmpty', 0, '(vazio)') : i.label }), i.count != null ? el('span', { class: 'r4-cf-n', text: R4.util.number(i.count, 0) }) : null]));
        });
        if (!f.childNodes.length) f.append(el('div', { class: 'r4-cf-msg', text: T('r4.empty', 0, 'Nenhum registro.') }));
      }
      p.list.replaceChildren(f);
      this._cfFoot();
    },
    _cfFoot() {
      const p = this._cfP; if (!p) return;
      const n = p.sel.size, mm = p.items.length;
      p.foot.textContent = T('r4.grid.cfCount', { n, m: mm }, n + ' de ' + mm + ' selecionados');
    },
    _cfPlace() {
      const p = this._cfP; if (!p) return;
      const r = p.btn.getBoundingClientRect(), vw = document.documentElement.clientWidth, vh = document.documentElement.clientHeight, m = p.el;
      m.style.maxHeight = Math.min(vh - 16, Math.round(vh * 0.7)) + 'px';
      const w = m.offsetWidth, h = m.offsetHeight;
      let top = r.bottom + 4; if (top + h > vh - 8) top = Math.max(8, r.top - h - 4);
      m.style.left = Math.max(8, Math.min(r.left, vw - w - 8)) + 'px'; m.style.top = Math.round(top) + 'px';
    },
    /** Grava a seleção do popover no estado do grid e refiltra (nenhum marcado = sem filtro). */
    _cfCommit() {
      const p = this._cfP; if (!p) return;
      const v = [...p.sel];
      if (v.length) this._cf[p.key] = v; else delete this._cf[p.key];
      this._cfApply();
    },
    _cfClose(refocus) {
      const p = this._cfP; if (!p) return;
      this._cfP = null;
      if (p.t) { clearTimeout(p.t); this._cfP = p; this._cfCommit(); this._cfP = null; }
      document.removeEventListener('mousedown', p.out, true);
      window.removeEventListener('resize', p.rs);
      this.scroller && this.scroller.removeEventListener('scroll', p.rs);
      p.el.remove();
      p.btn.setAttribute('aria-expanded', 'false');
      if (refocus && p.btn.isConnected) p.btn.focus();
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
      // sandbox sem allow-scripts: mesmo que algo escapasse do esc(), nada executa no iframe de impressão
      const f = el('iframe', { class: 'r4-print-frame', title: T('r4.grid.printing', 0, 'Impressão'), 'aria-hidden': 'true', tabindex: '-1', sandbox: 'allow-same-origin allow-modals' });
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
      this._closeMenu(); this._cfClose();
      this._printFrame && this._printFrame.remove();
    }
  }, {
    title: 'grid', group: 'Componentes',
    description: 'Tabela de dados: ordenação multi-coluna (Shift+clique), filtro, paginação local ou no servidor (remote), virtualização para dezenas de milhares de linhas, seleção simples/múltipla com teclado, edição na célula, rodapé de totais, colunas redimensionáveis/ocultáveis, coluna de ações e exportação CSV/XLSX/JSON/impressão. Seguro por padrão: valores e strings devolvidas pelo renderer vão como texto; HTML só com R4.html`...${v}...` (escapa os dados) ou R4.raw.',
    props: [
      { name: 'columns', type: 'Array<string | coluna>', default: '[]', desc: 'Colunas. Vazio = automáticas a partir das chaves do primeiro registro.' },
      { name: 'coluna.header / dataIndex', type: 'string', desc: 'Título e campo do registro.' },
      { name: 'coluna.format', type: "'money'|'number'|'date'|'bytes'|'bool'|'upper'", desc: 'Formata o valor (R4.formats) — também no rodapé e na impressão. Exportação CSV/XLSX/JSON leva o valor bruto (XLSX aplica o formato de célula).' },
      { name: 'coluna.renderer', type: 'function(valor, linha) → texto | R4.html | Node', desc: 'Conteúdo da célula. String/número viram TEXTO (seguro). Para HTML devolva R4.html`<b>${valor}</b>` (cada ${} é escapado) ou um elemento DOM.' },
      { name: 'coluna.html', type: 'boolean', default: 'false', desc: 'Modo antigo: true faz a string do renderer ser HTML CONFIÁVEL, sem escape (só use se o renderer escapar tudo com R4.util.esc).' },
      { name: 'coluna.align / width / minWidth', type: "'left'|'center'|'right' / number / number", desc: 'Alinhamento e larguras em px.' },
      { name: 'coluna.sortable / hidden / resizable', type: 'boolean', desc: 'sortable:false não ordena; hidden começa oculta (volta pelo menu de colunas); resizable:false impede arrastar.' },
      { name: 'coluna.editable', type: "true | 'number' | 'date' | 'text' | {options:[...], type}", desc: 'Edição na célula: duplo clique, Enter ou F2 abre; Enter/Tab/sair confirma; Esc cancela. options aceita valores ou {value,text}/{valor,texto}.' },
      { name: 'coluna.summary', type: "'sum'|'avg'|'count'|'min'|'max'|fn(valores, linhas, coluna)", desc: 'Rodapé de resumo, calculado sobre as linhas filtradas (no modo remoto, sobre a página carregada) e formatado com format.' },
      { name: 'coluna.actions', type: "Array<{text, icon, title, variant, handler(linha, grid, ev), 'r4-click', 'r4-confirm'}>", desc: 'Coluna de botões. Em r4-click/r4-confirm, {campo} vira o valor da linha (ex.: "toast:Abrir {nome}").' },
      { name: 'data', type: 'Array<object>', default: '[]', desc: 'Registros.' },
      { name: 'pageSize', type: 'number', default: '0', desc: 'Linhas por página (0 = sem paginação; no modo remoto o padrão é 25).' },
      { name: 'filter', type: 'boolean', default: 'true', desc: 'Barra de filtro (busca em todas as colunas, com atraso de digitação).' },
      { name: 'highlight', type: 'boolean', default: 'true', desc: 'Com filtro ativo, marca (classe r4-hit, cor --r4-hit) cada CÉLULA que contém o termo — mostra em qual coluna a linha casou. highlight="false" desliga.' },
      { name: 'pageSizeSelector', type: 'boolean', default: 'false', desc: 'Mostra o seletor "Linhas por página" no rodapé (page-size-selector). Funciona local e remoto.' },
      { name: 'pageSizes', type: 'Array<number|"all">', default: '[] (10, 30, 50, 100, Todos)', desc: 'Opções do seletor; 0 ou "all" = Todos (page-sizes="10,30,50,100,all"). No modo remoto o padrão NÃO inclui Todos: só aparece se estiver aqui e ativa a JANELA REMOTA (rolagem sobre todas as linhas do servidor, DOM enxuto, blocos de 100 pedidos conforme a rolagem; acima de ~220 mil linhas a rolagem é escalada). O tamanho atual (pageSize) entra na lista se faltar.' },
      { name: 'striped / emptyText / height', type: "boolean / string / number", default: "true / '' / 0", desc: 'Listras, texto de vazio (vazio = "Nenhum registro." no idioma atual, via R4.i18n), altura fixa da área de rolagem em px (0 = automática, máx. 420).' },
      { name: 'virtual', type: 'boolean', default: 'false', desc: 'Renderiza só as linhas visíveis (altura fixa rowHeight). Liga sozinho sem paginação acima de virtualThreshold linhas.' },
      { name: 'virtualThreshold / rowHeight', type: 'number / number', default: '1000 / 36', desc: 'Limite da virtualização automática (0 desliga) e altura da linha em px no modo virtual.' },
      { name: 'selectable', type: "'' | 'single' | 'multi'", default: "''", desc: "multi adiciona coluna de caixas (a do cabeçalho seleciona todos os filtrados), Ctrl+clique alterna e Shift+clique seleciona intervalo." },
      { name: 'idProperty', type: 'string', default: "'id'", desc: 'Campo que identifica a linha na seleção (mantém a seleção entre páginas do modo remoto).' },
      { name: 'src / method / encrypt / params', type: 'string / string / boolean / object', default: "'' / 'GET' / false / null", desc: 'Carrega os dados de uma URL ao renderizar (JSON; com encrypt o corpo vai como no R4.http). Mostra "carregando"; status HTTP fora de 2xx, {status ≥ 400} no corpo ou JSON inválido viram estado de erro com botão Tentar de novo, sem apagar os dados atuais. reload() busca de novo.' },
      { name: 'remote', type: 'boolean', default: 'false', desc: 'Paginação, ordenação e filtro no servidor: envia page (1…), size, sort, dir (asc|desc), q e lê {total, retorno}. Multi-coluna envia só o critério principal.' },
      { name: 'resizable / columnMenu', type: 'boolean', default: 'false', desc: 'Arrastar a borda do cabeçalho (ou Alt+←/→ no cabeçalho) muda a largura; menu "Colunas" mostra/oculta colunas.' },
      { name: 'columnFilters', type: 'boolean', default: 'false', desc: 'Funil em cada cabeçalho: abre uma lista dos valores da coluna (com a quantidade de cada um) para marcar quais aparecem — como a legenda de um gráfico. Nenhum marcado = sem filtro; valores da mesma coluna somam (OU) e colunas diferentes se combinam (E). Local: valores distintos da própria coluna sobre o que sobra da busca e dos outros filtros (até 1000; acima disso só pela busca do popover). Remoto: envia filtro[coluna][]=valor (um por valor) e busca os valores em coluna.optionsUrl. Atalho: Alt+↓ no cabeçalho. Atributo: column-filters.' },
      { name: 'coluna.filterValues / filterable / options / optionsUrl', type: 'boolean / boolean / Array / string', desc: 'filterValues: true liga o funil só nesta coluna (false desliga mesmo com columnFilters); filterable: false também desliga. options: lista fixa de valores (["pago","aberto"] ou [{value,label,count}]). optionsUrl (remoto): GET optionsUrl?col=<campo>[&q=<busca>] → {retorno:[{valor, qtd}]}, com cache por coluna enquanto a busca não muda. Em <r4-col>: filter-values, filterable, filter-options (JSON ou lista com vírgula), options-url.' },
      { name: 'getColumnFilters() / setColumnFilter(campo, valores) / clearColumnFilters()', type: 'método', desc: 'Lê { campo: [valores] }, define (lista vazia remove) e limpa os filtros por valores; volta à página 1 e recarrega no modo remoto. Evento filterchange(grid, filtros).' },
      { name: 'exportable / exportName', type: "boolean / string", default: "false / 'dados'", desc: 'Botão "Exportar" (CSV, Excel, JSON, imprimir) com as linhas filtradas/ordenadas e colunas visíveis.' },
      { name: 'summaryLabel / loadingText / errorText', type: 'string', default: "'' / '' / ''", desc: 'Textos do rodapé e dos estados. Vazio = texto padrão no idioma atual (Total / Carregando... / Falha ao carregar.).' },
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
    events: ['rowclick', 'rowdblclick', 'load', 'loaderror', 'pagesizechange', 'selectionchange', 'sortchange', 'beforecellchange', 'cellchange', 'columnresize', 'columnchange', 'filterchange', 'action', 'export']
  });
  /** Lê as <r4-col> de um <r4-grid> (usado pelo gancho R4.declare('grid') registrado em files.js). */
  Grid.colsFromHost = function (host) {
    const KNOWN = new Set(['field', 'header', 'width', 'min-width', 'align', 'sortable', 'format', 'hidden', 'resizable', 'editable', 'options', 'summary', 'actions', 'class', 'style', 'id', 'filter-values', 'filterable', 'filter-options', 'options-url']);
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
      if (has('filter-values')) cfg.filterValues = on('filter-values');
      if (has('filterable')) cfg.filterable = on('filterable');
      if (has('options-url')) cfg.optionsUrl = g('options-url');
      if (has('filter-options')) { const v = g('filter-options').trim(); cfg.options = /^\[/.test(v) ? json(v, []) : v.split(',').map(x => x.trim()).filter(Boolean); }
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
      if (this.closable) head.append(tx(R4.util.icon(el('span', { class: 'r4-tool', onclick: () => this.close() }), 'close'), 'r4.close', 'Fechar', 'title'));
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
      { name: 'title / html / items', type: 'mixed', desc: 'Conteúdo da janela. title é texto; html é HTML CONFIÁVEL (escape dados com R4.util.esc ou use R4.html). Para mensagem com dado de fora use R4.msg.alert (escapa).' },
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
        buttons: [{ text: T('r4.ok', 0, 'OK'), variant: 'primary', handler: () => cb && cb() }] }).show();
    },
    confirm(title, text, cb) {
      return R4.create({ xtype: 'window', title, html: '<p>' + esc(text) + '</p>', width: 380,
        buttons: [{ text: T('r4.cancel', 0, 'Cancelar'), handler: () => cb && cb(false) }, { text: T('r4.yes', 0, 'Sim'), variant: 'primary', handler: () => cb && cb(true) }] }).show();
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
    controls: { selectable: ['', 'single', 'multi'], pageSize: 0, filter: true, columnFilters: false, striped: true, resizable: false, columnMenu: false, exportable: false, virtual: false, summaryLabel: '', emptyText: '' } });
  PG('treepanel', { html: '<r4-treepanel{attrs} style="height:180px">\n  <r4-node text="Frutas"><r4-node id="pg-a" text="Maçã"></r4-node><r4-node id="pg-b" text="Banana"></r4-node></r4-node>\n</r4-treepanel>',
    cfg: { nodes: [{ text: 'Frutas', children: [{ id: 'a', text: 'Maçã' }, { id: 'b', text: 'Banana' }] }] },
    controls: { filterable: true, placeholder: '' } });
})(window.R4);
