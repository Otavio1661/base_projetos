/**
 * runner-ui.js — interface da página /vitrine/testes, montada com a própria libr4.
 * Botão "Rodar tudo", filtro por suíte, resumo no topo, lista PASSOU/FALHOU/PULADO por suíte (grid)
 * com mensagem do erro e tempo. ?auto=1 roda ao abrir; ?suite=grid,form limita; ?slow=0 pula a suíte lenta.
 * Expõe window.__R4_TESTS = { done, passed, failed, skipped, total, asserts, ms, failures:[...] } (ver r4test.js).
 */
R4.ready(() => {
  const T = R4Test, { el } = R4.util, qs = new URLSearchParams(location.search);
  const LABEL = { pass: 'PASSOU', fail: 'FALHOU', skip: 'PULADO', known: 'CONHECIDA', pending: '...' };
  const plan = T.suites.map(s => ({ name: s.name, slow: s.slow, tests: s.tests.map(x => x.name) }));
  const state = { rows: {}, panels: {}, grids: {}, running: false, onlyFail: false };

  /* ---------- casca ---------- */
  const page = el('main', { class: 'r4t-page' });
  document.body.append(page);
  const head = el('header', { class: 'r4t-head' }, [
    el('h1', { text: 'Testes da libr4' }),
    el('span', { class: 'r4t-sub', text: 'Rodam aqui, no navegador (JavaScript puro, sem Node). Cada teste usa um contêiner isolado.' }),
    el('a', { href: '/vitrine', class: 'r4-btn', text: 'Vitrine' })
  ]);
  page.append(head);
  R4.create({ xtype: 'themeswitch', renderTo: head, presets: false });

  const bar = el('div', { class: 'r4t-bar' });
  page.append(bar);
  const bRun = R4.create({ xtype: 'button', text: 'Rodar tudo', variant: 'primary', icon: 'play', renderTo: bar, handler: () => start() });
  const bFail = R4.create({ xtype: 'button', text: 'Rodar só as que falharam', icon: 'refresh', disabled: true, renderTo: bar, handler: () => start({ failedOnly: true }) });
  const sel = R4.create({ xtype: 'select', label: 'Suíte', renderTo: bar, value: '',
    options: [{ value: '', text: 'Todas as suítes' }].concat(plan.map(p => ({ value: p.name, text: p.name + (p.slow ? ' (lenta)' : '') + ' — ' + p.tests.length + ' testes' }))) });
  const swSlow = R4.create({ xtype: 'switch', label: 'Incluir suítes lentas', value: qs.get('slow') !== '0', renderTo: bar });
  const swFail = R4.create({ xtype: 'switch', label: 'Mostrar só falhas', value: false, renderTo: bar,
    listeners: { change: (c, v) => { state.onlyFail = !!v; plan.forEach(p => paint(p.name)); } } });

  const sumBox = el('div', { class: 'r4t-sum' });
  page.append(sumBox);
  const stats = R4.create({ xtype: 'stats', renderTo: sumBox, minWidth: 130, items: [] });
  const bar2 = R4.create({ xtype: 'progress', renderTo: sumBox, value: 0, max: 1, showValue: true, label: 'Progresso' });
  const status = el('div', { class: 'r4t-status', role: 'status', 'aria-live': 'polite', text: 'Pronto. Clique em "Rodar tudo".' });
  page.append(status);
  const list = el('div', { class: 'r4t-list' });
  page.append(list);

  const totalTests = names => plan.filter(p => names.includes(p.name)).reduce((n, p) => n + p.tests.length, 0);
  const setStats = (s, extra) => stats.setItems([
    { title: 'Passaram', value: s.passed, variant: 'ok' }, { title: 'Falharam', value: s.failed, variant: s.failed ? 'err' : 'default' },
    { title: 'Puladas', value: s.skipped }, { title: 'Falhas conhecidas', value: s.known || 0 }, { title: 'Asserções', value: s.asserts },
    { title: 'Tempo', value: (s.ms / 1000).toFixed(1) + ' s' }, { title: 'Testes', value: s.total + (extra ? ' / ' + extra : '') }]);
  setStats({ passed: 0, failed: 0, skipped: 0, asserts: 0, ms: 0, total: 0 }, plan.reduce((n, p) => n + p.tests.length, 0));

  /* ---------- lista por suíte ---------- */
  const msgCell = r => {
    if (r.status === 'fail') {
      const d = el('details', { class: 'r4t-msg' }, [el('summary', { text: r.error })]);
      if (r.stack) d.append(el('pre', { text: r.stack }));
      return d;
    }
    return el('span', { class: r.status === 'known' ? 'r4t-msg' : 'r4t-skipmsg', text: r.status === 'skip' || r.status === 'known' ? r.error : '' });
  };
  const columns = [
    { header: 'Resultado', dataIndex: 'status', width: 100, renderer: v => R4.html`<span class="r4t-tag r4t-${v}">${LABEL[v] || v}</span>` },
    { header: 'Teste', dataIndex: 'name' },
    { header: 'Asserções', dataIndex: 'asserts', align: 'right', width: 90 },
    { header: 'Tempo (ms)', dataIndex: 'ms', align: 'right', width: 100 },
    { header: 'Mensagem', dataIndex: 'error', sortable: false, renderer: (v, row) => msgCell(row) }
  ];
  function build(p) {
    const panel = R4.create({ xtype: 'panel', title: p.name, collapsible: true, renderTo: list, cls: 'r4t-suite', padding: false });
    const grid = R4.create({ xtype: 'grid', renderTo: panel.body, filter: false, columns: columns.map(c => Object.assign({}, c)), data: [], emptyText: 'Nenhum teste nesta visão.' });
    state.panels[p.name] = panel; state.grids[p.name] = grid;
    state.rows[p.name] = p.tests.map(n => ({ status: 'pending', name: n, asserts: '', ms: '', error: '', stack: '' }));
    panel.el.id = 'suite-' + p.name; panel.suiteInfo = { name: p.name, slow: p.slow };
    paint(p.name);
  }
  function title(name, extra) {
    const p = plan.find(x => x.name === name), rows = state.rows[name] || [];
    const ok = rows.filter(r => r.status === 'pass').length, bad = rows.filter(r => r.status === 'fail').length, sk = rows.filter(r => r.status === 'skip').length, kn = rows.filter(r => r.status === 'known').length;
    return name + (p && p.slow ? ' (lenta)' : '') + ' — ' + ok + '/' + rows.length + ' ok' + (bad ? ', ' + bad + ' falha(s)' : '') + (sk ? ', ' + sk + ' pulado(s)' : '') + (kn ? ', ' + kn + ' falha(s) conhecida(s)' : '') + (extra ? ' · ' + extra : '');
  }
  function paint(name, extra) {
    const rows = state.rows[name], g = state.grids[name], pn = state.panels[name];
    if (!g) return;
    const view = state.onlyFail ? rows.filter(r => r.status === 'fail') : rows;
    g.loadData(view);
    pn.setTitle(title(name, extra));
    pn.el.classList.toggle('bad', rows.some(r => r.status === 'fail'));
    pn.el.classList.toggle('good', rows.length > 0 && rows.every(r => r.status === 'pass' || r.status === 'skip' || r.status === 'known') && rows.some(r => r.status === 'pass'));
    pn.el.hidden = state.onlyFail && !view.length;
  }

  /* ---------- execução ---------- */
  async function start(opt = {}) {
    if (state.running) return;
    state.running = true; bRun.setDisabled(true); bFail.setDisabled(true);
    const only = sel.getValue() ? [sel.getValue()] : (qs.get('suite') ? qs.get('suite').split(',') : null);
    const slow = !!swSlow.getValue();
    let failedOnly = null;
    if (opt.failedOnly) {
      failedOnly = {};
      Object.keys(state.rows).forEach(n => { failedOnly[n] = state.rows[n].filter(r => r.status === 'fail').map(r => r.name); });
    }
    status.className = 'r4t-status'; status.textContent = 'Rodando...';
    let done = 0, planned = 0;
    const sum = await T.run({
      only, slow, failedOnly,
      onStart(p) {
        planned = p.reduce((n, s) => n + s.tests.length, 0);
        list.replaceChildren();
        // reconstrói a lista (as suítes que vão rodar); testes ainda não executados ficam "pendente"
        Object.values(state.grids).forEach(g => { try { g.destroy(); } catch (e) { /* */ } });
        Object.values(state.panels).forEach(pn => { try { pn.destroy(); } catch (e) { /* */ } });
        state.rows = {}; state.panels = {}; state.grids = {};
        p.forEach(s => build({ name: s.name, slow: s.slow, tests: s.tests }));
        bar2.setMax(Math.max(1, planned)); bar2.setValue(0);
        setStats({ passed: 0, failed: 0, skipped: 0, asserts: 0, ms: 0, total: 0 }, planned);
      },
      onTest(r, s, sum) {
        const row = state.rows[s.name].find(x => x.name === r.name);
        Object.assign(row, { status: r.status, asserts: r.asserts, ms: r.ms, error: r.error, stack: r.stack });
        done++; bar2.setValue(done);
        status.textContent = 'Rodando ' + s.name + ' — ' + done + ' de ' + planned + '...';
        setStats(sum, planned);
        paint(s.name);
      },
      onSuite(i) {
        paint(i.name, (i.ms / 1000).toFixed(1) + ' s');
        const pn = state.panels[i.name];
        if (pn && !i.failed && !pn.el.classList.contains('r4-collapsed')) pn.toggle();   // suíte limpa fecha; a que falhou fica aberta
      }
    });
    setStats(sum, planned);
    const mem = sum.heapMB ? ' · memória JS ~' + sum.heapMB + ' MB' : '';
    status.className = 'r4t-status ' + (sum.failed ? 'bad' : 'good');
    status.textContent = (sum.failed ? sum.failed + ' teste(s) falharam' : 'Tudo passou') + ' — ' + sum.passed + ' ok, ' + sum.skipped + ' pulado(s), ' + (sum.known ? sum.known + ' falha(s) conhecida(s) da lib, ' : '') + sum.asserts + ' asserções em ' + (sum.ms / 1000).toFixed(1) + ' s' + mem + '.';
    document.title = (sum.failed ? 'FALHOU ' + sum.failed + ' · ' : 'OK · ') + 'libr4 - Testes';
    state.running = false; bRun.setDisabled(false); bFail.setDisabled(!sum.failed);
    document.body.setAttribute('data-r4t-done', sum.failed ? 'fail' : 'ok');
  }

  plan.forEach(build);
  window.__R4_TESTS = { done: false, passed: 0, failed: 0, skipped: 0, total: 0, asserts: 0, ms: 0, failures: [] };
  if (qs.get('auto') === '1') setTimeout(() => start(), 50);
});
