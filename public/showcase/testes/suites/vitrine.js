/* suíte vitrine (LENTA — roda por último): regressão da vitrine. Para cada componente/módulo registrado na lib (menos os ocultos)
   roda TODOS os exemplos de R4Demos[nome] (html: innerHTML + R4.scan; fn: executa com o contêiner e out) num contêiner isolado,
   espera ~300 ms e reprova se lançar erro, se aparecer .r4-alert-err ou tag <r4-*> sem r4-ready, ou se chamar console.error.
   Os dados vêm do vitrineData / da API de teste reais (/showcase/vitrineData, /vitrine/api/*). */
(() => {
  const { suite, test, assert } = R4Test;
  const demos = window.R4Demos || {};
  const ESPERA = 300;
  const entradas = [
    ...Object.entries(R4.registry).filter(([, e]) => !e.meta.hidden).map(([id, e]) => ({ id, kind: 'xtype', meta: e.meta })),
    ...Object.entries(R4.modules).map(([id, m]) => ({ id, kind: 'módulo', meta: m.meta }))
  ].sort((a, b) => a.id.localeCompare(b.id));
  // avisos de digitação da própria lib dentro de um exemplo significam que o exemplo tem um erro (tag/atributo/ação/ícone/validador errado)
  const AVISO_DE_ERRO = /tag desconhecida|atributo desconhecido|ação desconhecida|ícone desconhecido|validator desconhecido|tipo de campo desconhecido|xtype desconhecido|JSON inválido/;

  async function rodarExemplo(t, item) {
    const problemas = [];
    const antes = new Set(Object.keys(R4.instances));
    const stage = document.createElement('div');
    stage.className = 'vt-stage';
    t.box.append(stage);
    const saidas = [];
    const out = v => {
      try { saidas.push(typeof v === 'string' ? v : JSON.stringify(v, null, 2)); }
      catch (e) { problemas.push('out() recebeu um valor que não vira JSON: ' + e.message); }
    };
    t.logs.clear();
    try {
      if (item.html) { stage.innerHTML = String(item.html).trim(); R4.scan(stage); }
      else await item.fn(stage, out);
    } catch (e) { problemas.push('lançou erro: ' + (e && e.message ? e.message : e)); }
    await t.sleep(ESPERA);
    // .r4-alert-err de erro de montagem = filho direto de uma tag <r4-*> (a classe também aparece de propósito em exemplos de CSS)
    const erros = [...stage.querySelectorAll('.r4-alert-err')].filter(n => n.parentElement && n.parentElement.localName.startsWith('r4-'));
    if (erros.length) problemas.push(erros.length + ' bloco(s) .r4-alert-err: ' + [...erros].map(n => n.textContent.trim()).join(' | ').slice(0, 200));
    const sem = [...stage.querySelectorAll('*')].filter(n => {
      const nome = n.localName;
      return nome.startsWith('r4-') && R4.registry[nome.slice(3)] && !R4.registry[nome.slice(3)].meta.hidden && !n.hasAttribute('r4-ready') && !n.closest('[r4-ignore]');
    });
    if (sem.length) problemas.push(sem.length + ' tag(s) sem r4-ready (não montaram): ' + [...new Set(sem.map(n => '<' + n.localName + '>'))].join(', '));
    const logErr = t.logs.take('error');
    if (logErr.length) problemas.push('console.error: ' + logErr.join(' | ').slice(0, 240));
    const avisos = t.logs.take('warn').filter(m => AVISO_DE_ERRO.test(m));
    if (avisos.length) problemas.push('aviso da lib: ' + avisos.join(' | ').slice(0, 240));
    const novos = Object.keys(R4.instances).filter(id => !antes.has(id));
    const produziu = stage.childElementCount > 0 || saidas.length > 0 || novos.length > 0;
    if (!produziu) problemas.push('o exemplo não produziu nada (nem elementos, nem out(), nem componentes)');
    // limpeza entre os exemplos (poupa memória): componentes criados, restos no body, notificações, máscaras
    novos.forEach(id => { try { R4.instances[id] && R4.instances[id].destroy(); } catch (e) { /* */ } delete R4.instances[id]; });
    stage.querySelectorAll('*').forEach(n => { if (n._r4) { try { n._r4.destroy(); } catch (e) { /* */ } } });
    stage.remove();
    R4Test.clean();
    return { problemas };
  }

  suite('vitrine', () => {
    test('o próprio verificador acusa exemplos quebrados (e aceita um bom)', async t => {
      const tag = 'r4-panel' + String.fromCharCode(97 + Math.floor(Math.random() * 26), 97 + Math.floor(Math.random() * 26));
      R4.define('r4tQuebra', { build() { throw new Error('build quebrado'); } }, { hidden: true });
      t.cleanup(() => { delete R4.registry.r4tQuebra; });
      const ruins = [
        [{ title: 'lança', fn() { throw new Error('boom'); } }, 'lançou erro: boom'],
        [{ title: 'rejeita', async fn() { await Promise.resolve(); throw new Error('async boom'); } }, 'lançou erro: async boom'],
        [{ title: 'console.error', fn(el) { el.textContent = 'x'; console.error('registrado'); } }, 'console.error: registrado'],
        [{ title: 'tag errada', html: '<' + tag + ' title="x"></' + tag + '>' }, 'aviso da lib'],
        [{ title: 'atributo errado', html: '<r4-panel titel="x">y</r4-panel>' }, 'atributo desconhecido'],
        [{ title: 'vazio', html: '' }, 'não produziu nada'],
        [{ title: 'circular', fn(el, out) { const a = {}; a.a = a; out(a); } }, 'não vira JSON']
      ];
      for (const [item, trecho] of ruins) {
        const r = await rodarExemplo(t, item);
        assert.ok(r.problemas.join(' | ').includes(trecho), '"' + item.title + '" deveria acusar "' + trecho + '", mas acusou: ' + (r.problemas.join(' | ') || 'nada'));
      }
      const bom = await rodarExemplo(t, { title: 'bom', html: '<r4-badge text="ok"></r4-badge><r4-button>x</r4-button>' });
      assert.deepEq(bom.problemas, [], 'exemplo correto não gera problemas');
      const bomFn = await rodarExemplo(t, { title: 'bom fn', fn(el, out) { R4.create({ xtype: 'panel', title: 'p', renderTo: el }); out({ ok: 1 }); } });
      assert.deepEq(bomFn.problemas, []);
      const css = await rodarExemplo(t, { title: 'classe', html: '<div class="r4-alert r4-alert-err">só a classe de CSS</div>' });
      assert.deepEq(css.problemas, [], 'a classe .r4-alert-err em HTML puro não é erro de montagem');
      R4.registry.r4tQuebra.meta.hidden = false;
      const quebra = await rodarExemplo(t, { title: 'montagem', html: '<r4-r4tquebra></r4-r4tquebra>' });
      R4.registry.r4tQuebra.meta.hidden = true;
      assert.ok(quebra.problemas.some(p => p.includes('console.error') || p.includes('r4-alert-err')), 'erro de montagem (build lançou) é acusado');
    });

    test('cobertura: todo componente e módulo registrado tem exemplos na vitrine e meta documentada', t => {
      assert.gt(entradas.length, 50, 'itens da vitrine (' + entradas.length + ')');
      const sem = entradas.filter(e => !(demos[e.id] || []).length).map(e => e.id);
      assert.deepEq(sem, [], 'itens sem nenhum exemplo');
      const semMeta = entradas.filter(e => !e.meta.title || !e.meta.description).map(e => e.id);
      assert.deepEq(semMeta, [], 'itens sem título/descrição');
      const orfaos = Object.keys(demos).filter(k => !entradas.some(e => e.id === k) && !(R4.registry[k] && R4.registry[k].meta.hidden));
      assert.deepEq(orfaos, [], 'exemplos de itens que não existem mais');
      const semTitulo = [];
      Object.entries(demos).forEach(([k, lista]) => lista.forEach((x, i) => { if (!x.title || (!x.html && typeof x.fn !== 'function')) semTitulo.push(k + '#' + i); }));
      assert.deepEq(semTitulo, [], 'exemplos sem título ou sem html/fn');
      const visiveis = entradas.filter(e => e.kind === 'xtype');
      const semProps = visiveis.filter(e => !Array.isArray(e.meta.props) || !e.meta.props.length).map(e => e.id);
      assert.deepEq(semProps, [], 'componentes sem tabela de props');
      const total = entradas.reduce((n, e) => n + (demos[e.id] || []).length, 0);
      assert.gt(total, 150, 'exemplos no total (' + total + ')');
    });

    test('dados de teste (vitrineData) acessíveis: JSON dos arquivos e rows(n) sintético', async t => {
      assert.eq(typeof VitrineData.url, 'function');
      assert.eq(VitrineData.url('clientes'), '/showcase/vitrineData/clientes.json');
      const clientes = await VitrineData.load('clientes');
      assert.eq(clientes.length, 60, 'catálogo: 60 clientes');
      assert.deepEq(Object.keys(clientes[0]), ['id', 'nome', 'email', 'cidade', 'uf', 'status', 'plano', 'criadoEm', 'saldo']);
      const grande = await VitrineData.load('grande');
      assert.eq(grande.length, 5000);
      const r = VitrineData.rows(2500);
      assert.eq(r.length, 2500);
      assert.eq(new Set(r.map(x => x.id)).size, 2500, 'ids únicos');
      ['produtos', 'pedidos', 'usuarios', 'arvore', 'vendas-mensais', 'vendas-categoria', 'series-diarias', 'kpis', 'estados', 'opcoes', 'eventos'].forEach(n => assert.eq(typeof VitrineData.url(n), 'string', n));
      const api = await fetch('/vitrine/api/clientes?page=1&size=5').then(x => x.json());
      assert.ok(Array.isArray(api.retorno) && api.retorno.length === 5, 'API de teste /vitrine/api/clientes paginada');
      assert.eq(api.total, 60);
    }, { timeout: 15000 });

    entradas.forEach(e => {
      const lista = demos[e.id] || [];
      test(e.id + ' (' + e.kind + '): ' + lista.length + ' exemplo(s) rodam sem erro', async t => {
        assert.gt(lista.length, 0, 'tem exemplos');
        const falhas = [];
        for (const item of lista) {
          const r = await rodarExemplo(t, item);
          assert.ok(typeof item.title === 'string' && item.title.length > 0, 'exemplo com título');
          if (r.problemas.length) falhas.push('"' + item.title + '": ' + r.problemas.join('; '));
        }
        assert.eq(falhas.length, 0, falhas.join('\n'));
      }, { timeout: 4000 + lista.length * 2500 });
    });
  }, { slow: true });
})();
