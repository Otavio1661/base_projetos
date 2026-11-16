/**
 * Vitrine da libr4 — montada com a própria libr4 (viewport + tree + tabpanel).
 * A árvore é gerada de R4.registry e R4.modules: o que for registrado na lib
 * aparece aqui sozinho, com a documentação do `meta` e as demos de R4Demos.
 * Os textos fixos da vitrine vêm de R4.t('vt.*') (showcase/i18n.js) e acompanham o idioma:
 * HTML gerado usa o atributo r4-i18n e elementos criados usam R4.util.tx (ambos se retraduzem sozinhos).
 */
R4.ready(() => {
  const { el, esc, tx } = R4.util;
  const demos = window.R4Demos || {};
  const vt = (k, p) => R4.t('vt.' + k, p);
  const ix = k => 'r4-i18n="vt.' + k + '"';                    // atributo para HTML gerado
  const lab = (k, tag, cls) => tx(el(tag || 'span', cls ? { class: cls } : null), 'vt.' + k, k);  // elemento com texto que acompanha o idioma
  const hx = k => `${ix(k)}>${esc(vt(k))}`;                    // abre-fecha: <tag ${hx('k')}</tag>

  // ---- descoberta automática ----
  const entries = [
    ...Object.entries(R4.registry).filter(([, e]) => !e.meta.hidden).map(([id, e]) => ({ id, kind: 'xtype', meta: e.meta })),
    ...Object.entries(R4.modules).map(([id, m]) => ({ id, kind: 'module', meta: m.meta }))
  ];
  const groups = {};
  entries.forEach(e => (groups[e.meta.group] ||= []).push(e));
  const order = ['Núcleo', 'Componentes', 'Formulários', 'Dados', 'Interface', 'Gráficos', 'Receitas', 'Funções prontas', 'HTML declarativo', 'Dados de teste'];
  const nodes = Object.keys(groups).sort((a, b) => (order.indexOf(a) + 99) % 99 - (order.indexOf(b) + 99) % 99).map(g => ({
    text: g, badge: groups[g].length,
    children: groups[g].sort((a, b) => a.id.localeCompare(b.id)).map(e => ({ id: e.id, text: e.kind === 'xtype' ? e.id : e.meta.title, badge: demos[e.id] ? '' : vt('noDemo') }))
  }));

  // ---- página de documentação de um item ----
  function docPage(e) {
    const m = e.meta, ex = demos[e.id] || [];
    const html = [`<h2 style="margin:0 0 4px">${esc(m.title)}</h2>`,
      e.kind === 'xtype' ? `<code>xtype: '${esc(e.id)}'</code>` : `<code ${hx('module')}</code>`,
      `<p>${esc(m.description || '')}</p>`];
    if (m.props && m.props.length) {
      html.push(`<div class="r4-h" ${hx('cfgApi')}</div><table class="r4-table r4-striped"><thead><tr><th ${hx('colName')}</th><th ${hx('colType')}</th><th ${hx('colDefault')}</th><th ${hx('colDesc')}</th></tr></thead><tbody>` +
        m.props.map(p => `<tr><td><code>${esc(p.name)}</code></td><td><code>${esc(p.type || '')}</code></td><td>${p.default ? `<code>${esc(p.default)}</code>` : ''}</td><td>${esc(p.desc || '')}</td></tr>`).join('') + '</tbody></table>');
    }
    if (m.events && m.events.length) html.push(`<div class="r4-h" ${hx('events')}</div>` + m.events.map(v => `<code>${esc(v)}</code>`).join(' · '));
    if (m.playground) html.push(`<div class="r4-h" ${hx('pgTitle')}</div><p class="r4-text-muted" style="margin:0 0 8px" ${hx('pgHint')}</p><div class="vt-pg"></div>`);
    html.push(ex.length ? `<div class="r4-h" ${hx('liveExamples')}</div><div class="vt-examples"></div>`
      : `<div class="r4-h" ${hx('examples')}</div><p><span ${hx('noDemoText')}</span> <code>public/showcase/demos.js</code>.</p>`);
    return { title: m.title, key: e.id, closable: true, padding: true, html: html.join(''), ex, xtype: e.id, pg: m.playground };
  }

  /** Limpa o que a execução anterior deixou (componentes, janelas no body) */
  function cleanStage(stage) {
    stage.querySelectorAll('*').forEach(n => { if (n._r4) try { n._r4.destroy(); } catch (e) {} });
    stage.replaceChildren();
  }

  function copyText(t) {
    (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(
      () => R4.toast(R4.t('r4.copied')), () => R4.toast(R4.t('r4.copyFail')));
  }
  const kebabCase = s => s.replace(/[A-Z]/g, m => '-' + m.toLowerCase());
  const btn = (cls, icon, key, onclick) => el('button', { class: 'r4-btn ' + cls, type: 'button', onclick }, [R4.icon(icon), lab(key)]);

  /** Painel de propriedades: controles gerados de meta.playground; o componente e o código mudam ao vivo. */
  function mountPlayground(panel, xtype, pg) {
    const host = panel.body.querySelector('.vt-pg');
    if (!host) return;
    const defs = R4.configDefaults(xtype);
    const vals = {};
    const stage = el('div', { class: 'vt-stage' });
    const htmlOut = el('pre', { class: 'r4-code' }), jsOut = el('pre', { class: 'r4-code' });
    let htmlText = '', jsText = '';

    const same = (n) => vals[n] === defs[n] || (vals[n] === '' && (defs[n] === '' || defs[n] == null));
    const update = () => {
      const changed = Object.keys(pg.controls).filter(n => !same(n));
      const attrs = changed.map(n => {
        const v = vals[n], a = kebabCase(n);
        if (typeof v === 'boolean') return v ? ' ' + a : ' ' + a + '="false"';
        return ' ' + a + '="' + String(v).replace(/"/g, '&quot;') + '"';
      }).join('');
      htmlText = pg.html.replace('{attrs}', attrs);
      const cfg = Object.assign({ xtype }, pg.cfg);
      changed.forEach(n => { cfg[n] = vals[n]; });
      cfg.renderTo = '#alvo';
      jsText = 'R4.create({\n' + Object.entries(cfg).map(([k, v]) => '  ' + k + ': ' + JSON.stringify(v).replace(/"/g, "'")).join(',\n') + '\n});';
      htmlOut.textContent = htmlText; jsOut.textContent = jsText;
      cleanStage(stage);
      stage.innerHTML = htmlText; R4.scan(stage);
    };

    const controls = el('div', { class: 'vt-controls' });
    Object.entries(pg.controls).forEach(([name, spec]) => {
      let input;
      if (Array.isArray(spec)) {
        vals[name] = spec[0];
        input = el('select', { class: 'r4-input' }, spec.map(o => o === '' ? tx(el('option', { value: '' }), 'vt.none', '(nenhum)') : el('option', { value: o, text: o })));
        input.addEventListener('change', () => { vals[name] = input.value; update(); });
      } else if (typeof spec === 'boolean') {
        vals[name] = spec;
        input = el('input', { type: 'checkbox' });
        input.checked = spec;
        input.addEventListener('change', () => { vals[name] = input.checked; update(); });
      } else {
        vals[name] = spec;
        input = el('input', { class: 'r4-input', type: typeof spec === 'number' ? 'number' : 'text', min: 0 });
        input.value = spec;
        input.addEventListener('input', () => { vals[name] = typeof spec === 'number' ? Number(input.value) : input.value; update(); });
      }
      controls.append(el('label', { class: 'vt-ctl' + (typeof spec === 'boolean' ? ' vt-ctl-bool' : '') }, [el('span', { text: name }), input]));
    });

    const codeHead = (label, getText) => el('div', { class: 'vt-label vt-label-code' }, [
      typeof label === 'string' ? el('b', { text: label }) : label, el('span', { class: 'r4-fill' }),
      btn('vt-mini', 'copy', 'copy', () => copyText(getText()))]);

    host.append(
      el('div', { class: 'vt-pg-grid' }, [controls, el('div', { class: 'vt-demo' }, [stage])]),
      codeHead('HTML', () => htmlText), htmlOut,
      codeHead(lab('jsEquiv', 'b'), () => jsText), jsOut);
    update();
  }

  function mountExamples(panel, ex) {
    const host = panel.body.querySelector('.vt-examples');
    ex.forEach(item => {
      const isHtml = !!item.html;
      const original = isHtml ? item.html.trim() : dedent(item.fn.toString());
      const stage = el('div', { class: 'vt-stage' });
      const outEl = el('pre', { class: 'r4-code vt-out', hidden: true });
      const status = el('span', { class: 'vt-status' });
      const setStatus = (cls, key) => { status.className = 'vt-status' + (cls ? ' ' + cls : ''); status.replaceChildren(...(key ? [R4.icon('dot'), lab(key)] : [])); };
      const out = v => { outEl.hidden = false; outEl.className = 'r4-code vt-out'; outEl.textContent = typeof v === 'string' ? v : JSON.stringify(v, null, 2); };
      const editor = el('textarea', { class: 'vt-editor', spellcheck: 'false', value: original });
      editor.value = original;
      const fit = () => { editor.style.height = 'auto'; editor.style.height = Math.min(editor.scrollHeight + 2, 520) + 'px'; };

      const run = () => {
        cleanStage(stage); outEl.hidden = true; setStatus('');
        try {
          if (isHtml) { stage.innerHTML = editor.value; R4.scan(stage); }
          else {
            const fn = (0, eval)('(' + editor.value + ')');
            Promise.resolve().then(() => fn(stage, out)).catch(err => fail(err));
          }
          setStatus('ok', 'ran');
        } catch (err) { fail(err); }
      };
      const fail = err => { setStatus('err', 'failed'); out(R4.t('r4.error', { message: err.message })); outEl.classList.add('err'); };
      const live = R4.util.debounce(run, 350);

      editor.addEventListener('input', () => { fit(); isHtml && live(); });
      editor.addEventListener('keydown', ev => {
        if (ev.key === 'Tab') { ev.preventDefault(); const s = editor.selectionStart; editor.setRangeText('  ', s, editor.selectionEnd, 'end'); editor.dispatchEvent(new Event('input')); }
        if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) { ev.preventDefault(); run(); }
      });

      host.append(
        el('h4', { text: item.title, style: { margin: '18px 0 8px' } }),
        el('div', { class: 'vt-label' }, [lab('result', 'b'), lab('resultHint', 'span', 'r4-text-muted')]),
        el('div', { class: 'vt-demo' }, [stage, outEl]),
        el('div', { class: 'vt-label vt-label-code' }, [
          lab('code', 'b'), lab(isHtml ? 'codeHintHtml' : 'codeHintJs', 'span', 'r4-text-muted'),
          el('span', { class: 'r4-fill' }), status,
          isHtml ? null : btn('r4-btn-primary vt-mini', 'play', 'run', run),
          btn('vt-mini', 'copy', 'copy', () => copyText(editor.value)),
          btn('vt-mini', 'undo', 'restore', () => { editor.value = original; fit(); run(); })
        ]),
        editor
      );
      fit(); run();
    });
  }
  function dedent(src) {
    const lines = src.replace(/^(async\s+)?fn/, '$1function').split('\n');
    const pad = Math.min(...lines.slice(1).filter(l => l.trim()).map(l => l.match(/^ */)[0].length), 99);
    return [lines[0], ...lines.slice(1).map(l => l.slice(pad === 99 ? 0 : Math.max(0, pad - 2)))].join('\n');
  }

  // ---- UI ----
  // A página Início é refeita ao trocar o idioma (não tem nada digitado pelo usuário).
  const homeHtml = () => `
      <h2 style="margin:0 0 6px">libr4 <small style="color:var(--r4-mut)">v${R4.version} · ${esc(R4.brand)}</small></h2>
      <p>${esc(vt('homeP1'))} <code>R4.create({ xtype: 'grid', ... })</code> ${esc(vt('homeP2'))} <code>&lt;r4-grid page-size="10"&gt;</code>. ${esc(vt('homeP3'))}</p>
      <r4-button variant="primary" icon="play" r4-click="toast:${R4.util.escArg(vt('toastActive'))}">${esc(vt('testTag'))} &lt;r4-button&gt;</r4-button>
      <div class="r4-h">${esc(vt('found'))} (${entries.length})</div>
      <p>${entries.map(e => `<a href="#${esc(e.id)}" class="vt-chip">${esc(e.meta.title)}</a>`).join(' ')}</p>
      <div class="r4-h">${esc(vt('howAdd'))}</div>
      <pre class="r4-code">R4.define('meuTipo', {
  config: { texto: '' },
  build() { return R4.util.el('div', { text: this.texto }); }
}, { title: 'meuTipo', description: '...', props: [] });

// + um exemplo em public/showcase/demos.js  →  R4Demos.meuTipo = [{ title, fn(el, out) }]</pre>`;
  const home = { title: vt('home'), key: '__home', html: homeHtml() };

  let tree, tabs;
  const open = id => {
    const e = entries.find(x => x.id === id);
    if (!e) return tabs.setActive(tabs.find('__home'));
    const found = tabs.find(id);
    if (found) return tabs.setActive(found);
    const cfg = docPage(e);
    const panel = tabs.add({ title: cfg.title, key: cfg.key, closable: true, html: cfg.html });
    cfg.pg && mountPlayground(panel, cfg.xtype, cfg.pg);
    mountExamples(panel, cfg.ex);
    tree.select(id, true);
    history.replaceState(null, '', '#' + id);
  };

  R4.create({
    xtype: 'viewport', renderTo: document.body, items: [
      { region: 'north', xtype: 'toolbar', cls: 'vt-top', items: [
        { xtype: 'panel', header: false, padding: false, html: '<b class="vt-logo">libr4</b> <span class="vt-sub" ' + ix('sub') + ' params="' + esc(JSON.stringify({ brand: R4.brand })) + '">' + esc(vt('sub', { brand: R4.brand })) + '</span>', style: { border: 0, background: 'transparent' } },
        '->',
        { xtype: 'vtlang' },
        { xtype: 'themeswitch', presets: true }
      ] },
      { region: 'west', xtype: 'treepanel', id: 'vt-tree', nodes, style: { borderRight: '1px solid var(--r4-line)' },
        listeners: { select: (t, n) => open(n.id) } },
      { region: 'center', xtype: 'tabpanel', id: 'vt-tabs', items: [home] }
    ]
  });
  tree = R4.get('vt-tree'); tabs = R4.get('vt-tabs');
  tabs.on('tabchange', (t, p) => { const tab = tabs.current; if (tab && tab.key && tab.key !== '__home') { tree.select(tab.key, true); history.replaceState(null, '', '#' + tab.key); } });

  // troca de idioma (ouvinte único da vitrine): Início, aba Início e selos "sem demo"
  // (o resto da casca se atualiza sozinho pelos atributos r4-i18n / R4.util.tx)
  R4.i18n.onChange(() => {
    const t = tabs.find('__home');
    if (t) { t.el.firstChild.textContent = vt('home'); t.cmp.setHtml(homeHtml()); R4.scan(t.cmp.el); }
    Object.values(tree.nodeEls).forEach(n => { if (n.node.badge === 'sem demo' || n.node.badge === 'no demo') { const b = n.row.querySelector('.r4-badge'); if (b) b.textContent = n.node.badge = vt('noDemo'); } });
  });

  window.addEventListener('hashchange', () => open(location.hash.slice(1)));
  if (location.hash.length > 1) open(location.hash.slice(1));
});
