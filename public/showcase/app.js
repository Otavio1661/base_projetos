/**
 * Vitrine da libr4 — montada com a própria libr4 (viewport + tree + tabpanel).
 * A árvore é gerada de R4.registry e R4.modules: o que for registrado na lib
 * aparece aqui sozinho, com a documentação do `meta` e as demos de R4Demos.
 */
R4.ready(() => {
  const { el, esc } = R4.util;
  const demos = window.R4Demos || {};

  // ---- descoberta automática ----
  const entries = [
    ...Object.entries(R4.registry).filter(([, e]) => !e.meta.hidden).map(([id, e]) => ({ id, kind: 'xtype', meta: e.meta })),
    ...Object.entries(R4.modules).map(([id, m]) => ({ id, kind: 'module', meta: m.meta }))
  ];
  const groups = {};
  entries.forEach(e => (groups[e.meta.group] ||= []).push(e));
  const order = ['Núcleo', 'Componentes'];
  const nodes = Object.keys(groups).sort((a, b) => (order.indexOf(a) + 99) % 99 - (order.indexOf(b) + 99) % 99).map(g => ({
    text: g, badge: groups[g].length,
    children: groups[g].sort((a, b) => a.id.localeCompare(b.id)).map(e => ({ id: e.id, text: e.kind === 'xtype' ? e.id : e.meta.title, badge: demos[e.id] ? '' : 'sem demo' }))
  }));

  // ---- página de documentação de um item ----
  function docPage(e) {
    const m = e.meta, ex = demos[e.id] || [];
    const html = [`<h2 style="margin:0 0 4px">${esc(m.title)}</h2>`,
      e.kind === 'xtype' ? `<code>xtype: '${esc(e.id)}'</code>` : '<code>módulo</code>',
      `<p>${esc(m.description || '')}</p>`];
    if (m.props && m.props.length) {
      html.push('<div class="r4-h">Configuração e API</div><table class="r4-table r4-striped"><thead><tr><th>Nome</th><th>Tipo</th><th>Padrão</th><th>Descrição</th></tr></thead><tbody>' +
        m.props.map(p => `<tr><td><code>${esc(p.name)}</code></td><td><code>${esc(p.type || '')}</code></td><td><code>${esc(p.default ?? '')}</code></td><td>${esc(p.desc || '')}</td></tr>`).join('') + '</tbody></table>');
    }
    if (m.events && m.events.length) html.push('<div class="r4-h">Eventos</div>' + m.events.map(v => `<code>${esc(v)}</code>`).join(' · '));
    html.push(ex.length ? '<div class="r4-h">Exemplos ao vivo</div><div class="vt-examples"></div>' : '<div class="r4-h">Exemplos</div><p>Sem demo cadastrada. Adicione em <code>public/showcase/demos.js</code>.</p>');
    return { title: m.title, key: e.id, closable: true, padding: true, html: html.join(''), ex };
  }

  function mountExamples(panel, ex) {
    const host = panel.body.querySelector('.vt-examples');
    ex.forEach(item => {
      const stage = el('div', { class: 'vt-stage' });
      const outEl = el('pre', { class: 'r4-code vt-out', hidden: true });
      const out = v => { outEl.hidden = false; outEl.textContent = typeof v === 'string' ? v : JSON.stringify(v, null, 2); };
      const run = () => {
        stage.replaceChildren(); outEl.hidden = true;
        Promise.resolve().then(() => item.fn(stage, out)).catch(err => out('Erro: ' + err.message));
      };
      host.append(
        el('h4', { text: item.title, style: { margin: '14px 0 6px' } }),
        el('div', { class: 'vt-demo' }, [stage]),
        outEl,
        el('div', { style: { margin: '8px 0 4px' } }, [el('button', { class: 'r4-btn', text: '↻ Reexecutar', onclick: run })]),
        el('pre', { class: 'r4-code', text: dedent(item.fn.toString()) })
      );
      run();
    });
  }
  function dedent(src) {
    const lines = src.replace(/^(async\s+)?fn/, '$1function').split('\n');
    const pad = Math.min(...lines.slice(1).filter(l => l.trim()).map(l => l.match(/^ */)[0].length), 99);
    return [lines[0], ...lines.slice(1).map(l => l.slice(pad === 99 ? 0 : Math.max(0, pad - 2)))].join('\n');
  }

  // ---- UI ----
  const home = {
    title: 'Início', key: '__home', html: `
      <h2 style="margin:0 0 6px">libr4 <small style="color:var(--r4-mut)">v${R4.version} · ${esc(R4.brand)}</small></h2>
      <p>Biblioteca de componentes dinâmicos em JavaScript puro, sem dependências, no estilo ExtJS:
      <code>R4.create({ xtype: 'grid', ... })</code>. Escolha um item no menu à esquerda.</p>
      <div class="r4-h">Itens encontrados (${entries.length})</div>
      <p>${entries.map(e => `<a href="#${esc(e.id)}" class="vt-chip">${esc(e.meta.title)}</a>`).join(' ')}</p>
      <div class="r4-h">Como adicionar um componente</div>
      <pre class="r4-code">R4.define('meuTipo', {
  config: { texto: '' },
  build() { return R4.util.el('div', { text: this.texto }); }
}, { title: 'meuTipo', description: '...', props: [] });

// + um exemplo em public/showcase/demos.js  →  R4Demos.meuTipo = [{ title, fn(el, out) }]</pre>`
  };

  let tree, tabs;
  const open = id => {
    const e = entries.find(x => x.id === id);
    if (!e) return tabs.setActive(tabs.find('__home'));
    const found = tabs.find(id);
    if (found) return tabs.setActive(found);
    const cfg = docPage(e);
    const panel = tabs.add({ title: cfg.title, key: cfg.key, closable: true, html: cfg.html });
    mountExamples(panel, cfg.ex);
    tree.select(id, true);
    history.replaceState(null, '', '#' + id);
  };

  R4.create({
    xtype: 'viewport', renderTo: document.body, items: [
      { region: 'north', xtype: 'toolbar', cls: 'vt-top', items: [
        { xtype: 'panel', header: false, padding: false, html: '<b class="vt-logo">libr4</b> <span class="vt-sub">vitrine · ' + esc(R4.brand) + '</span>', style: { border: 0, background: 'transparent' } },
        '->',
        { text: '◐ Tema', handler: () => { document.documentElement.classList.toggle('r4-dark'); try { localStorage.setItem('r4-dark', document.documentElement.classList.contains('r4-dark') ? '1' : ''); } catch (e) {} } }
      ] },
      { region: 'west', xtype: 'treepanel', id: 'vt-tree', nodes, style: { borderRight: '1px solid var(--r4-line)' },
        listeners: { select: (t, n) => open(n.id) } },
      { region: 'center', xtype: 'tabpanel', id: 'vt-tabs', items: [home] }
    ]
  });
  tree = R4.get('vt-tree'); tabs = R4.get('vt-tabs');
  tabs.on('tabchange', (t, p) => { const tab = tabs.current; if (tab && tab.key && tab.key !== '__home') { tree.select(tab.key, true); history.replaceState(null, '', '#' + tab.key); } });

  window.addEventListener('hashchange', () => open(location.hash.slice(1)));
  if (location.hash.length > 1) open(location.hash.slice(1));
});
