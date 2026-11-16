/**
 * ============================================
 * libr4 / declarative.js  —  R4 dev
 * ============================================
 * Camada HTML: escreva <r4-grid>, <r4-panel>... direto no HTML e a lib monta
 * os componentes sozinha. Também ativa os atributos:
 *   r4-click="acao:alvo"   ações sem JS (modal, close, reload, toggle, copy, alert, goto, anim)
 *   r4-confirm="texto"     pede confirmação antes da ação
 *   r4-anim="fade-up"      animação de entrada ao aparecer na tela (+ r4-delay, r4-duration, r4-once)
 *   r4-hover="lift"        efeito ao passar o mouse (CSS)
 * Elementos adicionados depois (innerHTML, AJAX...) são ativados automaticamente.
 * ============================================
 */
(function (R4) {
  'use strict';
  document.documentElement.classList.add('r4-js');

  /* ---------- formatos para colunas: <r4-col format="money"> ---------- */
  R4.formats = {
    money: v => R4.util.money(v), number: v => R4.util.number(v), date: v => R4.util.date(v),
    bytes: v => R4.util.bytes(+v), bool: v => (v ? '✔' : '✖'), upper: v => String(v).toUpperCase()
  };

  /* ---------- atributo -> configuração ---------- */
  const camel = s => s.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
  R4.configDefaults = function (xtype) {
    const e = R4.registry[xtype], chain = [];
    if (!e) return {};
    for (let p = e.cls.prototype; p && p !== Object.prototype; p = Object.getPrototypeOf(p))
      if (Object.prototype.hasOwnProperty.call(p, 'config')) chain.unshift(p.config);
    return Object.assign({}, ...chain);
  };
  function coerce(v, d) {
    if (typeof d === 'boolean') return v === '' || v === 'true' || v === '1';
    if (typeof d === 'number') { const n = Number(v); return isNaN(n) ? d : n; }
    if (typeof d === 'string') return v;
    if (d && typeof d === 'object') {
      try { return JSON.parse(v); } catch (e) {
        // lista simples sem JSON (ex.: page-sizes="10,30,all"): o componente interpreta o texto
        return Array.isArray(d) && /^[\w\s,]+$/.test(v) ? v : d;
      }
    }
    return v === '' || v === 'true' ? true : v === 'false' ? false : v;   // sem padrão conhecido
  }
  /* ---------- avisos úteis no console (erros de digitação) ---------- */
  R4.warn = m => console.warn('[R4] ' + m);
  const lev = (a, b) => {
    const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
    for (let j = 1; j <= b.length; j++) d[0][j] = j;
    for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return d[a.length][b.length];
  };
  const suggest = (name, list) => {
    let best = null, bd = 3;
    list.forEach(c => { const x = lev(name.toLowerCase(), c.toLowerCase()); if (x < bd) { bd = x; best = c; } });
    return best;
  };
  R4.suggest = suggest;   // "quis dizer ...?" (também usado por R4.icon)
  const kebab = s => s.replace(/[A-Z]/g, m => '-' + m.toLowerCase());
  const ALLOWED_ATTRS = new Set(['region', 'hidden', 'key', 'text', 'closable']);
  const STRUCT = new Set(['r4-col', 'r4-node', 'r4-tab', 'r4-tbar', 'r4-fill', 'r4-sep']);
  const seenTags = new Set();
  /** Hook para módulos: R4.declare('select', (host, cfg, h) => cfg) lê filhos próprios do <r4-select>. */
  R4.declarative = {};
  R4.declare = (xtype, fn) => { R4.declarative[xtype] = fn; };
  /** Registra tags-filhas estruturais (ex.: r4-option) para não gerarem aviso de tag desconhecida. */
  R4.structural = (...tags) => tags.forEach(t => STRUCT.add(t));
  function checkTags(root) {
    root.querySelectorAll('*').forEach(n => {
      const t = n.localName;
      if (!t.startsWith('r4-') || R4.registry[t.slice(3)] || STRUCT.has(t) || seenTags.has(t)) return;
      seenTags.add(t);
      const sg = suggest(t.slice(3), Object.keys(R4.registry).filter(k => !R4.registry[k].meta.hidden));
      R4.warn('tag desconhecida <' + t + '>' + (sg ? ' — quis dizer <r4-' + sg + '>?' : '') );
    });
  }
  const isTag = k => k.localName.startsWith('r4-') && R4.registry[k.localName.slice(3)] && !R4.registry[k.localName.slice(3)].meta.hidden;

  /* ---------- filhos estruturais ---------- */
  const colCfg = c => {
    const cfg = { header: c.getAttribute('header') ?? c.getAttribute('field'), dataIndex: c.getAttribute('field'),
      align: c.getAttribute('align') || undefined, sortable: c.getAttribute('sortable') !== 'false' };
    if (c.hasAttribute('width')) cfg.width = +c.getAttribute('width');
    const f = c.getAttribute('format');
    if (f) cfg.format = f;   // o grid formata e põe como texto (textContent)
    return cfg;
  };
  const nodeCfg = n => ({
    id: n.getAttribute('id') || undefined,
    text: n.getAttribute('text') ?? ([...n.childNodes].find(x => x.nodeType === 3 && x.textContent.trim()) || {}).textContent?.trim() ?? '',
    badge: n.getAttribute('badge') || undefined,
    expanded: n.getAttribute('expanded') !== 'false',
    children: [...n.children].filter(k => k.localName === 'r4-node').map(nodeCfg)
  });
  const tabCfg = t => ({ xtype: 'panel', title: t.getAttribute('title') || R4.util.T('r4.tab', 0, 'Aba'), key: t.getAttribute('key') || undefined,
    closable: t.hasAttribute('closable'), html: t.innerHTML.trim() });
  const itemsFrom = h => [...h.children].map(k => k.localName === 'r4-fill' ? '->' : k.localName === 'r4-sep' ? '-' : isTag(k) ? toCfg(k) : null).filter(Boolean);

  /** Converte um elemento <r4-*> (e filhos estruturais) em cfg para R4.create */
  function toCfg(host) {
    const xtype = host.localName.slice(3), defs = R4.configDefaults(xtype), cfg = { xtype }, dom = {};
    for (const a of host.attributes) {
      if (a.name === 'class') cfg.cls = a.value;
      else if (a.name === 'style') cfg.hostStyle = a.value;
      else if (a.name === 'id') cfg.id = a.value;
      else if (a.name === 'r4-ready') continue;
      else if (/^(r4-|data-|aria-)/.test(a.name)) dom[a.name] = a.value;
      else {
        const k = camel(a.name);
        if (k === '__proto__' || k === 'constructor' || k === 'prototype') { R4.warn('<' + host.localName + '>: atributo "' + a.name + '" ignorado'); continue; }
        if (!(k in defs) && !ALLOWED_ATTRS.has(k)) {
          const sg = suggest(k, Object.keys(defs));
          R4.warn('<' + host.localName + '>: atributo desconhecido "' + a.name + '"' + (sg ? ' — quis dizer "' + kebab(sg) + '"?' : ''));
        }
        cfg[k] = coerce(a.value, defs[k]);
      }
    }
    if (Object.keys(dom).length) cfg.domAttrs = dom;
    const kids = [...host.children], tag = t => kids.filter(k => k.localName === t);
    if (R4.declarative[xtype]) return R4.declarative[xtype](host, cfg, { toCfg, itemsFrom, coerce, isTag, camel, defs }) || cfg;
    if (xtype === 'button') { if (cfg.text == null) cfg.text = host.textContent.trim(); return cfg; }
    if (xtype === 'textfield') return cfg;
    if (xtype === 'grid') { cfg.columns = tag('r4-col').map(colCfg); return cfg; }
    if (xtype === 'treepanel') { cfg.nodes = tag('r4-node').map(nodeCfg); return cfg; }
    if (xtype === 'tabpanel') { cfg.items = kids.filter(k => k.localName === 'r4-tab' || k.localName === 'r4-panel').map(tabCfg); return cfg; }
    if (xtype === 'toolbar') { cfg.items = itemsFrom(host); return cfg; }
    if (xtype === 'viewport') { cfg.items = kids.filter(isTag).map(toCfg); return cfg; }
    // panel / window / tipos customizados: o que sobra vira html (e é escaneado depois)
    const clone = host.cloneNode(true);
    const tbar = clone.querySelector(':scope > r4-tbar');
    if (tbar) { cfg.tbar = itemsFrom(tbar); tbar.remove(); }
    if (xtype === 'window') {
      cfg.buttons = [...clone.querySelectorAll(':scope > r4-button')].map(toCfg);
      clone.querySelectorAll(':scope > r4-button').forEach(b => b.remove());
      cfg.closeAction = 'hide';
    }
    if (cfg.html == null) cfg.html = clone.innerHTML.trim();
    return cfg;
  }

  /* ---------- montagem ---------- */
  function mount(host) {
    host.setAttribute('r4-ready', '');
    try {
      checkTags(host);
      const cfg = toCfg(host), hostStyle = cfg.hostStyle;
      host.removeAttribute('id');
      host.replaceChildren();
      const cmp = R4.create(Object.assign({}, cfg, { renderTo: null }));
      host._r4 = cmp;
      if (cfg.xtype === 'window') { host.hidden = true; cmp.on('show', c => R4.scan(c.el)); }
      else {
        cmp.render(host);
        if (hostStyle) cmp.el.style.cssText += ';' + hostStyle;
        R4.scan(cmp.el);
      }
      Object.keys(cfg.domAttrs || {}).forEach(k => host.removeAttribute(k));
    } catch (err) {
      console.error('[R4] erro ao montar <' + host.localName + '>:', err);
      host.replaceChildren(R4.util.el('div', { class: 'r4-alert r4-alert-err', text: R4.util.T('r4.mountError', { message: err.message }, 'R4: ' + err.message) }));
    }
  }

  let styleEl, styled = '';
  function ensureStyle(tags) {
    const css = tags + '{display:contents}.r4-js ' + tags.split(',').join(':not([r4-ready]),.r4-js ') + ':not([r4-ready]){visibility:hidden}';
    if (css === styled) return;
    styled = css;
    (styleEl ||= document.head.appendChild(R4.util.el('style', { id: 'r4-tags' }))).textContent = css;
  }

  /**
   * Ativa todas as tags <r4-*> e atributos r4-* dentro de `root`.
   * Nada dentro de um elemento com o atributo r4-ignore é montado nem executa r4-click: use-o em
   * volta de conteúdo vindo de usuários/servidor (comentários, HTML de CMS) para que tags e
   * atributos r4-* que venham nesse conteúdo fiquem inertes.
   */
  const ignored = n => !!(n.closest && n.closest('[r4-ignore]'));
  R4.scan = function (root = document) {
    const tags = Object.keys(R4.registry).filter(k => !R4.registry[k].meta.hidden).map(k => 'r4-' + k).join(',');
    ensureStyle(tags);
    checkTags(root);
    [...root.querySelectorAll(tags)].forEach(h => { if (h.isConnected && !h.hasAttribute('r4-ready') && !ignored(h)) mount(h); });
    observeAnim(root);
  };

  /* ---------- ações r4-click ---------- */
  const target = (arg, from) => {
    if (!arg) return null;
    const id = arg.replace(/^#/, '');
    const t = R4.get(id) || document.getElementById(id);
    if (!t) throw new Error('alvo não encontrado: #' + id);
    return t;
  };
  R4.actions = {
    modal: a => target(a).show(),
    close: (a, el) => { const w = a ? target(a) : R4.get((el.closest('.r4-mask') || {}).id); w && w.close(); },
    reload: a => target(a).reload(),
    toggle: a => { const t = target(a); t.toggle ? t.toggle() : (t.hidden = !t.hidden); },
    copy: async a => {
      const t = a.startsWith('#') ? document.getElementById(a.slice(1)) : null;
      await navigator.clipboard.writeText(t ? t.textContent.trim() : a);
      R4.toast(R4.util.T('r4.copied', 0, 'Copiado!'));
    },
    alert: a => R4.msg.alert(R4.util.T('r4.notice', 0, 'Aviso'), a),
    // só navega para URL relativa, #âncora, http(s), mailto ou tel — javascript:/data:/vbscript: são bloqueados
    goto: a => {
      const u = R4.util.safeUrl(a);
      if (!u || /^blob:/i.test(u.replace(/[\u0000- ]/g, ''))) return R4.warn('goto bloqueado: URL insegura "' + String(a).slice(0, 60) + '"');
      location.href = u;
    },
    anim: (a, el) => R4.animate(el, a),
    toast: a => R4.toast(a)
  };
  /** Registra ação própria: R4.action('salvar', (arg, el, ev) => {...}) → r4-click="salvar:valor" */
  R4.action = (name, fn) => { R4.actions[name] = fn; };

  R4.toast = function (text, ms = 2200) {
    const t = R4.util.el('div', { class: 'r4-toast', text });
    document.body.append(t);
    setTimeout(() => t.classList.add('r4-toast-out'), ms);
    setTimeout(() => t.remove(), ms + 400);
  };

  document.addEventListener('click', ev => {
    const h = ev.target.closest && ev.target.closest('[r4-click]');
    if (!h || h.disabled || ignored(h)) return;
    const run = () => h.getAttribute('r4-click').split(';').forEach(part => {
      const i = part.indexOf(':'), name = (i < 0 ? part : part.slice(0, i)).trim(), arg = i < 0 ? '' : part.slice(i + 1).trim();
      const fn = R4.actions[name];
      if (!fn) { const sg = suggest(name, Object.keys(R4.actions)); return R4.warn('ação desconhecida "' + name + '"' + (sg ? ' — quis dizer "' + sg + '"?' : '')); }
      try { const r = fn(arg, h, ev); r && r.catch && r.catch(e => console.error('[R4] ação ' + name + ':', e)); }
      catch (e) { console.error('[R4] ação ' + name + ':', e); R4.toast(R4.util.T('r4.error', { message: e.message }, 'Erro: ' + e.message)); }
    });
    if (h.matches('a')) ev.preventDefault();
    const conf = h.getAttribute('r4-confirm');
    conf ? R4.msg.confirm(R4.util.T('r4.confirm', 0, 'Confirmar'), conf, ok => ok && run()) : run();
  });

  /* ---------- animações r4-anim ---------- */
  const io = typeof IntersectionObserver === 'function' ? new IntersectionObserver(entries => entries.forEach(e => {
    const el = e.target;
    if (e.isIntersecting) { el.classList.add('r4-in'); if (el.getAttribute('r4-once') !== 'false') io.unobserve(el); }
    else if (el.getAttribute('r4-once') === 'false') el.classList.remove('r4-in');
  }), { threshold: 0.15 }) : null;

  function observeAnim(root) {
    (root.querySelectorAll ? root.querySelectorAll('[r4-anim]:not([r4-anim-ready])') : []).forEach(el => {
      el.setAttribute('r4-anim-ready', '');
      const d = el.getAttribute('r4-delay'), t = el.getAttribute('r4-duration');
      if (d) el.style.setProperty('--r4-delay', /\D$/.test(d) ? d : d + 'ms');
      if (t) el.style.setProperty('--r4-dur', /\D$/.test(t) ? t : t + 'ms');
      io ? io.observe(el) : el.classList.add('r4-in');
    });
  }

  /** Dispara uma animação uma vez: R4.animate(el, 'shake') */
  R4.animate = function (el, name = 'pulse') {
    el = typeof el === 'string' ? document.querySelector(el) : el;
    if (!el) return;
    const cls = 'r4-fx-' + name;
    el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls);
    el.addEventListener('animationend', () => el.classList.remove(cls), { once: true });
  };

  /* ---------- documentação (vitrine) ---------- */
  R4.module('tags', {}, {
    group: 'HTML declarativo', title: 'Tags <r4-*>',
    description: 'Todo componente registrado vira uma tag. Atributos viram configuração (page-size → pageSize; atributo sem valor = true). O conteúdo da tag vira o html do componente, e tags r4-* aninhadas são montadas também.',
    props: [
      { name: '<r4-div cols gap flex column wrap align justify pad>', type: 'html', desc: 'Contêiner de layout (colunas ou flex). Substitui as antigas classes de grid.' },
      { name: '<r4-panel title collapsible>', type: 'html', desc: 'Conteúdo livre dentro. <r4-tbar> define a barra superior.' },
      { name: '<r4-toolbar>', type: 'html', desc: 'Filhos: <r4-button>, <r4-textfield>, <r4-fill> (empurra à direita), <r4-sep>.' },
      { name: '<r4-button variant icon r4-click>', type: 'html', desc: 'O texto do botão é o conteúdo da tag.' },
      { name: '<r4-grid src page-size filter data>', type: 'html', desc: 'Filhos <r4-col field header width align sortable format>. format: money, number, date, bytes, bool, upper. src busca JSON; data aceita JSON inline.' },
      { name: '<r4-tabpanel>', type: 'html', desc: 'Filhos <r4-tab title closable key>conteúdo</r4-tab>.' },
      { name: '<r4-treepanel>', type: 'html', desc: 'Filhos <r4-node id text badge expanded> aninháveis.' },
      { name: '<r4-window id title width>', type: 'html', desc: 'Nasce oculta; abra com r4-click="modal:#id". Filhos <r4-button> viram o rodapé.' },
      { name: '<r4-viewport>', type: 'html', desc: 'Filhos com region="north|west|center|east|south".' },
      { name: 'id', type: 'atributo', desc: 'Vira o id do componente: R4.get("id") e r4-click="...:#id".' },
      { name: 'R4.scan(elemento)', type: 'método', desc: 'Ativa tags inseridas manualmente (automático via MutationObserver; R4.config.autoScan = false desliga o automático).' },
      { name: 'r4-ignore', type: 'atributo', desc: 'Segurança: dentro de um elemento com r4-ignore, tags <r4-*> não são montadas e r4-click não executa. Envolva com ele qualquer HTML vindo de usuários/servidor.' },
      { name: 'conteúdo e atributo html', type: 'segurança', desc: 'O conteúdo das tags (e o atributo html) vira HTML: é HTML CONFIÁVEL. Dados de fora vão em atributos de texto (title, text, label...) escapados com R4.util.esc.' }
    ]
  });
  R4.module('actions', R4.actions, {
    group: 'HTML declarativo', title: 'r4-click (ações)',
    description: 'Comportamento sem JavaScript: r4-click="acao:alvo". Combine várias com ";" e peça confirmação com r4-confirm="texto". Registre ações próprias com R4.action(nome, fn).',
    props: [
      { name: 'modal:#id', type: 'ação', desc: 'Abre uma <r4-window>.' },
      { name: 'close  |  close:#id', type: 'ação', desc: 'Fecha a janela do botão (ou a indicada).' },
      { name: 'reload:#id', type: 'ação', desc: 'Recarrega um grid com src.' },
      { name: 'toggle:#id', type: 'ação', desc: 'Recolhe/expande panel ou mostra/oculta um elemento.' },
      { name: 'copy:texto  |  copy:#id', type: 'ação', desc: 'Copia para a área de transferência.' },
      { name: 'alert:texto  |  toast:texto', type: 'ação', desc: 'Diálogo ou aviso rápido.' },
      { name: 'goto:url', type: 'ação', desc: 'Navega. Só aceita URL relativa, #âncora, http(s), mailto e tel: javascript:, data: e vbscript: são bloqueados (aviso no console).' },
      { name: 'valor vindo de dados', type: 'segurança', desc: 'Ao montar r4-click com dado dinâmico use R4.util.escArg(valor): escapa o HTML e tira ";" (que encadearia outra ação). Na coluna actions do grid, {campo} já é tratado.' },
      { name: 'anim:nome', type: 'ação', desc: 'Anima o próprio elemento (shake, pulse, bounce, flash...).' },
      { name: 'r4-confirm="texto"', type: 'atributo', desc: 'Pede confirmação antes de executar.' }
    ]
  });
  R4.module('anim', { animate: R4.animate }, {
    group: 'HTML declarativo', title: 'r4-anim (animações)',
    description: 'Entrada animada quando o elemento aparece na tela. Respeita prefers-reduced-motion.',
    props: [
      { name: 'r4-anim="fade | fade-up | fade-down | fade-left | fade-right | zoom-in | zoom-out"', type: 'atributo', desc: 'Animação de entrada.' },
      { name: 'r4-delay="200"  r4-duration="800"', type: 'atributo', desc: 'Atraso e duração em ms.' },
      { name: 'r4-once="false"', type: 'atributo', desc: 'Repete a cada vez que reaparece.' },
      { name: 'r4-hover="lift | grow | glow"', type: 'atributo', desc: 'Efeito ao passar o mouse.' },
      { name: 'R4.animate(el, "shake")', type: 'método', desc: 'Dispara na hora: shake, pulse, bounce, flash, zoom-in, fade...' }
    ]
  });
  R4.module('css', {}, {
    group: 'HTML declarativo', title: 'Classes r4-*',
    description: 'Formatação só com classes, em qualquer elemento HTML.',
    props: [
      { name: 'r4-container', type: 'layout', desc: 'Centraliza com largura máxima.' },
      { name: 'r4-flex  r4-flex-col  r4-wrap  r4-items-center  r4-justify-between  r4-gap-1..4', type: 'layout', desc: 'Flexbox.' },
      { name: '<r4-div cols="3">', type: 'layout', desc: 'Colunas, flex e espaçamento: veja o componente div no menu Componentes.' },
      { name: 'r4-p-1..4  r4-m-1..4  r4-mt-1..4  r4-mb-1..4', type: 'espaço', desc: 'Padding e margem.' },
      { name: 'r4-card  r4-shadow  r4-rounded', type: 'visual', desc: 'Cartão, sombra, cantos.' },
      { name: 'r4-text-center  r4-text-muted  r4-text-primary  r4-bold  r4-text-lg', type: 'texto', desc: 'Tipografia.' },
      { name: 'r4-bg-primary  r4-bg-ok  r4-bg-err', type: 'cor', desc: 'Fundos.' },
      { name: 'r4-btn  r4-btn-primary  r4-btn-danger  r4-input', type: 'form', desc: 'Botão e campo em HTML puro.' },
      { name: 'r4-alert  r4-alert-ok  r4-alert-err  r4-tag', type: 'feedback', desc: 'Avisos e etiquetas.' }
    ]
  });

  /* ---------- auto ---------- */
  let queued = false;
  const queue = () => { if (queued || R4.config.autoScan === false) return; queued = true; requestAnimationFrame(() => { queued = false; R4.scan(document); }); };
  R4.ready(() => {
    R4.scan(document);
    new MutationObserver(m => { if (m.some(x => x.addedNodes.length)) queue(); }).observe(document.body, { childList: true, subtree: true });
  });
})(window.R4);
