/**
 * ============================================
 * libr4 / chart.js  —  R4 dev
 * ============================================
 * Gráficos em SVG puro (sem bibliotecas): barras (agrupadas, empilhadas, horizontais),
 * linhas (suavizadas, área), pizza, rosca, dispersão e sparkline.
 *
 *   <r4-chart type="bar" src="/showcase/vitrineData/vendas-mensais.json" x="mes" y="receita,despesa" format="money" height="280"></r4-chart>
 *   <r4-sparkline data="[3,5,4,8,6]"></r4-sparkline>
 *   R4.chart('#alvo', linhas, { type: 'line', x: 'data', y: 'visitas' })
 *   R4.create({ xtype: 'chart', renderTo: '#alvo', data: [...], x: 'mes', y: ['receita', 'despesa'] })
 *
 * Limites e requisitos (também na vitrine):
 *   - Linhas: acima de `maxPoints` (1500) pontos desenha só o mínimo e o máximo de cada trecho
 *     (decimação). Testado com 10.000 pontos. Barras: use até ~500 categorias (acima disso há amostragem).
 *     Tabela alternativa: mostra as primeiras 500 linhas.
 *   - exportPNG precisa de navegador com <canvas> e Blob (Chrome, Edge, Firefox, Safari atuais);
 *     se o navegador recusar a rasterização, a promessa é rejeitada e o evento 'exporterror' é disparado.
 *   - Largura de rótulos é estimada (não medida), então rótulos muito longos são abreviados com "…".
 * ============================================
 */
