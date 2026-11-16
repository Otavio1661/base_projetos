/**
 * ============================================
 * libr4 / quick.js  —  R4 dev
 * ============================================
 * Funções prontas: todo componente vira uma função curta.
 *
 *   R4.grid('#tabela', [{nome:'Ana', valor:10}])      // colunas automáticas
 *   R4.button('#acoes', 'Salvar', () => ...)
 *   R4.panel('#box', 'Título', '<p>html</p>')
 *   R4.window('Aviso', '<p>Olá</p>')                  // abre direto
 *   R4.render('#alvo', '<r4-grid ...>')               // HTML da lib em qualquer lugar
 *
 * Padrão: R4.<xtype>(alvo, dados, extra). Passar um objeto no lugar dos dados
 * continua valendo (é a config completa do componente).
 * ============================================
 */
(function (R4) {
  'use strict';
  const isTarget = v => typeof v === 'string' || (v && v.nodeType === 1);
  const plain = v => v && typeof v === 'object' && !Array.isArray(v) && !v.nodeType;

  /** (a, b) -> config; cada componente define como lê os "dados" mais comuns */
  const QUICK = {
    grid: (a, b) => typeof a === 'string' ? Object.assign({ src: a }, b)
      : Array.isArray(a) ? Object.assign({ data: a, pageSize: a.length > 15 ? 10 : 0 }, b) : a,
    button: (a, b) => plain(a) ? a : (typeof b === 'function' ? { text: a, handler: b } : Object.assign({ text: a }, b)),
    panel: (a, b) => plain(a) ? a : { title: a, html: b },
    textfield: (a, b) => plain(a) ? a : Object.assign({ label: a }, b),
    div: (a, b) => plain(a) ? a : Object.assign({ html: a }, b),
    toolbar: a => Array.isArray(a) ? { items: a } : a,
    treepanel: (a, b) => Array.isArray(a)
      ? { nodes: a, listeners: typeof b === 'function' ? { select: (t, n) => b(n) } : undefined } : a,
    tabpanel: a => plain(a) && !('items' in a) && Object.values(a).every(v => typeof v === 'string')
      ? { items: Object.entries(a).map(([title, html]) => ({ title, html })) }
      : Array.isArray(a) ? { items: a } : a,
    window: (a, b) => plain(a) ? a : { title: a, html: b }
  };

  /** Módulos registram o atalho do seu componente: R4.quickMap.chart = (dados, extra) => ({ ... }) */
  R4.quickMap = QUICK;

  function make(x) {
    if (R4[x] || (R4.registry[x] && R4.registry[x].meta.hidden)) return;
    R4[x] = function (target, a, b) {
      let t = target, rest = [a, b];
      if (x === 'window' || !isTarget(target)) { t = null; rest = [target, a]; }   // janelas não têm alvo
      const cfg = Object.assign({}, (QUICK[x] || (p => plain(p) ? p : { html: p }))(...rest));
      cfg.xtype = x;
      if (t) cfg.renderTo = t;
      const cmp = R4.create(cfg);
      if (x === 'window') cmp.show();
      return cmp;
    };
  }
  Object.keys(R4.registry).forEach(make);
  // componentes definidos depois ganham a função automaticamente
  const define = R4.define;
  R4.define = function (xtype) { const c = define.apply(this, arguments); make(xtype); return c; };

  /** Coloca HTML (com tags <r4-*> e atributos r4-*) dentro de um alvo e ativa. */
  R4.render = function (target, html) {
    const el = R4.resolve(target);
    if (!el) throw new Error('R4.render: alvo não encontrado: ' + target);
    el.innerHTML = html;
    R4.scan(el);
    return el;
  };
  R4.alert = (...a) => R4.msg.alert(...a);
  R4.confirm = (...a) => R4.msg.confirm(...a);

  R4.module('quick', { render: R4.render }, {
    group: 'Funções prontas', title: 'R4.componente()',
    description: 'Todo componente também é uma função: R4.nome(alvo, dados). Sem montar objeto de configuração. Passar um objeto no lugar dos dados continua funcionando.',
    props: [
      { name: 'R4.grid(alvo, linhas[, opções])', type: 'Grid', desc: 'Colunas criadas a partir das chaves. Com URL no lugar das linhas: busca em src. columns aceita ["nome", {dataIndex, header, format}].' },
      { name: 'R4.button(alvo, texto, função)', type: 'Button', desc: 'Botão que chama a função ao clicar.' },
      { name: 'R4.panel(alvo, título, html)', type: 'Panel', desc: 'Painel com título e conteúdo.' },
      { name: 'R4.textfield(alvo, rótulo[, opções])', type: 'Textfield', desc: 'Campo com rótulo.' },
      { name: 'R4.treepanel(alvo, nós, aoSelecionar)', type: 'Treepanel', desc: 'Árvore; a função recebe o nó clicado.' },
      { name: 'R4.tabpanel(alvo, {Título: html, ...})', type: 'Tabpanel', desc: 'Abas a partir de um objeto título → conteúdo.' },
      { name: 'R4.toolbar(alvo, itens)', type: 'Toolbar', desc: 'Barra com os itens.' },
      { name: 'R4.div(alvo, html, {cols, gap...})', type: 'Div', desc: 'Contêiner de layout.' },
      { name: 'R4.window(título, html)', type: 'Window', desc: 'Abre a janela na hora (sem alvo).' },
      { name: 'R4.render(alvo, html)', type: 'Element', desc: 'Coloca HTML com tags <r4-*> no alvo e já ativa.' },
      { name: 'R4.alert(título, texto) / R4.confirm(título, texto, cb)', type: 'Window', desc: 'Atalhos de R4.msg (diálogos). Para o aviso embutido na página use R4.callout(alvo, texto, {variant}).' },
      { name: 'alvo', type: "'#id' | elemento", desc: 'Seletor CSS ou elemento DOM. Todas as funções devolvem o componente (use .el, .reload(), etc.).' }
    ]
  });
})(window.R4);
