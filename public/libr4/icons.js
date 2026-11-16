/**
 * ============================================
 * libr4 / icons.js  —  R4 dev
 * ============================================
 * Conjunto próprio de ícones SVG (24x24, traço 2, herdam a cor do texto).
 *
 *   R4.icon('edit')                          → elemento <svg> (aria-hidden)
 *   R4.icon('trash', { size: 20, title: 'Excluir', cls: 'minha-classe' })
 *   R4.icon.has('edit') · R4.icon.names · R4.icon.add('meu', 'M4 4h16v16H4z')
 *   <r4-icon name="edit" size="20"></r4-icon>      ·   icon="edit" em button, dropdown, stat, alert...
 *
 * Segurança: o SVG é montado com createElementNS a partir de um mapa fixo nome → dados de path
 * (allowlist). O nome nunca vira markup: nome desconhecido devolve um círculo neutro + aviso.
 * R4.icon.add só aceita path com [MmLlHhVvCcSsQqTtAaZz0-9 .,-] e até 2000 caracteres.
 * R4.icon.fill(elemento, valor): valor é nome de ícone → SVG; qualquer outro texto/emoji → texto.
 * ============================================
 */
(function (R4) {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  // dados: 'traço' ou 'traço*preenchido' (a parte depois do * é preenchida com a cor atual)
  const D = {
    plus: 'M12 5v14M5 12h14',
    minus: 'M5 12h14',
    edit: 'M4 20v-4L15 5l4 4L8 20zM13 7l4 4',
    trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
    copy: 'M9 9h11v11H9zM15 9V4H4v11h5',
    save: 'M5 4h11l3 3v13H5zM8 4v5h7V4M8 20v-6h8v6',
    download: 'M12 4v11M7 10l5 5 5-5M5 20h14',
    upload: 'M12 16V4M7 9l5-5 5 5M5 20h14',
    refresh: 'M20 12a8 8 0 1 1-2.5-5.8M20 4v5h-5',
    search: 'M11 4a7 7 0 1 0 0 14 7 7 0 1 0 0-14zM16 16l4 4',
    filter: 'M4 5h16l-6 8v6l-4-2v-4z',
    close: 'M6 6l12 12M18 6L6 18',
    check: 'M5 12.5l4.5 4.5L19 7.5',
    'x-circle': 'M12 3a9 9 0 1 0 0 18 9 9 0 1 0 0-18zM9 9l6 6M15 9l-6 6',
    menu: 'M4 6h16M4 12h16M4 18h16',
    more: '*M4 12a1 1 0 1 0 2 0 1 1 0 1 0-2 0zM11 12a1 1 0 1 0 2 0 1 1 0 1 0-2 0zM18 12a1 1 0 1 0 2 0 1 1 0 1 0-2 0z',
    settings: 'M9.3 5.5l.8-2.8h3.8l.8 2.8 2.5-1.4 2.7 2.7-1.4 2.5 2.8.8v3.8l-2.8.8 1.4 2.5-2.7 2.7-2.5-1.4-.8 2.8h-3.8l-.8-2.8-2.5 1.4-2.7-2.7 1.4-2.5-2.8-.8v-3.8l2.8-.8-1.4-2.5 2.7-2.7zM12 9a3 3 0 1 0 0 6 3 3 0 1 0 0-6z',
    link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
    external: 'M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5',
    print: 'M7 9V4h10v5M7 17H5v-7h14v7h-2M7 14h10v6H7z',
    eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 1 0 0-5z',
    'eye-off': 'M3 3l18 18M10.6 5.1A9.7 9.7 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4M6.6 6.6A16.6 16.6 0 0 0 2 12s3.5 7 10 7a9.6 9.6 0 0 0 4.2-1M9.9 9.9a2.5 2.5 0 0 0 3.5 3.5',
    lock: 'M6 11h12v9H6zM8 11V8a4 4 0 0 1 8 0v3M12 15v2',
    unlock: 'M6 11h12v9H6zM8 11V8a4 4 0 0 1 7.5-2M12 15v2',
    undo: 'M4 9h10a5 5 0 0 1 0 10H9M8 5L4 9l4 4',
    list: 'M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01',
    code: 'M8 7l-5 5 5 5M16 7l5 5-5 5M14 4l-4 16',
    'arrow-up': 'M12 19V5M6 11l6-6 6 6',
    'arrow-down': 'M12 5v14M6 13l6 6 6-6',
    'arrow-left': 'M19 12H5M11 6l-6 6 6 6',
    'arrow-right': 'M5 12h14M13 6l6 6-6 6',
    'chevron-up': 'M6 15l6-6 6 6',
    'chevron-down': 'M6 9l6 6 6-6',
    'chevron-left': 'M15 6l-6 6 6 6',
    'chevron-right': 'M9 6l6 6-6 6',
    'caret-up': '*M7 14l5-6 5 6z',
    'caret-down': '*M7 10l5 6 5-6z',
    'caret-right': '*M10 7l6 5-6 5z',
    info: 'M12 3a9 9 0 1 0 0 18 9 9 0 1 0 0-18zM12 11v5M12 8h.01',
    warning: 'M12 4l9 16H3zM12 10v4M12 17h.01',
    error: 'M8.5 3h7L21 8.5v7L15.5 21h-7L3 15.5v-7zM12 8v5M12 16h.01',
    success: 'M12 3a9 9 0 1 0 0 18 9 9 0 1 0 0-18zM8 12.5l3 3 5-6',
    help: 'M12 3a9 9 0 1 0 0 18 9 9 0 1 0 0-18zM9.5 9.5a2.5 2.5 0 0 1 5 0c0 1.6-2.5 2-2.5 3.8M12 17h.01',
    bell: 'M6 16v-5a6 6 0 0 1 12 0v5l2 2H4zM10 21h4',
    star: 'M12 3l2.7 5.8 6.3.8-4.6 4.4 1.2 6.3-5.6-3.1-5.6 3.1 1.2-6.3L3 9.6l6.3-.8z',
    'star-fill': '*M12 3l2.7 5.8 6.3.8-4.6 4.4 1.2 6.3-5.6-3.1-5.6 3.1 1.2-6.3L3 9.6l6.3-.8z',
    heart: 'M12 20s-8-5-8-11a4.5 4.5 0 0 1 8-2.7A4.5 4.5 0 0 1 20 9c0 6-8 11-8 11z',
    flag: 'M5 21V4M5 4h12l-2 4 2 4H5',
    dot: '*M12 9a3 3 0 1 0 0 6 3 3 0 1 0 0-6z',
    square: '*M7 7h10v10H7z',
    user: 'M12 4a4 4 0 1 0 0 8 4 4 0 1 0 0-8zM4 20c0-4 3.5-6 8-6s8 2 8 6',
    users: 'M9 5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 1 0 0-7zM2.5 20c0-3.5 3-5.5 6.5-5.5s6.5 2 6.5 5.5M16 5.3a3.5 3.5 0 0 1 0 6.4M17.5 14.7c2.5.6 4 2.4 4 5.3',
    home: 'M4 11l8-7 8 7M6 10v10h12V10M10 20v-6h4v6',
    mail: 'M3 6h18v12H3zM3 7l9 7 9-7',
    calendar: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
    clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 1 0 0-18zM12 7v5l3 2',
    file: 'M6 3h8l5 5v13H6zM14 3v5h5',
    folder: 'M3 6h6l2 2h10v11H3z',
    image: 'M3 5h18v14H3zM3 16l5-5 4 4 3-3 6 6M8.5 9h.01',
    'chart-bar': 'M4 20h16M7 20v-7M12 20V5M17 20V10',
    'chart-line': 'M3 4v16h18M6 15l4-5 3 3 6-7',
    'chart-pie': 'M11 3.2A9 9 0 1 0 20.8 13H11zM14 3.5A9 9 0 0 1 20.5 10H14z',
    table: 'M3 5h18v14H3zM3 10h18M3 15h18M9 5v14',
    grid: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z',
    cart: 'M3 4h2.5l2 11h10l2-8H7M9 20h.01M17 20h.01',
    tag: 'M3 12V4h8l10 10-8 8zM7.5 8h.01',
    key: 'M8 11a4 4 0 1 0 0 8 4 4 0 1 0 0-8zM11 13l9-9M17 7l3 3',
    shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6zM9 12l2 2 4-4',
    globe: 'M12 3a9 9 0 1 0 0 18 9 9 0 1 0 0-18zM3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18',
    sun: 'M12 8a4 4 0 1 0 0 8 4 4 0 1 0 0-8zM12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.4 1.4M17.6 17.6L19 19M5 19l1.4-1.4M17.6 6.4L19 5',
    moon: 'M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z',
    contrast: 'M12 3a9 9 0 1 0 0 18 9 9 0 1 0 0-18z*M12 3a9 9 0 0 0 0 18z',
    play: '*M7 4l13 8-13 8z',
    pause: '*M7 4h3v16H7zM14 4h3v16h-3z',
    sort: 'M8 5v14M4 9l4-4 4 4M16 19V5M12 15l4 4 4-4',
    drag: '*M8 6a1 1 0 1 0 2 0 1 1 0 1 0-2 0zM14 6a1 1 0 1 0 2 0 1 1 0 1 0-2 0zM8 12a1 1 0 1 0 2 0 1 1 0 1 0-2 0zM14 12a1 1 0 1 0 2 0 1 1 0 1 0-2 0zM8 18a1 1 0 1 0 2 0 1 1 0 1 0-2 0zM14 18a1 1 0 1 0 2 0 1 1 0 1 0-2 0z',
    inbox: 'M3 13l3-8h12l3 8v6H3zM3 13h5l1 3h6l1-3h5',
    dollar: 'M12 3v18M16.5 7.5C15.5 6.5 14 6 12 6c-2.5 0-4.5 1-4.5 3s2 2.6 4.5 3 4.5 1 4.5 3-2 3-4.5 3c-2 0-3.5-.6-4.5-1.5',
    message: 'M4 5h16v11H10l-4 4v-4H4z',
    pin: 'M12 21s-6-6-6-11a6 6 0 0 1 12 0c0 5-6 11-6 11zM12 8a2 2 0 1 0 0 4 2 2 0 1 0 0-4z',
    bolt: 'M13 3L5 13.5h6L10 21l8-10.5h-6z'
  };
  const MAP = Object.assign(Object.create(null), D);
  const FALLBACK = 'M12 3a9 9 0 1 0 0 18 9 9 0 1 0 0-18z';   // círculo neutro (nome desconhecido)
  const CLS_RE = /^[A-Za-z_][\w-]{0,63}$/, NAME_RE =/^[a-z][a-z0-9-]{0,31}$/, PATH_RE = /^[MmLlHhVvCcSsQqTtAaZz0-9 .,-]+$/, SIZE_RE = /^[0-9]{1,3}(\.[0-9]+)?(px|em|rem)?$/;
  const cache = Object.create(null);

  const path = (svg, d, filled) => {
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d', d);
    if (filled) p.setAttribute('fill', 'currentColor');
    svg.append(p);
  };
  /** SVG base (sem título/tamanho) de um nome conhecido — montado uma vez e clonado. */
  function tpl(name) {
    if (cache[name]) return cache[name];
    const raw = name in MAP ? MAP[name] : FALLBACK, i = raw.indexOf('*');
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none'); svg.setAttribute('stroke', 'currentColor'); svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round'); svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('focusable', 'false');
    svg.setAttribute('class', 'r4-icon' + (name in MAP ? ' r4-icon-' + name : ''));
    const s = i < 0 ? raw : raw.slice(0, i), f = i < 0 ? '' : raw.slice(i + 1);
    s && path(svg, s, false); f && path(svg, f, true);
    return (cache[name] = svg);
  }
  const has = name => typeof name === 'string' && name in MAP;

  /**
   * R4.icon(nome, { size, title, cls }) → <svg>. size: número (px) ou '1.5em'; title: nome acessível
   * (role="img" + <title>); cls: classes extras. Nome desconhecido → círculo + aviso com sugestão.
   * R4.icon(alvo, nome, opções) monta o componente <r4-icon> dentro do alvo.
   */
  function icon(name, opts) {
    if (name && (name.nodeType === 1 || (typeof name === 'string' && !has(name) && typeof opts === 'string' && has(opts)))) {
      return R4.create(Object.assign({}, arguments[2], { xtype: 'icon', name: opts, renderTo: name }));
    }
    opts = opts || {};
    if (!has(name)) {
      const sg = R4.suggest && typeof name === 'string' ? R4.suggest(name, Object.keys(MAP)) : null;
      R4.warn('ícone desconhecido "' + String(name).slice(0, 40) + '"' + (sg ? ' — quis dizer "' + sg + '"?' : ''));
      name = '';
    }
    const svg = tpl(name).cloneNode(true);
    const sz = opts.size == null ? '' : String(opts.size);
    if (SIZE_RE.test(sz)) { svg.setAttribute('width', sz); svg.setAttribute('height', sz); }
    if (opts.cls) String(opts.cls).split(/\s+/).forEach(c => CLS_RE.test(c) && svg.classList.add(c));   // só nomes de classe simples
    if (opts.title) {
      const t = document.createElementNS(NS, 'title');
      t.textContent = String(opts.title);
      svg.insertBefore(t, svg.firstChild);
      svg.setAttribute('role', 'img'); svg.removeAttribute('aria-hidden');
    }
    return svg;
  }
  icon.has = has;
  Object.defineProperty(icon, 'names', { get: () => Object.keys(MAP).sort() });
  /** R4.icon.add('meu', 'M4 4h16v16H4z'[, { fill: true }]) — só comandos de path, até 2000 caracteres. */
  icon.add = (name, d, opts) => {
    if (typeof name !== 'string' || !NAME_RE.test(name)) { R4.warn('R4.icon.add: nome inválido (use a-z, 0-9 e -)'); return false; }
    if (typeof d !== 'string' || !d || d.length > 2000 || !PATH_RE.test(d)) { R4.warn('R4.icon.add: path recusado (só MmLlHhVvCcSsQqTtAaZz, números, espaço, ponto, vírgula e -; máx. 2000)'); return false; }
    MAP[name] = (opts && opts.fill ? '*' : '') + d;
    delete cache[name];
    return true;
  };
  /** HTML (R4.raw) de um ícone, gerado do mapa fixo: para templates R4.html`${R4.icon.html('edit')} Editar`. */
  icon.html = (name, opts) => R4.raw(icon(name, opts).outerHTML);
  /** Põe `valor` em `el`: nome de ícone → SVG; Node → anexa; qualquer outro texto/emoji → texto. Devolve true se for SVG. */
  icon.fill = (el, v, opts) => {
    if (has(v)) { el.replaceChildren(icon(v, opts)); return true; }
    if (v != null && v.nodeType) el.replaceChildren(v);
    else el.textContent = v == null ? '' : String(v);
    return false;
  };
  R4.icon = icon;

  /* ---------- componente <r4-icon name size title> ---------- */
  R4.define('icon', {
    config: { name: '', size: 0, title: '' },
    build() { const s = R4.util.el('span', { class: 'r4-iconc' }); this._put(s); return s; },
    _put(host) { host.replaceChildren(icon(this.name, { size: this.size || null, title: this.title })); },
    /** Troca o ícone. */
    setName(n) { this.name = n; if (this.el) this._put(this.el); return this; }
  }, {
    title: 'icon', group: 'Interface',
    description: 'Ícones SVG próprios (' + Object.keys(MAP).length + ' nomes), desenhados em 24x24 com traço de 2 e cor herdada do texto. Função R4.icon("nome") devolve o <svg>; tag <r4-icon name="edit">; em qualquer opção icon (button, dropdown, stat, alert, emptystate, timeline...) basta usar o nome: icon="edit". Um valor que não é nome continua aparecendo como texto/emoji. Segurança: o SVG vem de um mapa fixo (o nome nunca vira HTML); nome desconhecido → círculo + aviso com sugestão.',
    props: [
      { name: 'name', type: 'string', default: "''", desc: 'Nome do ícone (veja a grade abaixo). Desconhecido → círculo neutro e aviso "quis dizer ...?" no console.' },
      { name: 'size', type: 'number', default: '0', desc: 'Tamanho em px. 0 = 1em (acompanha a fonte do texto).' },
      { name: 'title', type: 'string', default: "''", desc: 'Nome acessível (role="img" + <title>). Sem title o ícone é decorativo (aria-hidden).' },
      { name: 'setName(nome)', type: 'método', desc: 'Troca o ícone.' },
      { name: 'R4.icon(nome, {size, title, cls})', type: 'SVGElement', desc: 'Cria o <svg> inline (viewBox 24, stroke currentColor). R4.icon(alvo, nome, opções) monta o componente num alvo.' },
      { name: 'R4.icon.names / R4.icon.has(nome)', type: 'string[] / boolean', desc: 'Lista dos nomes e teste de existência.' },
      { name: 'R4.icon.add(nome, path[, {fill}])', type: 'boolean', desc: 'Registra um ícone: path 24x24 só com comandos MmLlHhVvCcSsQqTtAaZz, números, espaço, ponto, vírgula e "-" (máx. 2000 caracteres); recusa o resto (devolve false).' },
      { name: 'R4.icon.fill(elemento, valor)', type: 'boolean', desc: 'Nome de ícone → SVG; outro texto/emoji → texto (sempre via DOM/textContent). É o que os componentes usam para a opção icon.' },
      { name: 'R4.icon.html(nome)', type: 'R4.raw', desc: 'Markup do ícone para templates R4.html (gerado do mapa fixo).' }
    ],
    events: []
  });
  R4.registry.icon.meta.playground = {
    html: '<r4-icon{attrs}></r4-icon>', cfg: {},
    controls: { name: icon.names, size: 28, title: '' }
  };
  R4.quickMap.icon = (a, b) => (typeof a === 'string' ? Object.assign({ name: a }, b) : a);
})(window.R4);
