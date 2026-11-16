/* suíte chart: tipos geram SVG sem NaN, dados ruins, tabela alternativa acessível, legenda, update, exportação e destroy */
(() => {
  const { suite, test, assert } = R4Test;
  const MES = [{ mes: '2026-01-01', receita: 100, despesa: 60 }, { mes: '2026-02-01', receita: 150, despesa: 80 }, { mes: '2026-03-01', receita: 90, despesa: 70 }];
  const ruim = h => /NaN|Infinity|undefined|\[object/.test(h);
  const caminhos = c => c.el.querySelectorAll('svg.r4-chart-svg path').length;
  const nb = s => String(s).replace(/[  ]/g, ' ');

  suite('chart', () => {
    test('todos os tipos (bar, line, area, pie, donut, scatter, sparkline) geram <svg> com role=img, rótulo acessível e nenhum NaN', t => {
      ['bar', 'line', 'area', 'pie', 'donut', 'scatter', 'sparkline'].forEach(tipo => {
        const c = t.create({ xtype: 'chart', type: tipo, data: MES, x: 'mes', y: tipo === 'scatter' ? ['receita'] : ['receita', 'despesa'], title: 'Fluxo' });
        const svg = c.el.querySelector('svg');
        assert.ok(svg, tipo + ': tem svg');
        assert.eq(svg.getAttribute('role'), 'img', tipo + ': role=img');
        assert.gt((svg.getAttribute('aria-label') || '').length, 10, tipo + ': descrição acessível');
        assert.notOk(ruim(c.el.innerHTML), tipo + ': sem NaN/undefined no markup');
        assert.gt(svg.querySelectorAll('*').length, 5, tipo + ': desenhou elementos');
        assert.ok(/^\d+(\.\d+)? \d+(\.\d+)? \d+(\.\d+)? \d+(\.\d+)?$|^0 0 \d+ \d+$/.test(svg.getAttribute('viewBox')), tipo + ': viewBox numérico ' + svg.getAttribute('viewBox'));
      });
    });

    test('barras: título, descrição com mínimo/máximo/último por série, eixos e uma barra por ponto×série', t => {
      const c = t.create({ xtype: 'chart', type: 'bar', data: MES, x: 'mes', y: ['receita', 'despesa'], title: 'Fluxo' });
      const svg = c.el.querySelector('svg');
      assert.eq(c.el.querySelector('.r4-chart-title').textContent, 'Fluxo');
      assert.contains(svg.getAttribute('aria-label'), 'Gráfico de barras: Fluxo');
      assert.contains(svg.getAttribute('aria-label'), 'Receita: mínimo 90, máximo 150, último 90');
      assert.contains(svg.getAttribute('aria-label'), 'Despesa: mínimo 60, máximo 80, último 70');
      assert.contains(svg.getAttribute('aria-label'), '3 pontos');
      assert.eq(svg.querySelector('title').textContent, 'Gráfico de barras: Fluxo');
      assert.eq(svg.getAttribute('tabindex'), '0', 'focável pelo teclado');
      assert.eq(caminhos(c), 6, '3 pontos × 2 séries');
      assert.ok(svg.querySelector('.r4-ax-y') && svg.querySelector('.r4-ax-x') && svg.querySelector('.r4-grid-l'), 'eixos e grade');
      const rotulosY = [...svg.querySelectorAll('.r4-ax-y text')].map(x => Number(x.textContent.replace(/\./g, '').replace(',', '.')));
      assert.eq(rotulosY[0], 0, 'eixo Y começa em zero nas barras');
      assert.ok(rotulosY.at(-1) >= 150, 'e cobre o maior valor');
      const g = t.create({ xtype: 'chart', type: 'bar', data: MES, x: 'mes', y: ['receita', 'despesa'], stacked: true });
      assert.eq(caminhos(g), 6, 'empilhado: mesma contagem');
      const h = t.create({ xtype: 'chart', type: 'bar', data: MES, x: 'mes', y: 'receita', horizontal: true });
      assert.eq(caminhos(h), 3);
      assert.notOk(ruim(h.el.innerHTML));
    });

    test('formatos: datas AAAA-MM-DD saem em pt-BR (sem deslocar o dia), money/percent/bytes no eixo e na tabela', t => {
      const c = t.create({ xtype: 'chart', type: 'line', data: MES, x: 'mes', y: 'receita', format: 'money' });
      const rot = [...c.el.querySelectorAll('.r4-ax-x text')].map(x => x.textContent);
      assert.ok(rot.some(r => /^01\/0[123]$/.test(r)), 'rótulos dd/mm: ' + rot.join(','));
      assert.notOk(rot.some(r => /31\/12|28\/02/.test(r)), 'nenhum dia deslocado pelo fuso');
      assert.ok([...c.el.querySelectorAll('.r4-ax-y text')].some(x => /R\$/.test(x.textContent)), 'eixo Y em reais');
      c.setTableView(true);
      assert.eq(nb(c.el.querySelector('tbody tr td:nth-child(2)').textContent), 'R$ 100,00');
      assert.eq(c.el.querySelector('tbody tr td:nth-child(1)').textContent, 'qui., 01/01/2026', 'data completa na tabela');
      const p = t.create({ xtype: 'chart', type: 'bar', data: [{ k: 'a', v: 3.8 }], x: 'k', y: 'v', format: 'percent' });
      p.setTableView(true);
      assert.contains(p.el.querySelector('tbody'), '3,8%');
      const f = t.create({ xtype: 'chart', type: 'bar', data: [{ k: 'a', v: 4242 }], x: 'k', y: 'v', format: n => 'N=' + n });
      f.setTableView(true);
      assert.contains(f.el.querySelector('tbody'), 'N=4242', 'format como função');
    });

    test('tabela alternativa: botão alterna gráfico/tabela (aria-pressed), tabela tem cabeçalhos e valores reais', t => {
      const c = t.create({ xtype: 'chart', type: 'bar', data: MES, x: 'mes', y: ['receita', 'despesa'], title: 'Fluxo' });
      const btn = c.el.querySelector('.r4-chart-btn'), tab = c.el.querySelector('.r4-chart-table'), stage = c.el.querySelector('.r4-chart-stage');
      assert.eq(btn.textContent, 'Ver como tabela');
      assert.eq(btn.getAttribute('aria-pressed'), 'false');
      assert.eq(tab.hidden, true);
      btn.click();
      assert.eq(btn.getAttribute('aria-pressed'), 'true');
      assert.eq(btn.textContent, 'Ver gráfico');
      assert.eq(tab.hidden, false);
      assert.eq(stage.hidden, true);
      assert.eq(tab.getAttribute('role'), 'region');
      assert.contains(tab.getAttribute('aria-label'), 'Fluxo');
      assert.deepEq([...tab.querySelectorAll('thead th')].map(x => x.textContent), ['Mes', 'Receita', 'Despesa']);
      assert.eq([...tab.querySelectorAll('thead th')].every(th => th.getAttribute('scope') === 'col'), true, 'scope=col');
      assert.deepEq([...tab.querySelectorAll('tbody tr')].map(tr => [...tr.cells].slice(1).map(c => c.textContent).join('/')), ['100/60', '150/80', '90/70']);
      assert.eq(tab.querySelector('caption').textContent, 'Gráfico de barras: Fluxo');
      btn.click();
      assert.eq(stage.hidden, false);
      assert.eq(tab.hidden, true);
      const sem = t.create({ xtype: 'chart', type: 'bar', data: MES, tableButton: false });
      assert.eq(sem.el.querySelector('.r4-chart-btn'), null, 'tableButton:false sem botão');
      const ini = t.create({ xtype: 'chart', type: 'bar', data: MES, tableView: true });
      assert.eq(ini.el.querySelector('.r4-chart-table').hidden, false, 'tableView:true começa na tabela');
    });

    test('legenda clicável: esconde/mostra séries com evento legendtoggle; a última visível não some; toggleSeries por código', t => {
      const ev = t.spy();
      const c = t.create({ xtype: 'chart', type: 'bar', data: MES, x: 'mes', y: ['receita', 'despesa'], listeners: { legendtoggle: ev } });
      const lg = () => [...c.el.querySelectorAll('.r4-lg')];
      assert.deepEq(lg().map(b => b.textContent), ['Receita', 'Despesa']);
      assert.eq(caminhos(c), 6);
      assert.deepEq(lg().map(b => b.getAttribute('aria-pressed')), ['true', 'true'], 'visíveis = pressionadas');
      lg()[0].click();
      assert.eq(caminhos(c), 3, 'série escondida some do desenho');
      assert.deepEq(lg().map(b => b.getAttribute('aria-pressed')), ['false', 'true']);
      assert.deepEq(ev.lastArgs.slice(1), ['receita', false], 'legendtoggle(cmp, chave, visível)');
      lg()[1].click();
      assert.eq(caminhos(c), 3, 'a última série visível não é desligada');
      c.toggleSeries('receita');
      assert.eq(caminhos(c), 6, 'toggleSeries sem 2º argumento alterna');
      c.toggleSeries('despesa', false);
      assert.eq(caminhos(c), 3);
      assert.notOk(ruim(c.el.innerHTML));
    });

    test('pizza/rosca: fatias com porcentagem na descrição, "Outros" acima de maxSlices, texto central com {total}', t => {
      const p = t.create({ xtype: 'chart', type: 'pie', data: [{ n: 'A', v: 50 }, { n: 'B', v: 30 }, { n: 'C', v: 20 }], x: 'n', y: 'v' });
      assert.eq(p.el.querySelectorAll('svg.r4-chart-svg path').length, 3);
      assert.contains(p.el.querySelector('svg').getAttribute('aria-label'), 'Total 100. A 50%, B 30%, C 20%.');
      const d = t.create({ xtype: 'chart', type: 'donut', data: [{ n: 'A', v: 50 }, { n: 'B', v: 30 }], x: 'n', y: 'v', centerText: '{total}', centerSub: 'Total' });
      assert.deepEq([...d.el.querySelectorAll('svg text')].map(x => x.textContent), ['80', 'Total']);
      const muitas = t.create({ xtype: 'chart', type: 'pie', maxSlices: 3, data: Array.from({ length: 8 }, (_, i) => ({ n: 'N' + i, v: i + 1 })), x: 'n', y: 'v' });
      assert.eq(muitas.el.querySelectorAll('svg.r4-chart-svg path').length, 3, 'agrupa as menores');
      assert.ok([...muitas.el.querySelectorAll('.r4-lg')].some(b => b.textContent.startsWith('Outros')), 'fatia "Outros"');
      const zero = t.create({ xtype: 'chart', type: 'pie', data: [{ n: 'A', v: 0 }, { n: 'B', v: 0 }], x: 'n', y: 'v' });
      assert.notOk(ruim(zero.el.innerHTML), 'tudo zero não gera NaN (divisão por zero)');
      const neg = t.create({ xtype: 'chart', type: 'pie', data: [{ n: 'A', v: -5 }, { n: 'B', v: 10 }], x: 'n', y: 'v' });
      assert.notOk(ruim(neg.el.innerHTML), 'valor negativo não gera NaN');
    });

    test('dados ruins: vazio, nulo, texto, NaN/Infinity/null/string nos valores, 1 ponto, zeros, gigantes, negativos — sem NaN no SVG', t => {
      const casos = { vazio: [], nulo: null, texto: 'abc', objeto: { a: 1 },
        valoresRuins: [{ x: 'a', y: NaN }, { x: 'b', y: null }, { x: 'c', y: Infinity }, { x: 'd', y: '12' }, { x: 'e', y: -5 }],
        umPonto: [{ x: 'a', y: 5 }], zeros: [{ x: 'a', y: 0 }, { x: 'b', y: 0 }], numeros: [3, 5, 4, 8], gigantes: [{ x: 'a', y: 1e300 }, { x: 'b', y: -1e300 }],
        negativos: [{ x: 'a', y: -3 }, { x: 'b', y: -9 }], dataInvalida: [{ x: '2026-02-30', y: 1 }, { x: 'não é data', y: 2 }], proto: JSON.parse('[{"x":"a","y":1,"__proto__":{"z":1}}]') };
      ['bar', 'line', 'area', 'pie', 'donut', 'scatter', 'sparkline'].forEach(tipo => Object.keys(casos).forEach(k => {
        const c = t.create({ xtype: 'chart', type: tipo, data: casos[k], x: 'x', y: 'y' });
        assert.ok(c.el.querySelector('svg'), tipo + '/' + k + ': não quebrou');
        assert.notOk(ruim(c.el.innerHTML), tipo + '/' + k + ': sem NaN/Infinity/undefined');
      }));
      assert.eq({}.z, undefined);
      const e = t.create({ xtype: 'chart', type: 'line', data: [] });
      assert.contains(e.el, 'Sem dados para exibir.', 'estado vazio em português');
      assert.contains(e.el.querySelector('svg').getAttribute('aria-label'), 'Sem dados para exibir.');
      const x = t.create({ xtype: 'chart', type: 'line', data: [], emptyText: 'Nada <b>aqui</b>' });
      assert.contains(x.el, 'Nada <b>aqui</b>', 'emptyText como texto');
      assert.eq(x.el.querySelector('b'), null);
    });

    test('dados com texto hostil (rótulo, título, série) aparecem como texto no SVG, na tabela e no nome acessível', t => {
      const XSS = '<img src=x onerror=window.__r4tpwn=1>';
      const c = t.create({ xtype: 'chart', type: 'bar', title: XSS, data: [{ nome: XSS, valor: 5 }, { nome: '<script>x</script>', valor: 7 }], x: 'nome', y: 'valor', series: [{ key: 'valor', label: XSS }] });
      assert.eq(c.el.querySelector('img'), null);
      assert.eq(c.el.querySelector('script'), null);
      c.setTableView(true);
      assert.eq(c.el.querySelector('img'), null);
      assert.contains(c.el.querySelector('tbody'), '<script>x</script>', 'como texto na tabela');
      assert.eq(c.el.querySelector('.r4-chart-title').textContent, XSS);
      assert.contains(c.getSVG(), '&lt;img src=x', 'SVG exportado também escapa');
      assert.notContains(c.getSVG(), '<img');
      assert.eq(window.__r4tpwn, undefined);
    });

    test('series: rótulo, tipo misto (barra + linha), cores aceitas só como cor CSS simples', t => {
      const c = t.create({ xtype: 'chart', type: 'bar', data: MES, x: 'mes', series: [{ key: 'receita', label: 'Receita total' }, { key: 'despesa', label: 'Despesa', type: 'line', color: '#e03131' }] });
      assert.deepEq([...c.el.querySelectorAll('.r4-lg')].map(b => b.textContent), ['Receita total', 'Despesa']);
      assert.gt(c.el.querySelectorAll('svg.r4-chart-svg path').length, 3, 'barras e linha juntas');
      assert.notOk(ruim(c.el.innerHTML));
      const mau = t.create({ xtype: 'chart', type: 'bar', data: MES, x: 'mes', y: 'receita', color: 'red;}*{display:none' });
      assert.notContains(mau.el.innerHTML, 'display:none', 'cor maliciosa não vai para o estilo');
      assert.notContains(mau.getSVG(), 'display:none');
    });

    test('update(dados) troca os dados e a descrição; setOptions muda o tipo; datas e eixos continuam sem NaN', async t => {
      const ev = t.spy();
      const c = t.create({ xtype: 'chart', type: 'bar', data: MES, x: 'mes', y: ['receita', 'despesa'], title: 'Fluxo', listeners: { update: ev } });
      assert.eq(c.update([{ mes: 'a', receita: 5, despesa: 1 }]), c, 'devolve o componente');
      assert.contains(c.el.querySelector('svg').getAttribute('aria-label'), '1 ponto');
      assert.eq(ev.count, 1);
      assert.eq(caminhos(c), 2);
      c.update(MES.concat([{ mes: '2026-04-01', receita: 70, despesa: 30 }]));
      assert.eq(caminhos(c), 8);
      c.setOptions({ type: 'line' });
      assert.contains(c.el.querySelector('svg').getAttribute('aria-label'), 'Gráfico de linhas');
      assert.notOk(ruim(c.el.innerHTML));
      c.setOptions({ type: 'area', smooth: true });
      assert.notOk(ruim(c.el.innerHTML));
      assert.eq(c.type, 'area');
    });

    test('exportação: getSVG autônomo (xmlns, sem script, escapado), toDataURL e exportSVG/PNG sem baixar (stubs)', async t => {
      const c = t.create({ xtype: 'chart', type: 'line', data: MES, x: 'mes', y: 'receita', title: 'Receita <1>' });
      const svg = c.getSVG();
      assert.ok(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"'), 'SVG autônomo');
      assert.notContains(svg, '<script');
      assert.notContains(svg, 'onerror');
      assert.contains(svg, 'Receita &lt;1&gt;', 'título escapado');
      const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
      assert.eq(doc.getElementsByTagName('parsererror').length, 0, 'XML bem formado');
      assert.ok(c.toDataURL().startsWith('data:image/svg+xml;charset=utf-8,'));
      assert.eq(decodeURIComponent(c.toDataURL().split(',').slice(1).join(',')), svg, 'data URL contém o mesmo SVG');
      const real = HTMLAnchorElement.prototype.click, cria = URL.createObjectURL;
      let nome = null;
      HTMLAnchorElement.prototype.click = function () { nome = this.getAttribute('download'); };
      if (!URL.createObjectURL) URL.createObjectURL = () => 'blob:teste';
      t.cleanup(() => { HTMLAnchorElement.prototype.click = real; if (cria) URL.createObjectURL = cria; else delete URL.createObjectURL; });
      const exp = t.spy();
      c.on('export', exp);
      c.exportSVG('meu grafico');
      assert.ok(nome && /\.svg$/.test(nome), 'nome do arquivo .svg: ' + nome);
      assert.notOk(/[\\/]/.test(nome));
      assert.eq(exp.count, 1);
    });

    test('src: carrega pelo R4.http (fetch simulado), mostra estado de erro com "Tentar novamente" e recarrega', async t => {
      let n = 0;
      const m = t.mockFetch({ '/api/ch-erro': () => (++n === 1 ? { status: 500, body: { retorno: 'caiu <b>x</b>' } } : { body: MES }), '/api/ch-ok': { body: { retorno: MES } } });
      const falha = t.spy();
      const c = t.create({ xtype: 'chart', type: 'bar', src: '/api/ch-erro', x: 'mes', y: 'receita', listeners: { loaderror: falha } });
      await t.waitFor(() => falha.count === 1, 2000, 'erro de carregamento');
      assert.contains(c.el, 'Não foi possível carregar os dados.', 'mensagem de erro em português');
      assert.eq(c.el.querySelector('b'), null, 'o corpo do erro do servidor nunca vira HTML');
      const retry = [...c.el.querySelectorAll('button')].find(b => /novamente/i.test(b.textContent));
      assert.ok(retry, 'botão tentar novamente');
      retry.click();
      await t.waitFor(() => c.el.querySelectorAll('svg.r4-chart-svg path').length === 3, 2000, 'dados da segunda tentativa');
      assert.eq(m.count('/api/ch-erro'), 2);
      const ok = t.create({ xtype: 'chart', type: 'line', src: '/api/ch-ok', x: 'mes', y: 'receita' });
      await t.waitFor(() => ok.getSVG().includes('<path'), 2000, 'envelope retorno');
      const load = t.spy();
      const l = t.create({ xtype: 'chart', type: 'line', loading: true, data: [], listeners: { load } });
      assert.ok(l.el.querySelector('[aria-busy=true], .r4-chart-loading, .r4-spin'), 'loading:true mostra o estado carregando');
    });

    test('destroy: remove o gráfico e não deixa ouvintes em document/window; destruir duas vezes é seguro', async t => {
      const sobrou = await R4Test.leaks(() => {
        const c = R4.create({ xtype: 'chart', renderTo: t.box, type: 'bar', data: MES, x: 'mes', y: ['receita', 'despesa'], exportButtons: true });
        c.setTableView(true); c.setTableView(false);
        c.toggleSeries('receita');
        c.destroy(); c.destroy();
        assert.notOk(t.box.contains(c.el), 'removido do DOM');
        assert.eq(R4.get(c.id), undefined);
      });
      assert.deepEq(sobrou, [], 'ouvintes que sobraram');
      assert.eq(t.logs.take('error').length, 0);
    });

    test('sparkline: componente próprio com dados numéricos, área/suave e tamanho', t => {
      const s = t.create({ xtype: 'sparkline', data: [3, 5, 4, 8, 6], area: true, smooth: true, width: 120, height: 30 });
      const svg = s.el.querySelector('svg');
      assert.ok(svg);
      assert.eq(svg.getAttribute('role'), 'img');
      assert.notOk(ruim(s.el.innerHTML));
      assert.ok(svg.querySelectorAll('path').length >= 2, 'linha + área');
      const v = t.create({ xtype: 'sparkline', data: [] });
      assert.notOk(ruim(v.el.innerHTML), 'vazio sem NaN');
      const o = t.create({ xtype: 'sparkline', data: [{ v: 1 }, { v: 4 }, { v: 2 }], y: 'v' });
      assert.ok(o.el.querySelector('svg path'), 'linhas com y="chave"');
      s.update && s.update([1, 2, 3]);
      assert.notOk(ruim(s.el.innerHTML));
    });
  });
})();