(function (R4) {
  'use strict';
  const { el } = R4.util;
  const TR = R4.util.T;   // R4.t com reserva (resolvido em tempo de uso)
  const NS = 'http://www.w3.org/2000/svg';
  const MAXC = 8, MAXBAR = 32, TABLE_ROWS = 500;
  const raf = f => (window.requestAnimationFrame ? window.requestAnimationFrame(f) : setTimeout(() => f(Date.now()), 16));
  const caf = h => (window.cancelAnimationFrame ? window.cancelAnimationFrame(h) : clearTimeout(h));

  /* ---------- utilidades numéricas ---------- */
  const r2 = n => (isFinite(n) ? Math.round(n * 100) / 100 : 0);        // nunca devolve NaN/Infinity para o SVG
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const toNum = v => {
    if (typeof v === 'number') return isFinite(v) ? v : NaN;
    if (typeof v === 'string' && v.trim() !== '') { const n = Number(v); return isFinite(n) ? n : NaN; }
    return NaN;
  };
  const estW = s => String(s).length * 6.2 + 2;                          // largura estimada de texto de 11px
  const cut = (s, max) => { s = String(s); return s.length > max ? s.slice(0, Math.max(1, max - 1)) + '…' : s; };
  const humanize = k => String(k).replace(/[_-]+/g, ' ').replace(/^./, m => m.toUpperCase());
  /**
   * Aceita só cores (allowlist): #hex, nome (red, rebeccapurple), var(--x) e as funções de cor
   * rgb/hsl/hwb/lab/lch/oklab/oklch/color com números. Qualquer outra coisa (url(), image-set(),
   * cross-fade(), ';', comentários) é recusada: a cor vai para style="fill:..." / background.
   */
  const COLOR_RE = /^(#[0-9a-f]{3,8}|[a-z]{3,24}|var\(--[a-z0-9_-]{1,40}\)|(rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\([a-z0-9\s.,%+\-/]{1,60}\))$/i;
  const cssColor = c => (typeof c === 'string' && c.length < 80 && COLOR_RE.test(c.trim()) ? c.trim() : '');
  const ISO = /^(\d{4})-(\d{2})-(\d{2})(?:[T ].*)?$/;
  const isDate = v => typeof v === 'string' && ISO.test(v) && +v.slice(5, 7) >= 1 && +v.slice(5, 7) <= 12;

  /** Escala "nice" (passos 1-2-5): { min, max, step, ticks } */
  function niceNum(x, round) {
    const e = Math.floor(Math.log10(x)), f = x / Math.pow(10, e);
    const n = round ? (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) : (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10);
    return n * Math.pow(10, e);
  }
  function niceScale(min, max, count) {
    if (!isFinite(min) || !isFinite(max)) { min = 0; max = 1; }
    if (min > max) { const t = min; min = max; max = t; }
    if (min === max) { if (min === 0) max = 1; else { const d = Math.abs(min) * 0.1; min -= d; max += d; } }
    const step = niceNum((max - min) / Math.max(1, count - 1), true);
    const lo = Math.floor(min / step + 1e-9) * step, hi = Math.ceil(max / step - 1e-9) * step;
    const dec = Math.min(10, Math.max(0, -Math.floor(Math.log10(step) + 1e-9)));
    const ticks = [];
    for (let i = 0; i < 60; i++) { const v = lo + i * step; if (v > hi + step / 2) break; ticks.push(+v.toFixed(dec)); }
    return { min: +lo.toFixed(dec), max: +hi.toFixed(dec), step, dec, ticks };
  }

  /* ---------- SVG ---------- */
  function S(tag, attrs, parent) {
    const e = document.createElementNS(NS, tag);
    if (attrs) for (const k in attrs) { const v = attrs[k]; if (v == null || v === false) continue; e.setAttribute(k, typeof v === 'number' ? r2(v) : v); }
    if (parent) parent.appendChild(e);
    return e;
  }
  const P = (x, y) => r2(x) + ' ' + r2(y);
  const lineD = run => { let d = 'M' + P(run[0].x, run[0].y); for (let i = 1; i < run.length; i++) d += 'L' + P(run[i].x, run[i].y); return d; };
  /** Spline monótona (Fritsch–Carlson): suaviza sem criar picos falsos. */
  function monoD(pts) {
    const n = pts.length;
    if (n < 3) return lineD(pts);
    const dx = [], m = [], t = new Array(n);
    for (let i = 0; i < n - 1; i++) { dx[i] = pts[i + 1].x - pts[i].x; if (!(dx[i] > 0)) return lineD(pts); m[i] = (pts[i + 1].y - pts[i].y) / dx[i]; }
    t[0] = m[0]; t[n - 1] = m[n - 2];
    for (let i = 1; i < n - 1; i++) t[i] = m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2;
    for (let i = 0; i < n - 1; i++) {
      if (m[i] === 0) { t[i] = 0; t[i + 1] = 0; continue; }
      const a = t[i] / m[i], b = t[i + 1] / m[i], s = a * a + b * b;
      if (s > 9) { const k = 3 / Math.sqrt(s); t[i] = k * a * m[i]; t[i + 1] = k * b * m[i]; }
    }
    let d = 'M' + P(pts[0].x, pts[0].y);
    for (let i = 0; i < n - 1; i++) {
      const h = dx[i] / 3;
      d += 'C' + P(pts[i].x + h, pts[i].y + t[i] * h) + ' ' + P(pts[i + 1].x - h, pts[i + 1].y - t[i + 1] * h) + ' ' + P(pts[i + 1].x, pts[i + 1].y);
    }
    return d;
  }
  /** Barra com a ponta (dado) arredondada em 4px e a base reta. c = eixo da categoria, v = eixo do valor (px). */
  function barD(c0, cw, v0, v1, rnd, horiz) {
    const dv = v1 - v0, len = Math.abs(dv);
    if (!(len >= 0.5)) return '';
    const dir = dv < 0 ? -1 : 1, r = rnd ? Math.min(4, cw / 2, len) : 0, c1 = c0 + cw;
    const Q = (c, v) => (horiz ? P(v, c) : P(c, v));
    return 'M' + Q(c0, v0) + 'L' + Q(c0, v1 - dir * r) + (r ? 'Q' + Q(c0, v1) + ' ' + Q(c0 + r, v1) : '') +
      'L' + Q(c1 - r, v1) + (r ? 'Q' + Q(c1, v1) + ' ' + Q(c1, v1 - dir * r) : '') + 'L' + Q(c1, v0) + 'Z';
  }
  function arcD(cx, cy, R, ri, a0, a1) {
    const full = a1 - a0 >= Math.PI * 2 - 1e-6;
    if (full) {
      let d = 'M' + P(cx + R, cy) + 'A' + r2(R) + ' ' + r2(R) + ' 0 1 1 ' + P(cx - R, cy) + 'A' + r2(R) + ' ' + r2(R) + ' 0 1 1 ' + P(cx + R, cy) + 'Z';
      if (ri > 0) d += 'M' + P(cx + ri, cy) + 'A' + r2(ri) + ' ' + r2(ri) + ' 0 1 0 ' + P(cx - ri, cy) + 'A' + r2(ri) + ' ' + r2(ri) + ' 0 1 0 ' + P(cx + ri, cy) + 'Z';
      return d;
    }
    const large = a1 - a0 > Math.PI ? 1 : 0, pt = (r, a) => P(cx + r * Math.cos(a), cy + r * Math.sin(a));
    let d = 'M' + pt(R, a0) + 'A' + r2(R) + ' ' + r2(R) + ' 0 ' + large + ' 1 ' + pt(R, a1);
    d += ri > 0 ? 'L' + pt(ri, a1) + 'A' + r2(ri) + ' ' + r2(ri) + ' 0 ' + large + ' 0 ' + pt(ri, a0) + 'Z' : 'L' + P(cx, cy) + 'Z';
    return d;
  }
  /** Decimação: devolve os índices a desenhar (mínimo e máximo de cada trecho) ou null = todos. */
  function sampleIdx(n, vals, max) {
    if (n <= max) return null;
    const B = Math.max(1, Math.floor(max / 2)), size = n / B, out = new Set([0, n - 1]);
    for (let b = 0; b < B; b++) {
      const s0 = Math.floor(b * size), s1 = Math.min(n, Math.floor((b + 1) * size));
      let mn = -1, mx = -1, nl = -1;
      for (let i = s0; i < s1; i++) {
        const v = vals[i];
        if (v == null) { if (nl < 0) nl = i; continue; }
        if (mn < 0 || v < vals[mn]) mn = i;
        if (mx < 0 || v > vals[mx]) mx = i;
      }
      if (mn >= 0) out.add(mn);
      if (mx >= 0) out.add(mx);
      if (nl >= 0) out.add(nl);
    }
    return Array.from(out).sort((a, b) => a - b);
  }

  /* ---------- formatação ---------- */
  const nf = (v, o) => { try { return v.toLocaleString('pt-BR', o); } catch (e) { return String(v); } };
  function makeFmt(f) {
    const full = v => {
      if (v == null || !isFinite(v)) return '—';
      if (typeof f === 'function') { try { return String(f(v)); } catch (e) { return String(v); } }
      switch (f) {
        case 'money': return R4.util.money(v);
        case 'percent': return nf(v, { maximumFractionDigits: 2 }) + '%';
        case 'bytes': return R4.util.bytes(v);
        default: return R4.util.number(v, Number.isInteger(v) ? 0 : 2);
      }
    };
    /** rótulo de eixo: compacto (10 mil, 1,5 mi) quando o eixo é grande, decimais conforme o passo. */
    const axis = (v, dom) => {
      if (v == null || !isFinite(v)) return '';
      if (typeof f === 'function') return full(v);
      const big = Math.max(Math.abs(dom.min), Math.abs(dom.max)) >= 10000, d = dom.dec || 0;
      switch (f) {
        case 'money':
          return big ? nf(v, { style: 'currency', currency: 'BRL', notation: 'compact', maximumFractionDigits: 1 })
            : nf(v, { style: 'currency', currency: 'BRL', minimumFractionDigits: 0, maximumFractionDigits: Math.min(2, d) });
        case 'percent': return nf(v, { maximumFractionDigits: Math.min(2, d) }) + '%';
        case 'bytes': return R4.util.bytes(v);
        default: return big ? nf(v, { notation: 'compact', maximumFractionDigits: 1 }) : nf(v, { maximumFractionDigits: Math.min(2, d) });
      }
    };
    return { full, axis };
  }

  /** Interpreta o type e as opções de forma. */
  function typeOf(c) {
    const t = String(c.type || 'bar').toLowerCase();
    const T = { base: 'bar', horizontal: !!c.horizontal, stacked: !!c.stacked, area: !!c.area, donut: false, spark: false, name: t };
    switch (t) {
      case 'bar': case 'column': case 'columns': break;
      case 'barh': T.horizontal = true; break;
      case 'line': T.base = 'line'; break;
      case 'area': T.base = 'line'; T.area = true; break;
      case 'pie': T.base = 'pie'; break;
      case 'donut': case 'doughnut': case 'rosca': T.base = 'pie'; T.donut = true; break;
      case 'scatter': T.base = 'scatter'; break;
      case 'sparkline': case 'spark': T.base = 'line'; T.spark = true; break;
      default: R4.warn('chart: type desconhecido "' + t + '" (use bar, line, area, pie, donut, scatter ou sparkline)');
    }
    if (T.base !== 'bar') T.horizontal = false;
    T.stack = T.stacked && (T.base === 'bar' || (T.base === 'line' && T.area));
    return T;
  }
  const unwrap = r => (Array.isArray(r) ? r : (r && [r.retorno, r.data, r.rows].find(Array.isArray)) || null);

  /* ============================================================
   * componente chart
   * ============================================================ */
  R4.define('chart', {
    config: {
      type: 'bar', data: [], x: '', y: '', series: [], src: '',
      title: '', format: 'number', xFormat: 'auto', height: 0, width: 0,
      stacked: false, horizontal: false, smooth: false, area: false, points: true,
      legend: true, tooltip: true, animate: true, grid: true,
      color: '', colors: [], innerRadius: 0.62, centerText: '', centerSub: '',
      yMin: null, yMax: null, maxPoints: 1500, maxSlices: 8,
      tableButton: true, tableView: false, exportButtons: false,
      emptyText: '', errorText: '', loading: false,   // '' = texto padrão no idioma atual
       ariaLabel: ''
    },

    init() {
      this._hidden = new Set();       // séries/fatias desligadas na legenda
      this._timers = new Set();
      this._urls = new Set();
      this._tok = 0; this._idx = -1; this._W = 0; this._H = 0;
      this.on('destroy', this._cleanup);
    },

    /* ---------- DOM ---------- */
    build() {
      const T = typeOf(this);
      const root = el('div', { class: 'r4-chart' + (this.grid === false ? ' r4-nogrid' : '') + (T.spark ? ' r4-chart-spark' : '') + (this.width > 0 ? ' r4-chart-inline' : '') });
      if (this.width > 0) root.style.width = parseInt(this.width, 10) + 'px';

      const showHead = !T.spark && (this.title || this.tableButton || this.exportButtons);
      if (showHead) {
        this.head = el('div', { class: 'r4-chart-head' }, [el('div', { class: 'r4-chart-title', text: this.title || '' })]);
        if (this.exportButtons) {
          this.head.append(
            el('button', { type: 'button', class: 'r4-btn r4-chart-btn', text: 'SVG', title: TR('r4.chart.dlSvg', 0, 'Baixar como SVG'), onclick: () => this.exportSVG() }),
            el('button', { type: 'button', class: 'r4-btn r4-chart-btn', text: 'PNG', title: TR('r4.chart.dlPng', 0, 'Baixar como PNG'), onclick: () => this.exportPNG().catch(e => R4.toast && R4.toast(TR('r4.chart.exportFail', { message: e.message }, 'Não foi possível exportar: ' + e.message))) }));
        }
        if (this.tableButton) {
          this.tblBtn = el('button', { type: 'button', class: 'r4-btn r4-chart-btn', 'aria-pressed': 'false', text: TR('r4.chart.viewTable', 0, 'Ver como tabela'), onclick: () => this.setTableView(!this._table) });
          this.head.append(this.tblBtn);
        }
        root.append(this.head);
      }

      this.stage = el('div', { class: 'r4-chart-stage' });
      this.svg = S('svg', { class: 'r4-chart-svg', role: 'img', focusable: 'false' });
      this.stateEl = el('div', { class: 'r4-chart-state', hidden: true });
      this.stage.append(this.svg, this.stateEl);
      this.legendEl = el('ul', { class: 'r4-chart-legend', hidden: true });
      this.tableWrap = el('div', { class: 'r4-chart-table', hidden: true, tabindex: '0', role: 'region' });
      this.live = el('div', { class: 'r4-sr', role: 'status', 'aria-live': 'polite' });
      root.append(this.stage, this.legendEl, this.tableWrap, this.live);
      this._wire();
      return root;
    },

    afterRender() {
      this._observe();
      const host = this.el.parentNode;   // o title do <r4-chart> viraria um tooltip nativo por cima do nosso
      if (host && host.localName && host.localName.indexOf('r4-') === 0 && host.hasAttribute('title')) host.removeAttribute('title');
      this._m = this._model();
      this._afterModel();
      this._paint(this._m, true);
      if (this.src) this.load();
      else if (this.loading) this._setState('loading');
      if (this.tableView) this.setTableView(true);
    },

    /* ---------- dados ---------- */
    /** Carrega `src` (GET via R4.http); aceita array ou {retorno|data|rows}. */
    async load() {
      if (!this.src) return this;
      const tok = ++this._tok;
      this._setState('loading');
      try {
        const rows = unwrap(await R4.http.get(this.src));
        if (this._dead || tok !== this._tok) return this;
        if (!rows) throw new Error('Resposta inesperada (esperado um array ou {retorno|data|rows}).');
        this._setState(null);
        this.update(rows);
        this.fire('load', this, rows);
      } catch (e) {
        if (this._dead || tok !== this._tok) return this;
        this._setState('error', e);
        this.fire('loaderror', this, e);
      }
      return this;
    },
    reload() { return this.load(); },
    loadData(d) { return this.update(d); },

    /** Troca os dados com transição suave: chart.update([...]) ou update(dados, { y: 'outra' }). */
    update(data, extra) {
      if (extra && typeof extra === 'object') Object.assign(this, extra);
      if (data !== undefined) this.data = unwrap(data) || [];
      if (!this.rendered) return this;
      if (this._state === 'loading' || this._state === 'error') this._setState(null);
      const prev = this._m, next = this._model();
      this._m = next;
      this._afterModel();
      if (!this._tween(prev, next)) this._paint(next, true);
      this.fire('update', this, this.data);
      return this;
    },
    /** Altera opções (type, stacked, format...) e redesenha. */
    setOptions(opts) {
      Object.assign(this, opts || {});
      if (!this.rendered) return this;
      this._hidden.clear();
      this.el.classList.toggle('r4-nogrid', this.grid === false);
      this._m = this._model();
      this._afterModel();
      this._paint(this._m, true);
      return this;
    },
    setLoading(on) { this._setState(on ? 'loading' : null); return this; },
    /** Liga/desliga uma série (ou fatia, pela posição/chave) como na legenda. */
    toggleSeries(key, visible) {
      key = String(key);
      const items = this._items();
      const it = items.find(i => i.key === key);
      if (!it) return this;
      const cur = !this._hidden.has(key), want = visible == null ? !cur : !!visible;
      if (want === cur) return this;
      if (!want && items.filter(i => !this._hidden.has(i.key)).length <= 1) return this;   // nunca esconde a última
      want ? this._hidden.delete(key) : this._hidden.add(key);
      this._m = this._model();
      this._afterModel();
      this._paint(this._m, false);
      this.fire('legendtoggle', this, key, want);
      return this;
    },

    /* ---------- tabela alternativa ---------- */
    setTableView(on) {
      on = !!on;
      this._table = on;
      if (this.tblBtn) { this.tblBtn.textContent = on ? TR('r4.chart.viewChart', 0, 'Ver gráfico') : TR('r4.chart.viewTable', 0, 'Ver como tabela'); this.tblBtn.setAttribute('aria-pressed', on ? 'true' : 'false'); }
      this.stage.hidden = on;
      this.legendEl.hidden = on || !this.legendEl.childNodes.length;
      this.tableWrap.hidden = !on;
      if (on) this._buildTable();
      else if (this._dirty) this._paint(this._m, false);
      return this;
    },

    /* ---------- exportação ---------- */
    /** Texto SVG autônomo (cores resolvidas, título e legenda incluídos). */
    getSVG() { return this._serialize().text; },
    /** data:image/svg+xml com o gráfico atual (síncrono). */
    toDataURL() { return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(this._serialize().text); },
    /** Baixa o gráfico como .svg (download local via URL.createObjectURL). */
    exportSVG(nome) {
      const blob = new Blob([this._serialize().text], { type: 'image/svg+xml;charset=utf-8' });
      this._download(blob, this._fname(nome) + '.svg');
      this.fire('export', this, 'svg');
      return this;
    },
    /** PNG como Blob (SVG → <canvas>). Rejeita se o navegador não suportar ou recusar. */
    toPNGBlob(scale) {
      return new Promise((resolve, reject) => {
        let settled = false;
        const fail = (e, url) => { if (settled) return; settled = true; url && URL.revokeObjectURL(url); this.fire('exporterror', this, e); reject(e); };
        const done = b => { if (settled) return; settled = true; resolve(b); };
        try {
          if (typeof Image === 'undefined' || typeof HTMLCanvasElement === 'undefined' || !HTMLCanvasElement.prototype.toBlob || typeof Blob === 'undefined')
            throw new Error('Este navegador não suporta exportar PNG (precisa de canvas e Blob).');
          const { text, W, H } = this._serialize();
          const url = URL.createObjectURL(new Blob([text], { type: 'image/svg+xml;charset=utf-8' }));
          const img = new Image();
          img.onload = () => {
            try {
              const sc = scale || Math.max(2, window.devicePixelRatio || 1), c = document.createElement('canvas');
              c.width = Math.round(W * sc); c.height = Math.round(H * sc);
              const ctx = c.getContext('2d');
              if (!ctx) throw new Error('canvas indisponível');
              ctx.scale(sc, sc); ctx.drawImage(img, 0, 0, W, H);
              URL.revokeObjectURL(url);
              c.toBlob(b => (b ? done(b) : fail(new Error('O navegador não gerou o PNG.'))), 'image/png');
            } catch (e) { fail(e, url); }
          };
          img.onerror = () => fail(new Error('O navegador não conseguiu rasterizar o SVG.'), url);
          this._later(() => { if (!settled) fail(new Error('Tempo esgotado ao rasterizar o SVG.'), url); }, 10000);
          img.src = url;
        } catch (e) { fail(e); }
      });
    },
    /** Baixa o gráfico como .png. Devolve a Promise do Blob. */
    exportPNG(nome, scale) {
      return this.toPNGBlob(scale).then(b => { this._download(b, this._fname(nome) + '.png'); this.fire('export', this, 'png'); return b; });
    },
    _fname(n) { return String(n || this.title || 'grafico').replace(/[^\w.\-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 80) || 'grafico'; },
    _download(blob, filename) {
      const url = URL.createObjectURL(blob);
      this._urls.add(url);
      const a = el('a', { href: url, download: filename, rel: 'noopener', style: { display: 'none' } });
      document.body.append(a); a.click(); a.remove();
      this._later(() => { URL.revokeObjectURL(url); this._urls.delete(url); }, 1500);
    },
    _later(fn, ms) {
      const t = setTimeout(() => { this._timers.delete(t); fn(); }, ms);
      this._timers.add(t);
      return t;
    },
    _serialize() {
      const svg = this.svg, W = this._W || 560, H = this._H || 280;
      const cs = getComputedStyle(this.el), surface = (cs.getPropertyValue('--r4-panel') || '').trim() || '#ffffff';
      const ink = (cs.color || '#222'), muted = (cs.getPropertyValue('--r4-mut') || '').trim() || '#666';
      const clone = svg.cloneNode(true), src = svg.querySelectorAll('*'), dst = clone.querySelectorAll('*');
      const props = ['fill', 'stroke', 'stroke-width', 'opacity', 'fill-opacity', 'font-size', 'font-weight', 'font-family', 'text-anchor', 'stroke-linejoin', 'stroke-linecap', 'visibility'];
      const drop = [];
      for (let i = 0; i < src.length; i++) {
        if (src[i].classList.contains('r4-hv') && !src[i].classList.contains('r4-vis')) { drop.push(dst[i]); continue; }   // realces do hover
        if (src[i].localName === 'title' || src[i].localName === 'desc') continue;
        const c = getComputedStyle(src[i]);
        props.forEach(p => { const v = c.getPropertyValue(p); if (v) dst[i].style.setProperty(p, v); });
        dst[i].removeAttribute('class');
      }
      drop.forEach(n => n.remove());
      const items = this._items();
      const legend = this._T && this._T.base === 'pie' ? items : (items.length > 1 ? items : []);
      const th = this.title ? 26 : 0;
      let lx = 0, ly = 0;
      const lg = [];
      legend.forEach(it => {
        const lab = it.label + (it.pct != null ? ' ' + it.pct : ''), w = estW(lab) + 28;
        if (lx + w > W && lx > 0) { lx = 0; ly += 18; }
        const swatch = this.legendEl.querySelector('[data-k="' + (window.CSS && CSS.escape ? CSS.escape(it.key) : it.key) + '"] .r4-lg-sw');
        const col = (swatch && getComputedStyle(swatch).backgroundColor) || '#888';
        lg.push({ x: lx, y: ly, col, lab, off: this._hidden.has(it.key) });
        lx += w;
      });
      const lh = lg.length ? ly + 26 : 0, TH = H + th + lh;
      const out = S('svg', { width: W, height: TH, viewBox: '0 0 ' + r2(W) + ' ' + r2(TH) });
      S('rect', { x: 0, y: 0, width: W, height: TH, fill: surface }, out);
      const fam = 'system-ui, "Segoe UI", Roboto, sans-serif';
      if (this.title) { const t = S('text', { x: 4, y: 18, fill: ink, 'font-size': 14, 'font-weight': 700, 'font-family': fam }, out); t.textContent = this.title; }
      clone.setAttribute('x', 0); clone.setAttribute('y', th); clone.setAttribute('width', r2(W)); clone.setAttribute('height', r2(H));
      clone.removeAttribute('class'); clone.removeAttribute('tabindex'); clone.removeAttribute('role');
      out.appendChild(clone);
      lg.forEach(l => {
        const g = S('g', { transform: 'translate(' + r2(l.x + 4) + ',' + r2(th + H + 8 + l.y) + ')', opacity: l.off ? 0.4 : 1 }, out);
        S('rect', { x: 0, y: 2, width: 10, height: 10, rx: 2, fill: l.col }, g);
        const t = S('text', { x: 16, y: 11, fill: muted, 'font-size': 12, 'font-family': fam }, g); t.textContent = l.lab;
      });
      return { text: new XMLSerializer().serializeToString(out), W, H: TH };
    },

    /* ---------- ciclo ---------- */
    _cleanup() {
      this._dead = true;
      this._tok++;
      this._ro && this._ro.disconnect();
      this._onWin && window.removeEventListener('resize', this._onWin);
      this._timers.forEach(clearTimeout); this._timers.clear();
      this._rt && clearTimeout(this._rt);
      this._raf && caf(this._raf); this._rafR && caf(this._rafR);
      this._urls.forEach(u => URL.revokeObjectURL(u)); this._urls.clear();
      this._hideTip();
      this._tip && this._tip.remove();
      this._docDown && document.removeEventListener('pointerdown', this._docDown);
    },
    _observe() {
      const on = () => {
        const w = this._measure();
        if (!this._m || Math.abs(w - this._W) < 1) return;
        clearTimeout(this._rt);
        this._rt = setTimeout(() => {   // debounce + um quadro de animação
          this._rt = 0;
          this._rafR && caf(this._rafR);
          this._rafR = raf(() => { this._rafR = 0; if (!this._dead && this.rendered && !this._tw) this._paint(this._m, false); });
        }, 80);
      };
      if (typeof ResizeObserver !== 'undefined') { this._ro = new ResizeObserver(on); this._ro.observe(this.stage); }
      else { this._onWin = on; window.addEventListener('resize', this._onWin); }
    },
    _measure() {
      const w = this.stage.clientWidth || Math.round(this.stage.getBoundingClientRect().width);
      return w > 0 ? Math.max(40, w) : (this._T && this._T.spark ? 120 : 560);
    },
    _height() {
      const h = parseInt(this.height, 10), T = this._T || typeOf(this);
      return h > 0 ? h : T.spark ? 36 : T.base === 'pie' ? 260 : 280;
    },
    _motion() {
      if (this.animate === false) return false;
      try { return !(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return true; }
    },
    /** Troca de idioma (R4.i18n.set): textos de estado, botões e tabela. */
    relocalize() {
      if (!this.stage) return;
      if (this.tblBtn) this.tblBtn.textContent = this._table ? TR('r4.chart.viewChart', 0, 'Ver gráfico') : TR('r4.chart.viewTable', 0, 'Ver como tabela');
      if (this._state) this._setState(this._state);
      if (this._table && this._m) this._buildTable();
    },
    _setState(kind, err) {
      this._state = kind;
      const st = this.stateEl;
      st.hidden = !kind;
      st.className = 'r4-chart-state' + (kind === 'error' ? ' r4-err' : '');
      st.replaceChildren();
      if (kind === 'loading') st.append(el('div', { class: 'r4-chart-spin' }), el('div', { text: TR('r4.loading', 0, 'Carregando...') }));
      else if (kind === 'error') {
        st.setAttribute('role', 'alert');
        st.append(el('div', { text: this.errorText || TR('r4.chart.loadFail', 0, 'Não foi possível carregar os dados.') }), el('button', { type: 'button', class: 'r4-btn r4-chart-btn', text: TR('r4.retry', 0, 'Tentar novamente'), onclick: () => this.load() }));
      } else if (kind === 'empty') st.append(el('div', { text: this.emptyText || TR('r4.chart.empty', 0, 'Sem dados para exibir.') }));
      kind === 'error' || st.setAttribute('role', 'status');
      this.stage.classList.toggle('r4-is-loading', kind === 'loading');
      this.stage.classList.toggle('r4-is-error', kind === 'error');
      this.stage.classList.toggle('r4-is-empty', kind === 'empty');
      this.stage.setAttribute('aria-busy', kind === 'loading' ? 'true' : 'false');
    },

    /* ---------- modelo (independe do tamanho) ---------- */
    _model() {
      const T = this._T = typeOf(this);
      const raw = Array.isArray(this.data) ? this.data : [];
      const prim = raw.length > 0 && raw.every(r => r === null || typeof r !== 'object');
      const rows = prim ? raw.map((v, i) => ({ x: i + 1, y: v })) : raw.map(r => (r && typeof r === 'object' ? r : {}));
      const sample = rows.find(r => Object.keys(r).length) || {};
      const numLike = v => !isNaN(toNum(v));
      let xKey = prim ? 'x' : String(this.x || '');
      const ycfg = prim ? ['y'] : (Array.isArray(this.y) ? this.y.map(String) : String(this.y || '').split(',')).map(s => s.trim()).filter(Boolean);
      const sers = prim || !Array.isArray(this.series) ? [] : this.series.filter(s => s && typeof s === 'object' && s.key != null && s.key !== '');
      let specs = sers.length ? sers.map(s => ({ key: String(s.key), label: s.label, color: s.color, type: s.type })) : ycfg.map(k => ({ key: k }));
      if (!xKey) {
        const used = new Set(specs.map(s => s.key)), keys = Object.keys(sample);
        xKey = (T.base === 'scatter' ? keys.find(k => !used.has(k)) : keys.find(k => !used.has(k) && !numLike(sample[k]))) || keys.find(k => !used.has(k)) || '';
      }
      if (!specs.length) specs = Object.keys(sample).filter(k => k !== xKey && numLike(sample[k])).slice(0, MAXC).map(k => ({ key: k }));
      const n = rows.length;
      const cats = rows.map((r, i) => (xKey ? r[xKey] : i + 1));
      const fx = String(this.xFormat || 'auto');
      const dates = n > 0 && (fx === 'date' || (fx === 'auto' && cats.slice(0, 20).every(isDate)));
      const multiYear = dates && new Set(cats.filter(isDate).map(v => v.slice(0, 4))).size > 1;
      const label = (i, full) => {
        const v = cats[i];
        if (v == null || v === '') return '';
        if (dates && isDate(v)) {
          try { return R4.util.date(v, full ? { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' } : multiYear ? { day: '2-digit', month: '2-digit', year: '2-digit' } : { day: '2-digit', month: '2-digit' }); } catch (e) { /* cai no texto */ }
        }
        return String(v);
      };
      const fm = makeFmt(this.format);
      this._f = fm.full; this._fa = fm.axis;
      const colorsArr = Array.isArray(this.colors) ? this.colors : [];
      const base = { T, rows, n, cats, xKey, label, dates, empty: false };

      /* --- pizza / rosca --- */
      if (T.base === 'pie') {
        const yk = specs[0] ? specs[0].key : '';
        let items = rows.map((r, i) => ({ key: String(i), label: label(i, false) || ('Item ' + (i + 1)), raw: r[yk], value: Math.max(0, toNum(r[yk]) || 0), row: r, index: i }));
        const cap = parseInt(this.maxSlices, 10);
        if (cap > 1 && items.length > cap) {
          const keep = new Set(items.slice().sort((a, b) => b.value - a.value).slice(0, cap - 1).map(i => i.key));
          const rest = items.filter(i => !keep.has(i.key));
          items = items.filter(i => keep.has(i.key));
          items.push({ key: 'outros', label: 'Outros', raw: null, value: rest.reduce((s, i) => s + i.value, 0), row: null, index: -1, folded: rest.length });
        }
        items.forEach((it, j) => { it.color = it.key === 'outros' ? 'var(--r4-c-other)' : (cssColor(colorsArr[j]) || 'var(--r4-c' + (j % MAXC + 1) + ')'); });
        const total = items.reduce((s, i) => s + (this._hidden.has(i.key) ? 0 : i.value), 0);
        const m = Object.assign(base, { kind: 'pie', slices: items, total, yKey: yk, yLabel: specs[0] ? (specs[0].label != null ? String(specs[0].label) : humanize(yk)) : 'Valor' });
        m.empty = !(total > 0);
        return m;
      }

      /* --- séries cartesianas / dispersão --- */
      const baseKind = T.base === 'bar' ? 'bar' : 'line';
      const series = specs.map((sp, i) => {
        const ty = String(sp.type || '').toLowerCase();
        const kind = T.base === 'scatter' ? 'dot' : (ty === 'bar' ? 'bar' : ty === 'line' || ty === 'area' ? 'line' : baseKind);
        return {
          key: sp.key, idx: i, kind, area: T.area || ty === 'area',
          label: sp.label != null ? String(sp.label) : humanize(sp.key),
          color: cssColor(sp.color) || cssColor(colorsArr[i]) || (i === 0 && cssColor(this.color)) || 'var(--r4-c' + (i % MAXC + 1) + ')',
          vals: rows.map(r => { const v = toNum(r[sp.key]); return isNaN(v) ? null : v; })
        };
      });
      const m = Object.assign(base, { kind: T.base === 'scatter' ? 'scatter' : 'cart', series });
      if (T.base === 'scatter') {
        let xs = cats.map(toNum);
        m.xIsIndex = !xs.some(v => !isNaN(v));
        if (m.xIsIndex) xs = cats.map((_, i) => i + 1);
        m.xv = xs.map(v => (isNaN(v) ? null : v));
        m.order = m.xv.map((v, i) => i).filter(i => m.xv[i] != null).sort((a, b) => m.xv[a] - m.xv[b]);
        m.xName = xKey ? humanize(xKey) : 'x';
      }
      m.stacked = T.stack;
      this._extent(m);
      return m;
    },
    _visible(m) { return m.series.filter(s => !this._hidden.has(s.key)); },
    /** Empilhamento por categoria: positivos para cima, negativos para baixo. */
    _stack(m, vis) {
      const out = new Map(), T = m.T, kind = T.base === 'bar' ? 'bar' : 'line';
      const pos = new Array(m.n).fill(0), neg = new Array(m.n).fill(0);
      vis.forEach(s => {
        const a = [], b = [];
        if (m.stacked && s.kind === kind) {
          for (let i = 0; i < m.n; i++) {
            const v = s.vals[i] == null ? 0 : s.vals[i];
            if (v >= 0) { a.push(pos[i]); pos[i] += v; b.push(pos[i]); } else { a.push(neg[i]); neg[i] += v; b.push(neg[i]); }
          }
          out.set(s.key, { a, b, stk: true });
        } else {
          for (let i = 0; i < m.n; i++) { const v = s.vals[i]; a.push(v == null ? null : 0); b.push(v); }
          out.set(s.key, { a, b, stk: false });
        }
      });
      return out;
    },
    /** Extensão dos dados visíveis (antes da escala "nice"). */
    _extent(m) {
      const vis = this._visible(m);
      let lo = Infinity, hi = -Infinity, hasBar = false, zero = false;
      if (m.kind === 'scatter') {
        vis.forEach(s => { for (let i = 0; i < m.n; i++) { const v = s.vals[i]; if (v != null && m.xv[i] != null) { lo = Math.min(lo, v); hi = Math.max(hi, v); } } });
        let xl = Infinity, xh = -Infinity;
        m.order.forEach(i => { xl = Math.min(xl, m.xv[i]); xh = Math.max(xh, m.xv[i]); });
        m.xext = { lo: xl, hi: xh };
        m.empty = !(isFinite(lo) && isFinite(xl));
      } else {
        const st = this._stack(m, vis);
        vis.forEach(s => {
          const { a, b } = st.get(s.key);
          if (s.kind === 'bar') hasBar = true;
          if (s.kind === 'bar' || m.stacked || s.area) zero = true;
          for (let i = 0; i < m.n; i++) {
            if (b[i] == null) continue;
            lo = Math.min(lo, b[i]); hi = Math.max(hi, b[i]);
            if (s.kind === 'bar' || (m.stacked && s.kind !== 'dot')) { lo = Math.min(lo, a[i]); hi = Math.max(hi, a[i]); }
          }
        });
        m.empty = !isFinite(lo) || !vis.length;
      }
      if (m.empty) { m.ext = null; return; }
      if (m.kind === 'cart') {
        if (zero || hasBar) { lo = Math.min(lo, 0); hi = Math.max(hi, 0); }
        else if (lo > 0 && (hi - lo) >= hi * 0.5) lo = 0;                 // linhas: zoom só quando a variação é pequena
        else if (hi < 0 && (lo - hi) <= lo * 0.5) hi = 0;
      }
      const ymn = toNum(this.yMin), ymx = toNum(this.yMax);
      if (!isNaN(ymn)) lo = ymn;
      if (!isNaN(ymx)) hi = ymx;
      if (lo > hi) { const t = lo; lo = hi; hi = t; }
      m.ext = { lo, hi };
    },
    _scaleFor(m, px, wide) {
      const count = clamp(Math.round(px / (wide ? 80 : 44)) + 1, 3, 9);
      return niceScale(m.ext.lo, m.ext.hi, count);
    },

    /* ---------- tween da atualização ---------- */
    _canTween(a, b) {
      if (!a || !b || a.empty || b.empty || !this._motion() || this._tw) return false;
      if (a.kind !== b.kind || a.T.base !== b.T.base) return false;
      if (b.kind === 'pie') return a.slices.length === b.slices.length && b.slices.length <= 60;
      if (b.kind !== 'cart') return false;
      return a.n === b.n && a.series.length === b.series.length && a.series.every((s, i) => s.key === b.series[i].key && s.kind === b.series[i].kind) && b.n * b.series.length <= 2500;
    },
    _tween(prev, next) {
      if (!this._canTween(prev, next)) return false;
      this._raf && caf(this._raf);
      const t0 = performance.now(), D = 480;
      const ph = Math.max(40, (this._geo && this._geo.h) || this._height() - 40), pw = Math.max(40, (this._geo && this._geo.w) || this._W - 60);
      const horiz = next.T.horizontal;
      const d0 = next.kind === 'cart' ? this._scaleFor(prev, horiz ? pw : ph, horiz) : null, d1 = next.kind === 'cart' ? this._scaleFor(next, horiz ? pw : ph, horiz) : null;
      this._tw = true;
      const step = () => {
        const k = Math.min(1, (performance.now() - t0) / D), e = 1 - Math.pow(1 - k, 3);
        if (this._dead) return;
        if (k >= 1) { this._raf = 0; this._tw = false; this._paint(next, false); return; }
        this._paint(this._mix(prev, next, e, d0, d1), false, true);
        this._raf = raf(step);
      };
      this._raf = raf(step);
      return true;
    },
    _mix(a, b, e, d0, d1) {
      const L = (x, y) => (x == null || y == null ? y : x + (y - x) * e);
      if (b.kind === 'pie') {
        const slices = b.slices.map((s, i) => Object.assign({}, s, { value: L(a.slices[i].value, s.value) }));
        return Object.assign({}, b, { slices, total: slices.reduce((t, s) => t + (this._hidden.has(s.key) ? 0 : s.value), 0) });
      }
      const series = b.series.map((s, i) => Object.assign({}, s, { vals: s.vals.map((v, j) => L(a.series[i].vals[j], v)) }));
      const mn = L(d0.min, d1.min), mx = L(d0.max, d1.max);
      const dom = { min: mn, max: mx, step: d1.step, dec: d1.dec, ticks: d1.ticks.filter(t => t >= mn - 1e-9 && t <= mx + 1e-9) };
      const o = Object.assign({}, b, { series, dom });
      return o;
    },

    /* ---------- pintura ---------- */
    _paint(m, enter, tweening) {
      if (!this.rendered || !m) return;
      if (this.stage.hidden) { this._dirty = true; return; }
      this._dirty = false;
      const T = m.T, W = this._W = this._measure(), H = this._H = this._height();
      if (!tweening) this._hideTip();
      this.stage.style.height = H + 'px';
      const svg = this.svg;
      svg.setAttribute('viewBox', '0 0 ' + r2(W) + ' ' + r2(H));
      svg.setAttribute('height', H);
      svg.setAttribute('width', '100%');
      const frag = document.createDocumentFragment();
      const tid = this.id + '-t', did = this.id + '-d', desc = this._desc || this._describe(m);
      (this._ttl = S('title', { id: tid }, frag)).textContent = desc.short;
      S('desc', { id: did }, frag).textContent = desc.long;
      svg.setAttribute('aria-label', desc.short + '. ' + desc.long);
      this._geo = null;
      if (m.empty) {
        svg.replaceChildren(frag);
        svg.removeAttribute('tabindex');
        if (!this._state || this._state === 'empty') this._setState('empty');
        svg.classList.remove('r4-enter');
        return;
      }
      if (this._state === 'empty') this._setState(null);
      if (m.kind === 'pie') this._drawPie(frag, m, W, H, enter);
      else if (m.kind === 'scatter') this._drawScatter(frag, m, W, H, enter);
      else this._drawCart(frag, m, W, H, enter);
      svg.replaceChildren(frag);
      if (T.spark) svg.removeAttribute('tabindex'); else svg.setAttribute('tabindex', '0');
      if (enter && this._motion() && !tweening) {
        svg.classList.remove('r4-enter');
        svg.classList.toggle('r4-enter-x', !!(m.T.horizontal));
        svg.classList.add('r4-enter');
        this._enterT && clearTimeout(this._enterT);
        this._enterT = this._later(() => svg.classList.remove('r4-enter'), 1000);
      }
    },

    /* ----- barras e linhas ----- */
    _drawCart(frag, m, W, H) {
      const T = m.T, spark = T.spark, vis = this._visible(m);
      const bars = vis.filter(s => s.kind === 'bar'), lines = vis.filter(s => s.kind === 'line');
      const horiz = T.horizontal && bars.length > 0 && !lines.length, band = bars.length > 0, n = m.n;
      const st = this._stack(m, vis), fa = this._fa, ff = this._f;
      const padT = spark ? 4 : 12, padR = spark ? 4 : 14, padB = spark ? 4 : 26;
      let padL = spark ? 4 : 0, dom;
      const catLabels = [];
      if (!horiz) {
        dom = m.dom || this._scaleFor(m, H - padT - padB, false);
        if (!spark) padL = clamp(Math.ceil(Math.max.apply(null, dom.ticks.map(t => estW(fa(t, dom))))) + 12, 28, W * 0.4);
      } else {
        const lim = Math.min(n, 400);
        let mw = 0;
        for (let i = 0; i < lim; i++) mw = Math.max(mw, estW(m.label(i, false)));
        padL = clamp(Math.ceil(mw) + 12, 36, W * 0.38);
        dom = m.dom || this._scaleFor(m, W - padL - padR, true);
      }
      const left = padL, top = padT, w = Math.max(10, W - padL - padR), h = Math.max(10, H - padT - padB);
      const span = dom.max - dom.min || 1;
      const vPx = horiz ? v => left + (v - dom.min) / span * w : v => top + h - (v - dom.min) / span * h;
      const cl = v => clamp(v, dom.min, dom.max);
      const bv = cl(0), eps = span * 1e-9;
      const catStart = horiz ? top : left, catLen = horiz ? h : w;
      let pitch, p0 = 0, pos;
      if (band) { pitch = catLen / Math.max(1, n); pos = i => catStart + (i + 0.5) * pitch; }
      else {
        const pad = spark ? 3 : Math.min(12, catLen / (2 * Math.max(1, n)));
        pitch = n > 1 ? (catLen - 2 * pad) / (n - 1) : 0; p0 = catStart + pad;
        pos = i => (n > 1 ? p0 + i * pitch : catStart + catLen / 2);
      }

      /* grade + eixos */
      if (!spark) {
        const gg = S('g', { class: 'r4-grid-l' }, frag), ax = S('g', { class: 'r4-ax-y' }, frag);
        dom.ticks.forEach(t => {
          if (t < dom.min - eps || t > dom.max + eps) return;
          const p = vPx(t), z = t === 0 && dom.min < 0;
          if (horiz) { S('line', { x1: p, x2: p, y1: top, y2: top + h, class: z ? 'r4-zero' : null }, gg); S('text', { x: p, y: top + h + 17, 'text-anchor': 'middle' }, ax).textContent = fa(t, dom); }
          else { S('line', { x1: left, x2: left + w, y1: p, y2: p, class: z ? 'r4-zero' : null }, gg); S('text', { x: left - 8, y: p, dy: '.32em', 'text-anchor': 'end' }, ax).textContent = fa(t, dom); }
        });
        const gx = S('g', { class: 'r4-ax-x' }, frag);
        if (!horiz) {
          const lim = n > 400 ? 400 : n, k = Math.max(1, Math.floor(n / lim));
          let mw = 0;
          for (let i = 0; i < n; i += k) mw = Math.max(mw, estW(m.label(i, false)));
          const unit = band ? pitch : (pitch || catLen), step = Math.max(1, Math.ceil((mw + 10) / Math.max(1, unit)));
          for (let i = 0; i < n; i += step) {
            const x = pos(i), lab = m.label(i, false), lw = estW(lab);
            let anchor = 'middle';
            if (x - lw / 2 < 1) anchor = 'start'; else if (x + lw / 2 > W - 1) anchor = 'end';
            S('text', { x, y: top + h + 17, 'text-anchor': anchor }, gx).textContent = lab;
          }
        } else {
          const step = Math.max(1, Math.ceil(14 / Math.max(1, pitch))), maxc = Math.max(4, Math.floor((padL - 12) / 6.2));
          for (let i = 0; i < n; i += step) {
            const lab = m.label(i, false), t = S('text', { x: left - 8, y: pos(i), dy: '.32em', 'text-anchor': 'end' }, gx);
            t.textContent = cut(lab, maxc);
            if (lab.length > maxc) S('title', null, t).textContent = lab;
          }
        }
      }

      const plot = S('g', { class: 'r4-plot' }, frag);
      const geo = { kind: 'cart', W, H, left, top, w, h, n, horiz, band, pitch, p0, pos, vis, st, vPx, cl, dom, catEls: [], hdots: [] };
      if (band) geo.hl = S('rect', { class: 'r4-hl r4-hv', x: 0, y: 0, width: 0, height: 0 }, plot);

      /* barras */
      if (bars.length) {
        const gb = S('g', { class: 'r4-bars', style: 'transform-origin:' + (horiz ? r2(vPx(bv)) + 'px 0px' : '0px ' + r2(vPx(bv)) + 'px') }, plot);
        const k = bars.length, stacked = m.stacked;
        const bw = Math.max(1, stacked ? Math.min(MAXBAR + 8, pitch * 0.7) : Math.min(MAXBAR, (pitch * 0.78 - 2 * (k - 1)) / k));
        const gw = stacked ? bw : k * bw + (k - 1) * 2, stride = pitch < 1 ? Math.ceil(1 / Math.max(pitch, 0.01)) : 1;
        for (let i = 0; i < n; i += stride) {
          const gc = S('g', { class: 'r4-cat', 'data-i': i }, gb), c0 = catStart + i * pitch + (pitch - gw) / 2;
          geo.catEls[i] = gc;
          if (stacked) {
            const segs = [];
            bars.forEach(s => { const q = st.get(s.key), a = q.a[i], b = q.b[i]; if (a == null || b == null || a === b) return; segs.push({ s, a: cl(a), b: cl(b), neg: b < 0 || (b === 0 && a < 0) }); });
            const lastIdx = { true: -1, false: -1 };
            segs.forEach((g, j) => { lastIdx[g.neg] = j; });
            segs.forEach((g, j) => {
              let ya = vPx(g.a), yb = vPx(g.b);
              const sg = Math.sign(yb - ya);
              if (g.a !== 0) ya += sg; if (j !== lastIdx[g.neg]) yb -= sg;
              const d = barD(c0, bw, ya, yb, j === lastIdx[g.neg], horiz);
              if (d) S('path', { class: 'r4-bar', d, style: 'fill:' + g.s.color }, gc);
            });
          } else {
            bars.forEach((s, j) => {
              const v = s.vals[i]; if (v == null) return;
              const d = barD(c0 + j * (bw + 2), bw, vPx(bv), vPx(cl(v)), true, horiz);
              if (d) S('path', { class: 'r4-bar', d, style: 'fill:' + s.color }, gc);
            });
          }
        }
      }

      /* áreas e linhas */
      if (lines.length) {
        const smooth = !!this.smooth, maxp = Math.max(50, parseInt(this.maxPoints, 10) || 1500), yBase = vPx(bv);
        const gA = S('g', { class: 'r4-areas' }, plot), gL = S('g', { class: 'r4-lines' }, plot), gD = S('g', { class: 'r4-dots' }, plot);
        lines.forEach(s => {
          const q = st.get(s.key), idxs = sampleIdx(n, s.vals, maxp), runs = [];
          let cur = null, count = 0;
          const add = i => {
            const v = q.b[i];
            if (v == null) { cur = null; return; }
            const pt = { x: pos(i), y: vPx(cl(v)), i, y0: q.stk ? vPx(cl(q.a[i])) : yBase };
            if (!cur) { cur = []; runs.push(cur); }
            cur.push(pt); count++;
          };
          if (idxs) idxs.forEach(add); else for (let i = 0; i < n; i++) add(i);
          const path = r => (smooth ? monoD(r) : lineD(r));
          const lineStr = runs.filter(r => r.length > 1).map(path).join('');
          if (s.area) {
            const ad = runs.filter(r => r.length > 1).map(r => {
              const top1 = path(r);
              if (q.stk) { const rev = r.slice().reverse().map(p => ({ x: p.x, y: p.y0 })); return top1 + path(rev).replace(/^M/, 'L') + 'Z'; }
              return top1 + 'L' + P(r[r.length - 1].x, yBase) + 'L' + P(r[0].x, yBase) + 'Z';
            }).join('');
            if (ad) S('path', { class: 'r4-area', d: ad, style: 'fill:' + s.color }, gA);
          }
          if (lineStr) S('path', { class: 'r4-line', d: lineStr, pathLength: 1, style: 'stroke:' + s.color }, gL);
          const all = this.points !== false && !spark && count <= 40;
          runs.forEach(r => {
            if (all) r.forEach(p => S('circle', { class: 'r4-dot', cx: p.x, cy: p.y, r: 4, style: 'fill:' + s.color }, gD));
            else if (r.length === 1 && !spark) S('circle', { class: 'r4-dot', cx: r[0].x, cy: r[0].y, r: 4, style: 'fill:' + s.color }, gD);
          });
          if (spark && runs.length) { const lr = runs[runs.length - 1], p = lr[lr.length - 1]; S('circle', { class: 'r4-dot', cx: p.x, cy: p.y, r: 3, style: 'fill:' + s.color }, gD); }
        });
        geo.xh = S('line', { class: 'r4-xh r4-hv', x1: 0, x2: 0, y1: top, y2: top + h }, plot);
        lines.forEach(s => { geo.hdots.push({ s, e: S('circle', { class: 'r4-hdot r4-hv', r: 5, cx: 0, cy: 0, style: 'fill:' + s.color }, plot) }); });
      }

      /* hit-testing e navegação por teclado */
      geo.idxAt = (px, py) => {
        if (!n) return -1;
        const along = horiz ? py : px;
        if (along < catStart - 1 || along > catStart + catLen + 1) return -1;
        const i = band ? Math.floor((along - catStart) / Math.max(pitch, 1e-6)) : (n > 1 ? Math.round((along - p0) / Math.max(pitch, 1e-6)) : 0);
        return clamp(i, 0, n - 1);
      };
      geo.step = (i, d) => clamp(i + d, 0, n - 1);
      geo.first = () => 0; geo.last = () => n - 1;
      geo.anchor = i => {
        let best = null;
        vis.forEach(s => { const v = st.get(s.key).b[i]; if (v != null) { const p = vPx(cl(v)); if (best == null || (horiz ? p > best : p < best)) best = p; } });
        if (best == null) best = horiz ? left + w / 2 : top + h / 2;
        return horiz ? { x: best, y: pos(i) } : { x: pos(i), y: best };
      };
      geo.activate = i => {
        this.el.classList.add('r4-hovering');
        if (geo.hl) {
          const c0 = catStart + i * pitch;
          geo.hl.setAttribute('x', r2(horiz ? left : c0)); geo.hl.setAttribute('y', r2(horiz ? c0 : top));
          geo.hl.setAttribute('width', r2(horiz ? w : pitch)); geo.hl.setAttribute('height', r2(horiz ? pitch : h));
          geo.hl.classList.add('r4-vis');
        }
        if (this._onEl) this._onEl.classList.remove('r4-on');
        this._onEl = geo.catEls[i] || null;
        this._onEl && this._onEl.classList.add('r4-on');
        if (geo.xh) {
          const x = pos(i);
          geo.xh.setAttribute('x1', r2(x)); geo.xh.setAttribute('x2', r2(x)); geo.xh.classList.add('r4-vis');
          geo.hdots.forEach(d => {
            const v = st.get(d.s.key).b[i];
            if (v == null) { d.e.classList.remove('r4-vis'); return; }
            d.e.setAttribute('cx', r2(x)); d.e.setAttribute('cy', r2(vPx(cl(v)))); d.e.classList.add('r4-vis');
          });
        }
      };
      geo.reset = () => {
        this.el.classList.remove('r4-hovering');
        geo.hl && geo.hl.classList.remove('r4-vis');
        geo.xh && geo.xh.classList.remove('r4-vis');
        geo.hdots.forEach(d => d.e.classList.remove('r4-vis'));
        if (this._onEl) { this._onEl.classList.remove('r4-on'); this._onEl = null; }
      };
      this._geo = geo;
    },

    /* ----- dispersão ----- */
    _drawScatter(frag, m, W, H) {
      const vis = this._visible(m), fa = this._fa;
      const padT = 12, padR = 16, padB = 28;
      const yd = m.dom || this._scaleFor(m, H - padT - padB, false);
      const padL = clamp(Math.ceil(Math.max.apply(null, yd.ticks.map(t => estW(fa(t, yd))))) + 12, 28, W * 0.4);
      const left = padL, top = padT, w = Math.max(10, W - padL - padR), h = Math.max(10, H - padT - padB);
      const xd = niceScale(m.xext.lo, m.xext.hi, clamp(Math.round(w / 80) + 1, 3, 9));
      const xs = xd.max - xd.min || 1, ys = yd.max - yd.min || 1;
      const xPx = v => left + (v - xd.min) / xs * w, yPx = v => top + h - (v - yd.min) / ys * h;
      const gg = S('g', { class: 'r4-grid-l' }, frag), ax = S('g', { class: 'r4-ax-y' }, frag), gx = S('g', { class: 'r4-ax-x' }, frag);
      yd.ticks.forEach(t => { const p = yPx(t); S('line', { x1: left, x2: left + w, y1: p, y2: p, class: t === 0 && yd.min < 0 ? 'r4-zero' : null }, gg); S('text', { x: left - 8, y: p, dy: '.32em', 'text-anchor': 'end' }, ax).textContent = fa(t, yd); });
      const fx = (v) => (typeof this.format === 'function' || m.xIsIndex ? String(v) : nf(v, { maximumFractionDigits: Math.min(2, xd.dec) }));
      xd.ticks.forEach(t => { const p = xPx(t); S('line', { x1: p, x2: p, y1: top, y2: top + h }, gg); S('text', { x: p, y: top + h + 17, 'text-anchor': 'middle' }, gx).textContent = fx(t); });
      const plot = S('g', { class: 'r4-plot' }, frag);
      const pts = [], gp = S('g', { class: 'r4-pts' }, plot), cap = 5000;
      vis.forEach(s => {
        const idxs = m.order.length > cap ? m.order.filter((_, j) => j % Math.ceil(m.order.length / cap) === 0) : m.order;
        idxs.forEach(i => {
          const v = s.vals[i]; if (v == null) return;
          const x = xPx(m.xv[i]), y = yPx(clamp(v, yd.min, yd.max));
          S('circle', { class: 'r4-pt', cx: x, cy: y, r: 4.5, style: 'fill:' + s.color }, gp);
          pts.push({ x, y, i, s });
        });
      });
      const ring = S('circle', { class: 'r4-hring r4-hv', r: 9, cx: 0, cy: 0 }, plot);
      const geo = { kind: 'scatter', W, H, left, top, w, h, n: m.order.length, pts, ring, dom: yd, hit: null };
      const pos = {};   // i -> primeiro ponto do registro
      pts.forEach(p => { if (!pos[p.i]) pos[p.i] = p; });
      geo.idxAt = (px, py) => {
        let best = null, bd = 28 * 28;
        for (let j = 0; j < pts.length; j++) { const dx = pts[j].x - px, dy = pts[j].y - py, d = dx * dx + dy * dy; if (d < bd) { bd = d; best = pts[j]; } }
        geo.hit = best; return best ? best.i : -1;
      };
      const ord = m.order.filter(i => pos[i]);
      geo.step = (i, d) => { const k = ord.indexOf(i); return ord[clamp((k < 0 ? 0 : k) + d, 0, ord.length - 1)]; };
      geo.first = () => ord[0]; geo.last = () => ord[ord.length - 1];
      geo.n = ord.length;
      geo.anchor = i => { const p = pos[i] || { x: left + w / 2, y: top + h / 2 }; return { x: p.x, y: p.y }; };
      geo.activate = i => {
        const p = geo.hit && geo.hit.i === i ? geo.hit : pos[i];
        if (!p) return;
        this.el.classList.add('r4-hovering-pt');
        ring.setAttribute('cx', r2(p.x)); ring.setAttribute('cy', r2(p.y)); ring.setAttribute('style', 'stroke:' + p.s.color); ring.classList.add('r4-vis');
      };
      geo.reset = () => { this.el.classList.remove('r4-hovering-pt'); ring.classList.remove('r4-vis'); geo.hit = null; };
      this._geo = geo;
    },

    /* ----- pizza / rosca ----- */
    _drawPie(frag, m, W, H) {
      const T = m.T, donut = T.donut;
      const cx = W / 2, cy = H / 2, R = Math.max(10, Math.min(W, H) / 2 - 10);
      const ri = donut ? R * clamp(parseFloat(this.innerRadius) || 0.62, 0.2, 0.9) : 0;
      const g = S('g', { class: 'r4-plot r4-pie' }, frag), els = [];
      let a = -Math.PI / 2;
      const total = m.total;
      m.slices.forEach((s, i) => {
        if (this._hidden.has(s.key) || !(s.value > 0)) { els[i] = null; return; }
        const da = s.value / total * Math.PI * 2, a0 = a, a1 = a + da, mid = (a0 + a1) / 2;
        a = a1;
        const path = S('path', { class: 'r4-slice', 'data-i': i, d: arcD(cx, cy, R, ri, a0, a1), style: 'fill:' + s.color + ';transform-origin:' + r2(cx) + 'px ' + r2(cy) + 'px' }, g);
        path.setAttribute('fill-rule', 'evenodd');
        path.dx = Math.cos(mid) * 6; path.dy = Math.sin(mid) * 6; path.mid = mid;
        els[i] = path;
      });
      let cm, cs;
      if (donut) {
        const sz = clamp(ri * 0.42, 12, 26);
        cm = S('text', { class: 'r4-center-main', x: cx, y: cy, 'text-anchor': 'middle', style: 'font-size:' + r2(sz) + 'px' }, g);
        cs = S('text', { class: 'r4-center-sub', x: cx, y: cy + sz * 0.9, 'text-anchor': 'middle' }, g);
      }
      const base = () => {
        if (!donut) return;
        cm.textContent = String(this.centerText || '').replace('{total}', this._f(total));
        cs.textContent = String(this.centerSub || '');
      };
      base();
      const vis = m.slices.map((s, i) => i).filter(i => els[i]);
      const geo = { kind: 'pie', W, H, n: vis.length, els, dom: null };
      geo.idxAt = (px, py, ev) => {
        const t = ev && ev.target && ev.target.getAttribute && ev.target.getAttribute('data-i');
        return t != null ? +t : -1;
      };
      geo.step = (i, d) => { const k = vis.indexOf(i); return vis[((k < 0 ? 0 : k) + d + vis.length) % vis.length]; };
      geo.first = () => vis[0]; geo.last = () => vis[vis.length - 1];
      geo.anchor = i => { const e = els[i], mid = e ? e.mid : 0; return { x: cx + Math.cos(mid) * R * (donut ? (1 + (ri / R)) / 2 : 0.65), y: cy + Math.sin(mid) * R * (donut ? (1 + (ri / R)) / 2 : 0.65) }; };
      geo.activate = i => {
        this.el.classList.add('r4-hovering');
        if (this._onEl) { this._onEl.classList.remove('r4-on'); this._onEl.style.transform = ''; }
        const e = els[i]; this._onEl = e || null;
        if (e) { e.classList.add('r4-on'); e.style.transform = 'translate(' + r2(e.dx) + 'px,' + r2(e.dy) + 'px)'; }
        if (donut && m.slices[i]) { cm.textContent = this._f(m.slices[i].value); cs.textContent = cut(m.slices[i].label, 18); }
      };
      geo.reset = () => {
        this.el.classList.remove('r4-hovering');
        if (this._onEl) { this._onEl.classList.remove('r4-on'); this._onEl.style.transform = ''; this._onEl = null; }
        base();
      };
      this._geo = geo;
    },

    /* ---------- legenda, acessibilidade, tabela ---------- */
    /** Itens da legenda: séries (≥2) ou fatias. */
    _items() {
      const m = this._m;
      if (!m) return [];
      if (m.kind === 'pie') return m.slices.map(s => ({ key: s.key, label: s.label, color: s.color, pct: this._hidden.has(s.key) || !(m.total > 0) ? '—' : nf(s.value / m.total * 100, { maximumFractionDigits: 1 }) + '%', kind: 'sq' }));
      return m.series.map(s => ({ key: s.key, label: s.label, color: s.color, kind: s.kind === 'line' ? 'line' : 'sq' }));
    },
    _afterModel() {
      const m = this._m;
      this._desc = this._describe(m);
      const items = this._items(), show = this.legend !== false && items.length > (m.kind === 'pie' ? 0 : 1) && !m.empty;
      const act = document.activeElement, keepKey = act && act !== document.body && this.legendEl.contains(act) && act.closest('li') ? act.closest('li').getAttribute('data-k') : null;
      this.legendEl.replaceChildren();
      this.legendEl.hidden = !show || !!this._table;
      if (show) {
        const frag = document.createDocumentFragment();
        items.forEach(it => {
          const on = !this._hidden.has(it.key);
          const btn = el('button', { type: 'button', class: 'r4-lg', 'aria-pressed': on ? 'true' : 'false', title: (on ? 'Ocultar ' : 'Mostrar ') + it.label,
            onclick: () => this.toggleSeries(it.key) }, [
            el('span', { class: 'r4-lg-sw' + (it.kind === 'line' ? ' r4-lg-line' : '') }),
            el('span', { class: 'r4-lg-lab', text: it.label }),
            it.pct != null ? el('span', { class: 'r4-lg-pct', text: it.pct }) : null]);
          btn.firstChild.setAttribute('style', 'background:' + it.color);
          const li = el('li', { 'data-k': it.key }, [btn]);
          frag.append(li);
        });
        this.legendEl.append(frag);
        if (keepKey != null) { const b = [...this.legendEl.querySelectorAll('li')].find(li => li.getAttribute('data-k') === keepKey); b && b.firstChild.focus(); }
      }
      if (this._table) this._buildTable();
      if (m.empty && this._state !== 'loading' && this._state !== 'error') this._setState('empty');
      else if (!m.empty && this._state === 'empty') this._setState(null);
    },
    _describe(m) {
      const T = m.T, f = this._f || (v => String(v));
      const kindName = T.spark ? 'Minigráfico de tendência' : T.base === 'pie' ? (T.donut ? 'Gráfico de rosca' : 'Gráfico de pizza')
        : T.base === 'scatter' ? 'Gráfico de dispersão' : T.base === 'bar' ? (T.horizontal ? 'Gráfico de barras horizontais' : T.stack ? 'Gráfico de barras empilhadas' : 'Gráfico de barras')
          : T.area ? 'Gráfico de área' : 'Gráfico de linhas';
      const custom = this.ariaLabel || (this.domAttrs && this.domAttrs['aria-label']);
      const short = custom ? String(custom) : (this.title ? kindName + ': ' + this.title : kindName);
      if (m.empty) return { short, long: 'Sem dados para exibir.' };
      const parts = [];
      if (m.kind === 'pie') {
        parts.push('Total ' + f(m.total) + '.');
        const act = m.slices.filter(s => !this._hidden.has(s.key) && s.value > 0).slice(0, 6);
        parts.push(act.map(s => s.label + ' ' + nf(s.value / m.total * 100, { maximumFractionDigits: 1 }) + '%').join(', ') + (m.slices.length > act.length ? ' e outros.' : '.'));
      } else {
        const n = m.n;
        if (m.kind === 'cart') parts.push(n + (n === 1 ? ' ponto' : ' pontos') + (n > 1 ? ', de ' + m.label(0, true) + ' a ' + m.label(n - 1, true) : (m.label(0, true) ? ': ' + m.label(0, true) : '')) + '.');
        else parts.push(m.order.length + ' pontos.');
        const vs = this._visible(m);
        vs.slice(0, 4).forEach(s => {
          const v = s.vals.filter(x => x != null);
          if (!v.length) { parts.push(s.label + ': sem valores.'); return; }
          parts.push(s.label + ': mínimo ' + f(Math.min.apply(null, v)) + ', máximo ' + f(Math.max.apply(null, v)) + ', último ' + f(v[v.length - 1]) + '.');
        });
        if (vs.length > 4) parts.push('E mais ' + (vs.length - 4) + ' séries.');
      }
      return { short, long: parts.join(' ') };
    },
    _buildTable() {
      const m = this._m, f = this._f, w = this.tableWrap;
      w.replaceChildren();
      w.setAttribute('aria-label', TR('r4.chart.tableLabel', 0, 'Dados do gráfico em tabela') + (this.title ? ': ' + this.title : ''));
      if (!m || m.empty) { w.append(el('div', { class: 'r4-chart-note', text: this.emptyText || TR('r4.chart.empty', 0, 'Sem dados para exibir.') })); return; }
      const tb = el('table', { class: 'r4-table r4-striped' }), th = el('tr'), body = el('tbody');
      tb.append(el('caption', { class: 'r4-sr', text: this._desc.short }), el('thead', {}, [th]), body);
      const row = (cells, nums) => body.append(el('tr', {}, cells.map((c, i) => el('td', { class: nums[i] ? 'r4-num' : '', text: c }))));
      const head = (cols) => cols.forEach((c, i) => th.append(el('th', { class: c[1] ? 'r4-num' : '', scope: 'col', text: c[0] })));
      let total = 0, shown = 0;
      if (m.kind === 'pie') {
        head([[TR('r4.chart.item', 0, 'Item')], [m.yLabel, 1], [TR('r4.chart.share', 0, 'Participação'), 1]]);
        m.slices.forEach(s => {
          total++; if (shown >= TABLE_ROWS) return; shown++;
          const hid = this._hidden.has(s.key);
          row([s.label + (hid ? TR('r4.chart.hidden', 0, ' (oculto)') : ''), isFinite(toNum(s.raw)) || s.folded ? f(s.value) : (s.raw == null || s.raw === '' ? '—' : String(s.raw)), hid || !(m.total > 0) ? '—' : nf(s.value / m.total * 100, { maximumFractionDigits: 1 }) + '%'], [0, 1, 1]);
        });
      } else {
        const vs = m.series;
        head([[m.kind === 'scatter' ? m.xName : (m.xKey ? humanize(m.xKey) : TR('r4.chart.item', 0, 'Item'))]].concat(vs.map(s => [s.label + (this._hidden.has(s.key) ? TR('r4.chart.hiddenF', 0, ' (oculta)') : ''), 1])));
        for (let i = 0; i < m.n; i++) {
          total++; if (shown >= TABLE_ROWS) continue; shown++;
          row([m.kind === 'scatter' ? (m.xv[i] == null ? '—' : String(m.xv[i])) : m.label(i, true)].concat(vs.map(s => (s.vals[i] == null ? '—' : f(s.vals[i])))), [0].concat(vs.map(() => 1)));
        }
      }
      w.append(tb);
      if (total > shown) w.append(el('div', { class: 'r4-chart-note', text: TR('r4.chart.rows', { shown, total }, 'Mostrando ' + shown + ' de ' + total + ' linhas.') }));
    },

    /* ---------- tooltip ---------- */
    _tipData(i) {
      const m = this._m, f = this._f;
      if (!m) return null;
      if (m.kind === 'pie') {
        const s = m.slices[i]; if (!s) return null;
        return { title: '', rows: [{ color: s.color, sq: true, value: f(s.value), label: s.label + ' · ' + nf(m.total > 0 ? s.value / m.total * 100 : 0, { maximumFractionDigits: 1 }) + '%' }] };
      }
      const vs = this._visible(m);
      const rows = vs.map(s => ({ color: s.color, sq: s.kind !== 'line', value: s.vals[i] == null ? '—' : f(s.vals[i]), label: s.label }));
      const d = { title: m.kind === 'scatter' ? m.xName + ': ' + (m.xv[i] == null ? '—' : (m.xIsIndex ? String(m.xv[i]) : nf(m.xv[i], { maximumFractionDigits: 4 }))) : m.label(i, true), rows };
      if (m.stacked && vs.filter(s => s.kind === 'bar').length > 1) d.total = f(vs.filter(s => s.kind === 'bar').reduce((t, s) => t + (s.vals[i] || 0), 0));
      return d;
    },
    _showTip(d, cx, cy) {
      if (!this.tooltip || !d) return;
      const key = JSON.stringify(d);
      let t = this._tip;
      if (!t) { t = this._tip = el('div', { class: 'r4-chart-tip', role: 'tooltip', id: this.id + '-tip' }); }
      if (!t.isConnected) document.body.append(t);
      if (key !== this._tipKey) {
        this._tipKey = key;
        const frag = document.createDocumentFragment();
        if (d.title) frag.append(el('div', { class: 'r4-tt-title', text: d.title }));
        d.rows.forEach(r => {
          const k = el('span', { class: 'r4-tt-key' + (r.sq ? ' r4-sq' : '') });
          k.setAttribute('style', 'background:' + r.color);
          frag.append(el('div', { class: 'r4-tt-row' }, [k, el('span', { class: 'r4-tt-val', text: r.value }), el('span', { class: 'r4-tt-lab', text: r.label })]));
        });
        if (d.total != null) frag.append(el('div', { class: 'r4-tt-row r4-tt-total' }, [el('span', { class: 'r4-tt-key', style: { background: 'transparent' } }), el('span', { class: 'r4-tt-val', text: d.total }), el('span', { class: 'r4-tt-lab', text: TR('r4.grid.total', 0, 'Total') })]));
        t.replaceChildren(frag);
      }
      this._placeTip(cx, cy);
      if (this._ttl) this._ttl.textContent = '';
      if (!this._docDown) this._docDown = ev => { if (!this.svg.contains(ev.target)) this._hideTip(); };
      document.addEventListener('pointerdown', this._docDown);
      this.live.textContent = (d.title ? d.title + ': ' : '') + d.rows.map(r => r.label + ' ' + r.value).join('; ') + (d.total != null ? '; Total ' + d.total : '');
    },
    _placeTip(cx, cy) {
      const t = this._tip;
      if (!t || !t.isConnected) return;
      const vw = document.documentElement.clientWidth || window.innerWidth || 1024, vh = window.innerHeight || document.documentElement.clientHeight || 768;
      const w = t.offsetWidth || 170, h = t.offsetHeight || 60, gap = 14, mg = 8;
      let x = cx + gap;
      if (x + w > vw - mg) x = cx - gap - w;
      x = clamp(x, mg, Math.max(mg, vw - w - mg));
      const y = clamp(cy - h / 2, mg, Math.max(mg, vh - h - mg));
      t.style.left = r2(x) + 'px'; t.style.top = r2(y) + 'px';
    },
    _hideTip() {
      if (this._geo && this._geo.reset && this._idx >= 0) this._geo.reset();
      this._idx = -1; this._tipKey = '';
      if (this._ttl && this._desc && !this._ttl.textContent) this._ttl.textContent = this._desc.short;   // devolve o <title> (some durante o tooltip para não duplicar o nativo)
      if (this._tip && this._tip.isConnected) this._tip.remove();
      if (this._docDown) document.removeEventListener('pointerdown', this._docDown);
    },
    _hover(i, cx, cy) {
      const g = this._geo;
      if (!g || i < 0) return this._hideTip();
      if (i !== this._idx || (g.kind === 'scatter')) { if (this._idx >= 0 && g.reset) g.reset(); g.activate(i); this._idx = i; }
      this._showTip(this._tipData(i), cx, cy);
    },
    _clientOf(pt) {
      const rc = this.svg.getBoundingClientRect(), k = rc.width > 0 && this._W ? rc.width / this._W : 1;
      return { x: rc.left + pt.x * k, y: rc.top + pt.y * k };
    },
    _wire() {
      const svg = this.svg;
      const move = ev => {
        const g = this._geo;
        if (!g || !this._m || this._m.empty || this._tw) return;
        const rc = svg.getBoundingClientRect(), k = rc.width > 0 && this._W ? this._W / rc.width : 1;
        const i = g.idxAt((ev.clientX - rc.left) * k, (ev.clientY - rc.top) * k, ev);
        if (i < 0) { this._hideTip(); return; }
        this._hover(i, ev.clientX, ev.clientY);
      };
      svg.addEventListener('pointermove', move);
      svg.addEventListener('pointerdown', ev => { this._ptr = true; this._later(() => { this._ptr = false; }, 0); if (ev.pointerType === 'touch') move(ev); });
      svg.addEventListener('pointerleave', ev => { if (ev.pointerType !== 'touch') this._hideTip(); });
      svg.addEventListener('click', ev => {
        const g = this._geo; if (!g || !this._m || this._m.empty) return;
        const rc = svg.getBoundingClientRect(), k = rc.width > 0 && this._W ? this._W / rc.width : 1;
        const i = g.idxAt((ev.clientX - rc.left) * k, (ev.clientY - rc.top) * k, ev);
        if (i >= 0) this._pointClick(i);
      });
      svg.addEventListener('focus', () => {
        const g = this._geo;
        if (!this._ptr && g && g.n && this._idx < 0 && this._m && !this._m.empty) this._focusAt(g.first());
        this._ptr = false;
      });
      svg.addEventListener('blur', () => { this._ptr = false; this._hideTip(); });
      svg.addEventListener('keydown', ev => {
        const g = this._geo, k = ev.key;
        if (!g || !g.n || !this._m || this._m.empty) return;
        let i = this._idx;
        if (k === 'ArrowRight' || k === 'ArrowDown') i = i < 0 ? g.first() : g.step(i, 1);
        else if (k === 'ArrowLeft' || k === 'ArrowUp') i = i < 0 ? g.first() : g.step(i, -1);
        else if (k === 'Home') i = g.first();
        else if (k === 'End') i = g.last();
        else if (k === 'Escape') { this._hideTip(); return; }
        else if ((k === 'Enter' || k === ' ') && i >= 0) { ev.preventDefault(); this._pointClick(i); return; }
        else return;
        ev.preventDefault();
        this._focusAt(i);
      });
    },
    _focusAt(i) {
      const g = this._geo;
      if (!g || i == null || i < 0) return;
      const c = this._clientOf(g.anchor(i));
      if (this._idx >= 0 && g.reset) g.reset();
      g.activate(i); this._idx = i;
      this._showTip(this._tipData(i), c.x, c.y);
    },
    _pointClick(i) {
      const m = this._m;
      const info = m.kind === 'pie' ? { index: i, row: m.slices[i] && m.slices[i].row, label: m.slices[i] && m.slices[i].label, value: m.slices[i] && m.slices[i].value }
        : { index: i, row: m.rows[i], label: m.label(i, false) };
      this.fire('pointclick', this, info);
    }
  }, {
    title: 'chart', group: 'Gráficos',
    description: 'Gráficos em SVG puro: barras (agrupadas, empilhadas, horizontais), linhas (suave, área), pizza, rosca, dispersão e sparkline. Eixos com escala 1-2-5, legenda clicável, tooltip por mouse/toque/teclado, animação, responsivo, tabela alternativa e exportação SVG/PNG. Cores: variáveis --r4-c1…--r4-c8 (claro/escuro). Limite: linhas com mais de maxPoints pontos são decimadas (testado com 10.000).',
    props: [
      { name: 'type', type: "'bar'|'line'|'area'|'pie'|'donut'|'scatter'|'sparkline'", default: "'bar'", desc: 'Tipo do gráfico. Cada série pode ter type próprio ("bar" ou "line") para combinar barras e linhas.' },
      { name: 'data', type: 'Array<object|number>', default: '[]', desc: 'Linhas de dados. Um array de números vira x = 1, 2, 3… e uma única série.' },
      { name: 'x', type: 'string', default: "''", desc: 'Chave do rótulo/eixo X. Vazio = primeira chave não numérica. Datas "AAAA-MM-DD" saem em pt-BR (dd/mm) com rótulos ralos.' },
      { name: 'y', type: 'string | string[]', default: "''", desc: 'Uma ou várias chaves de valor: y="receita,despesa" no HTML ou ["receita","despesa"] no JS. Vazio = chaves numéricas. Pizza/rosca usa a primeira.' },
      { name: 'series', type: 'Array<{key,label,color,type}>', default: '[]', desc: 'Define rótulo, cor e tipo de cada série. Se informado, tem prioridade sobre y. No HTML: filhos <r4-series key label color type>.' },
      { name: 'src', type: 'string', default: "''", desc: 'URL (GET via R4.http). Aceita array ou {retorno|data|rows}. Mostra carregando e erro (com "Tentar novamente").' },
      { name: 'title', type: 'string', default: "''", desc: 'Título (também usado na descrição acessível e no nome dos arquivos exportados).' },
      { name: 'format', type: "'number'|'money'|'percent'|'bytes'|function", default: "'number'", desc: 'Formato dos valores (eixo, tooltip e tabela), usando R4.util. percent espera o valor já em % (3,8 → 3,8%).' },
      { name: 'xFormat', type: "'auto'|'date'|'text'", default: "'auto'", desc: 'auto reconhece datas ISO no eixo X.' },
      { name: 'height / width', type: 'number', default: '0', desc: 'Altura em px (0 = automática: 280, pizza 260, sparkline 36). width em px só para uso inline (0 = 100%).' },
      { name: 'stacked', type: 'boolean', default: 'false', desc: 'Empilha barras (ou áreas, com type="area"). Valores negativos empilham para baixo.' },
      { name: 'horizontal', type: 'boolean', default: 'false', desc: 'Barras horizontais.' },
      { name: 'smooth', type: 'boolean', default: 'false', desc: 'Linhas suavizadas (spline monótona, sem picos falsos).' },
      { name: 'area', type: 'boolean', default: 'false', desc: 'Preenche sob a linha (equivale a type="area").' },
      { name: 'points', type: 'boolean', default: 'true', desc: 'Marcadores nas linhas (só até 40 pontos por série).' },
      { name: 'legend / tooltip / animate / grid', type: 'boolean', default: 'true', desc: 'Legenda clicável (some com 1 série), tooltip, animação de entrada (respeita prefers-reduced-motion), grade.' },
      { name: 'color / colors', type: 'string / string[]', default: "'' / []", desc: 'Cor da 1ª série / cores por série ou fatia. Padrão: var(--r4-c1…c8). Aceita cor CSS simples.' },
      { name: 'innerRadius', type: 'number', default: '0.62', desc: 'Espessura da rosca (fração do raio).' },
      { name: 'centerText / centerSub', type: 'string', default: "''", desc: 'Texto central da rosca. {total} vira o total formatado. Ao passar o mouse na fatia mostra o valor dela.' },
      { name: 'yMin / yMax', type: 'number', default: 'null', desc: 'Limites do eixo de valores.' },
      { name: 'maxPoints', type: 'number', default: '1500', desc: 'Acima disso as linhas são decimadas (mínimo/máximo por trecho).' },
      { name: 'maxSlices', type: 'number', default: '8', desc: 'Pizza com mais fatias agrupa as menores em "Outros" (0 = não agrupa).' },
      { name: 'tableButton / tableView', type: 'boolean', default: 'true / false', desc: 'Botão "Ver como tabela" (alternativa acessível) e estado inicial.' },
      { name: 'exportButtons', type: 'boolean', default: 'false', desc: 'Mostra os botões SVG e PNG.' },
      { name: 'emptyText / errorText / loading', type: 'string / string / boolean', default: "'' / '' / false", desc: 'Textos dos estados vazio e erro (vazios = padrão no idioma atual); loading força o estado carregando.' },
      { name: 'update(dados[, opções])', type: 'método', desc: 'Troca os dados com transição suave. Devolve o componente.' },
      { name: 'load() / reload()', type: 'método', desc: 'Busca src de novo.' },
      { name: 'setOptions(opts)', type: 'método', desc: 'Muda type, stacked, format... e redesenha.' },
      { name: 'toggleSeries(chave[, visível])', type: 'método', desc: 'Liga/desliga série ou fatia (a última visível não desliga).' },
      { name: 'setTableView(bool)', type: 'método', desc: 'Alterna entre gráfico e tabela.' },
      { name: 'exportSVG(nome) / exportPNG(nome)', type: 'método', desc: 'Baixa o arquivo (URL.createObjectURL). exportPNG devolve Promise e exige canvas.toBlob; falhas rejeitam e disparam exporterror.' },
      { name: 'getSVG() / toDataURL() / toPNGBlob()', type: 'método', desc: 'SVG autônomo como texto, data URL do SVG, e Promise<Blob> do PNG.' }
    ],
    events: ['render', 'load', 'loaderror', 'update', 'legendtoggle', 'pointclick', 'export', 'exporterror', 'destroy']
  });

  /* ============================================================
   * sparkline: mini gráfico sem eixos (cartões, tabelas)
   * ============================================================ */
  R4.define('sparkline', {
    extend: 'chart',
    config: { type: 'sparkline', legend: false, tableButton: false, points: false, grid: false }
  }, {
    title: 'sparkline', group: 'Gráficos',
    description: 'Mini gráfico de tendência sem eixos, para cartões e tabelas. Aceita array de números ou de objetos (y = chave). Mesmas opções do chart (area, smooth, color, series com type "bar" para minibarras). Passar o mouse mostra o valor.',
    props: [
      { name: 'data', type: 'Array<number|object>', default: '[]', desc: '[3,5,4,8] ou linhas com y="chave".' },
      { name: 'x / y', type: 'string', default: "''", desc: 'Chaves quando data é array de objetos.' },
      { name: 'area / smooth', type: 'boolean', default: 'false', desc: 'Área preenchida e curva suave.' },
      { name: 'color', type: 'string', default: "''", desc: 'Cor da linha (padrão var(--r4-c1)).' },
      { name: 'width / height', type: 'number', default: '0', desc: 'Tamanho em px (padrão: largura do contêiner × 36).' },
      { name: 'format', type: "'number'|'money'|'percent'|'bytes'", default: "'number'", desc: 'Formato do valor no tooltip.' }
    ],
    events: ['render', 'update', 'destroy']
  });

  /* ---------- atalhos: R4.chart(alvo, dados, extra) / R4.sparkline(alvo, dados, extra) ---------- */
  const plain = v => v && typeof v === 'object' && !Array.isArray(v) && !v.nodeType;
  const quick = (a, b) => (plain(a) ? a : Array.isArray(a) ? Object.assign({ data: a }, b) : typeof a === 'string' ? Object.assign({ src: a }, b) : Object.assign({}, b));
  R4.quickMap.chart = quick;
  R4.quickMap.sparkline = quick;

  /* ---------- HTML: <r4-chart> com filhos <r4-series key label color type> ---------- */
  const fromTag = (host, cfg) => {
    const sers = [...host.children].filter(k => k.localName === 'r4-series').map(k => {
      const s = { key: k.getAttribute('key') || '', label: k.getAttribute('label') || undefined, color: k.getAttribute('color') || undefined, type: k.getAttribute('type') || undefined };
      return s;
    }).filter(s => s.key);
    if (sers.length) cfg.series = sers;
    return cfg;
  };
  R4.declare('chart', fromTag);
  R4.declare('sparkline', fromTag);
  R4.structural('r4-series');

  /* ---------- playground da vitrine ---------- */
  R4.registry.chart.meta.playground = {
    html: '<r4-chart{attrs} src="/showcase/vitrineData/vendas-mensais.json" x="mes" y="receita,despesa"></r4-chart>',
    cfg: { src: '/showcase/vitrineData/vendas-mensais.json', x: 'mes', y: 'receita,despesa' },
    controls: {
      type: ['bar', 'line', 'area', 'pie', 'donut', 'scatter'], title: 'Vendas mensais', format: ['money', 'number', 'percent', 'bytes'],
      stacked: false, horizontal: false, smooth: false, area: false, points: true, legend: true, animate: true, grid: true, tooltip: true,
      tableButton: true, exportButtons: false, height: 280, centerText: ''
    }
  };
  R4.registry.sparkline.meta.playground = {
    html: '<r4-sparkline{attrs} data="[12,18,9,22,17,30,26,34,28,40]"></r4-sparkline>',
    cfg: { data: [12, 18, 9, 22, 17, 30, 26, 34, 28, 40] },
    controls: { area: true, smooth: true, color: '', format: ['number', 'money', 'percent'], height: 48, width: 160 }
  };
})(window.R4);
