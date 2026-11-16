/* suíte grid: colunas, ordenação, filtro, paginação, formatos, renderer seguro, seleção, edição, rodapé,
   virtualização (20 mil linhas, layout real no navegador), estados de erro/carregando, exportação */
(() => {
  const { suite, test, assert } = R4Test;
  const nb = s => String(s).replace(/[  ]/g, ' ');
  const PESSOAS = () => [
    { id: 1, nome: 'Carla', idade: 30, cidade: 'Recife', valor: 1500.5, ativo: true, data: '2026-03-05' },
    { id: 2, nome: 'ana', idade: 25, cidade: 'São Paulo', valor: 80, ativo: false, data: '2025-12-31' },
    { id: 3, nome: 'Bruno', idade: 30, cidade: 'Recife', valor: 20, ativo: true, data: '2026-01-01' },
    { id: 4, nome: 'Davi', idade: 41, cidade: 'Natal', valor: 999.99, ativo: true, data: '2024-02-29' },
    { id: 5, nome: 'Érica', idade: null, cidade: 'Natal', valor: 0, ativo: false, data: null }
  ];
  const linhas = g => [...g.tbody.querySelectorAll('tr[aria-rowindex]')];
  const col = (g, i) => linhas(g).map(tr => tr.cells[i].textContent);
  const heads = g => [...g.thead.querySelectorAll('th')];
  const tecla = (alvo, key, extra) => alvo.dispatchEvent(new KeyboardEvent('keydown', Object.assign({ key, bubbles: true, cancelable: true }, extra)));

  suite('grid', () => {
    test('colunas automáticas (das chaves) e por lista de nomes; cabeçalho legível; role=grid', t => {
      const g = t.create({ xtype: 'grid', data: PESSOAS() });
      assert.deepEq(g.columns.map(c => c.dataIndex), ['id', 'nome', 'idade', 'cidade', 'valor', 'ativo', 'data']);
      assert.deepEq(heads(g).map(h => h.textContent).slice(0, 3), ['Id', 'Nome', 'Idade']);
      assert.eq(linhas(g).length, 5);
      assert.eq(g.table.getAttribute('role'), 'grid');
      assert.eq(g.table.getAttribute('aria-rowcount'), '6', '5 linhas + cabeçalho');
      assert.eq(g.table.getAttribute('aria-colcount'), '7');
      assert.eq(col(g, 1)[0], 'Carla');
      assert.eq(col(g, 5)[0], 'true', 'sem format: valor como texto');
      assert.eq(col(g, 2)[4], '', 'null vira célula vazia');
      const g2 = t.create({ xtype: 'grid', data: PESSOAS(), columns: ['nome', { dataIndex: 'idade', header: 'Anos' }] });
      assert.deepEq(heads(g2).map(h => h.textContent), ['Nome', 'Anos']);
      const g3 = t.create({ xtype: 'grid' });
      assert.eq(linhas(g3).length, 0);
      assert.eq(g3.tbody.querySelector('.r4-msgrow').hidden, false, 'sem dados: linha de mensagem');
      assert.eq(g3.tbody.querySelector('.r4-msgrow').textContent, 'Nenhum registro.', 'texto padrão em português');
      const g4 = t.create({ xtype: 'grid', emptyText: 'Nada aqui <b>x</b>' });
      assert.eq(g4.tbody.querySelector('.r4-msgrow').textContent, 'Nada aqui <b>x</b>', 'emptyText como texto');
    });

    test('ordenação: clique no cabeçalho alterna asc/desc, aria-sort, texto com acento/caixa e números', t => {
      const g = t.create({ xtype: 'grid', data: PESSOAS() });
      const th = heads(g)[1];
      assert.eq(th.classList.contains('r4-sortable'), true);
      th.click();
      assert.deepEq(col(g, 1), ['ana', 'Bruno', 'Carla', 'Davi', 'Érica'], 'asc: ignora caixa e acento (collator pt-BR)');
      assert.eq(heads(g)[1].getAttribute('aria-sort'), 'ascending');
      heads(g)[1].click();
      assert.deepEq(col(g, 1), ['Érica', 'Davi', 'Carla', 'Bruno', 'ana'], 'desc');
      assert.eq(heads(g)[1].getAttribute('aria-sort'), 'descending');
      assert.deepEq(g.getSorters(), [{ key: 'nome', dir: 'desc' }]);
      g.sort('valor', 'asc');
      assert.deepEq(col(g, 4), ['0', '20', '80', '999.99', '1500.5'], 'números por valor, não por texto');
      g.sort('idade', 'asc');
      assert.deepEq(col(g, 2), ['', '25', '30', '30', '41'], 'null vem primeiro em asc');
      g.setSorters([]);
      assert.deepEq(col(g, 0), ['1', '2', '3', '4', '5'], 'sem ordenação: ordem original');
      assert.deepEq(g.getSorters(), []);
    });

    test('ordenação é estável (empate mantém a ordem original) e multi-coluna com sort(chave, dir, true)', t => {
      const g = t.create({ xtype: 'grid', data: PESSOAS() });
      g.sort('idade', 'asc');
      const ids = col(g, 0);
      assert.deepEq(ids.slice(2, 4), ['1', '3'], 'Carla(1) e Bruno(3) têm 30: ficam na ordem original');
      g.sort('idade', 'desc');
      assert.deepEq(col(g, 0).slice(1, 3), ['1', '3'], 'também em desc os empates não se invertem');
      g.sort('cidade', 'asc').sort('valor', 'desc', true);
      assert.deepEq(g.getSorters(), [{ key: 'cidade', dir: 'asc' }, { key: 'valor', dir: 'desc' }]);
      assert.deepEq(col(g, 3), ['Natal', 'Natal', 'Recife', 'Recife', 'São Paulo']);
      assert.deepEq(col(g, 1), ['Davi', 'Érica', 'Carla', 'Bruno', 'ana'], 'dentro da cidade, valor decrescente');
      assert.eq(heads(g)[3].querySelector('.r4-sort').textContent, '1', 'ordem da coluna mostrada com 2+ critérios');
      const h = heads(g)[2];
      h.dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: true }));
      assert.eq(g.getSorters().length, 3, 'Shift+clique acrescenta critério');
    });

    test('ordenação: evento sortchange, sortable:false não ordena e números em texto ("a2" < "a10")', t => {
      const ev = t.spy();
      const g = t.create({ xtype: 'grid', data: [{ k: 'a10' }, { k: 'a2' }, { k: 'a1' }], columns: [{ header: 'K', dataIndex: 'k' }], listeners: { sortchange: ev } });
      g.sort('k');
      assert.deepEq(col(g, 0), ['a1', 'a2', 'a10'], 'ordenação natural (numeric collation)');
      assert.eq(ev.count, 1);
      assert.deepEq(ev.lastArgs[1], [{ key: 'k', dir: 'asc' }]);
      const g2 = t.create({ xtype: 'grid', data: [{ k: 2 }, { k: 1 }], columns: [{ header: 'K', dataIndex: 'k', sortable: false }] });
      assert.eq(heads(g2)[0].classList.contains('r4-sortable'), false);
      heads(g2)[0].click();
      assert.deepEq(col(g2, 0), ['2', '1'], 'cabeçalho não ordenável não ordena');
    });

    test('filtro: caixa de busca (debounce) e setFilter ignoram caixa/espaços; sem resultado mostra a mensagem', async t => {
      const g = t.create({ xtype: 'grid', data: PESSOAS() });
      assert.ok(g.filterEl, 'caixa de filtro existe por padrão');
      assert.eq(g.filterEl.getAttribute('aria-label'), 'Filtrar registros');
      g.filterEl.value = 'RECIFE';
      g.filterEl.dispatchEvent(new Event('input'));
      assert.eq(linhas(g).length, 5, 'debounce: ainda não filtrou');
      await t.waitFor(() => linhas(g).length === 2, 1500, 'filtro por digitação');
      assert.deepEq(col(g, 1), ['Carla', 'Bruno']);
      g.setFilter('  natal ');
      assert.deepEq(col(g, 1), ['Davi', 'Érica']);
      assert.eq(g.getView().length, 2, 'getView devolve só as filtradas');
      assert.eq(g.getData().length, 5, 'getData devolve todas');
      g.setFilter('999.99');
      assert.deepEq(col(g, 1), ['Davi'], 'busca também em números');
      g.setFilter('zzzz');
      assert.eq(linhas(g).length, 0);
      assert.eq(g.tbody.querySelector('.r4-msgrow').hidden, false);
      g.setFilter('');
      assert.eq(linhas(g).length, 5);
      assert.eq(g.filterEl.value, '', 'caixa limpa junto');
      const g2 = t.create({ xtype: 'grid', data: PESSOAS(), filter: false });
      assert.eq(g2.filterEl, undefined, 'filter:false remove a caixa');
    });

    test('paginação local: pageSize, botões anterior/próxima, setPage com limites e texto da página', t => {
      const dados = Array.from({ length: 10 }, (_, i) => ({ n: i + 1 }));
      const g = t.create({ xtype: 'grid', data: dados, pageSize: 4 });
      assert.deepEq(col(g, 0), ['1', '2', '3', '4']);
      assert.eq(g.pager.hidden, false);
      assert.contains(g.pager, '1 / 3');
      assert.contains(g.pager, '10 registros');
      const [ant, prox] = g.pager.querySelectorAll('button');
      assert.eq(ant.disabled, true, 'primeira página: anterior desabilitado');
      prox.click();
      assert.deepEq(col(g, 0), ['5', '6', '7', '8']);
      assert.contains(g.pager, '2 / 3');
      g.setPage(2);
      assert.deepEq(col(g, 0), ['9', '10'], 'última página parcial');
      assert.eq(g.pager.querySelectorAll('button')[1].disabled, true, 'última: próxima desabilitada');
      g.setPage(99);
      assert.eq(g.page, 2, 'página acima do limite é ajustada');
      g.setPage(-5);
      assert.eq(g.page, 0, 'abaixo de zero vira 0');
      g.sort('n', 'desc');
      assert.deepEq(col(g, 0), ['10', '9', '8', '7'], 'ordenar vale para todas as páginas (e mostra a primeira)');
      g.setFilter('1');
      assert.eq(g.getView().length, 2, 'filtro "1": 1 e 10');
      assert.eq(g.page, 0, 'filtrar volta à primeira página');
      assert.eq(t.create({ xtype: 'grid', data: dados }).pager.hidden, true, 'sem pageSize: sem paginador');
    });

    test('format: money, number, date (sem deslocar o dia), bytes, bool, upper — e valores vazios', t => {
      const g = t.create({ xtype: 'grid', data: PESSOAS(), columns: [
        { header: 'V', dataIndex: 'valor', format: 'money' }, { header: 'D', dataIndex: 'data', format: 'date' }, { header: 'A', dataIndex: 'ativo', format: 'bool' },
        { header: 'N', dataIndex: 'nome', format: 'upper' }, { header: 'B', dataIndex: 'id', format: 'bytes' }, { header: 'X', dataIndex: 'valor', format: 'number' }] });
      assert.deepEq(col(g, 0).map(nb), ['R$ 1.500,50', 'R$ 80,00', 'R$ 20,00', 'R$ 999,99', 'R$ 0,00']);
      assert.deepEq(col(g, 1), ['05/03/2026', '31/12/2025', '01/01/2026', '29/02/2024', ''], "'AAAA-MM-DD' mostra o mesmo dia; null vazio");
      assert.deepEq(col(g, 2), ['✔', '✖', '✔', '✔', '✖']);
      assert.deepEq(col(g, 3), ['CARLA', 'ANA', 'BRUNO', 'DAVI', 'ÉRICA']);
      assert.deepEq(col(g, 4), ['1 B', '2 B', '3 B', '4 B', '5 B']);
      assert.eq(col(g, 5)[0], '1.500,50');
      R4.formats.r4tdobro = v => String(v * 2);
      t.cleanup(() => { delete R4.formats.r4tdobro; });
      const g2 = t.create({ xtype: 'grid', data: [{ n: 4 }], columns: [{ header: 'Dobro', dataIndex: 'n', format: 'r4tdobro' }] });
      assert.eq(col(g2, 0)[0], '8', 'formato próprio em R4.formats');
    });

    test('renderer: string é TEXTO por padrão; R4.html escapa dados; R4.raw e Node são HTML; html:true é o modo antigo', t => {
      const XSS = '<img src=x onerror=window.__r4tpwn=1>';
      const g = t.create({ xtype: 'grid', data: [{ v: XSS }], columns: [
        { header: 'texto', dataIndex: 'v', renderer: v => v },
        { header: 'concat', dataIndex: 'v', renderer: v => '<b>' + v + '</b>' },
        { header: 'html', dataIndex: 'v', renderer: v => R4.html`<b class="ok">${v}</b>` },
        { header: 'raw', dataIndex: 'v', renderer: () => R4.raw('<i class="cru">fixo</i>') },
        { header: 'node', dataIndex: 'v', renderer: v => { const s = document.createElement('u'); s.textContent = v; return s; } },
        { header: 'legado', dataIndex: 'v', html: true, renderer: () => '<s class="legado">ok</s>' },
        { header: 'numero', dataIndex: 'v', renderer: () => 42 }] });
      const tr = linhas(g)[0];
      assert.eq(tr.cells[0].textContent, XSS, 'string do renderer vira texto');
      assert.eq(tr.cells[1].textContent, '<b>' + XSS + '</b>', 'concatenar tags não vira HTML');
      assert.eq(tr.cells[1].querySelector('b'), null);
      assert.eq(tr.cells[2].querySelector('b.ok').textContent, XSS, 'R4.html escapa o dado e mantém a tag do autor');
      assert.eq(tr.cells[3].querySelector('i.cru').textContent, 'fixo', 'R4.raw é HTML');
      assert.eq(tr.cells[4].querySelector('u').textContent, XSS, 'Node é anexado');
      assert.eq(tr.cells[5].querySelector('s.legado').textContent, 'ok', 'html:true mantém o modo antigo');
      assert.eq(tr.cells[6].textContent, '42');
      assert.eq(g.tbody.querySelectorAll('img').length, 0, 'nenhum <img> criado');
      assert.eq(window.__r4tpwn, undefined);
    });

    test('cabeçalho, rodapé e filtro com HTML hostil continuam texto', t => {
      const XSS = '<script>window.__r4tpwn=1</script>';
      const g = t.create({ xtype: 'grid', data: [{ a: 1 }], emptyText: XSS, summaryLabel: XSS, columns: [{ header: XSS, dataIndex: 'a', summary: 'sum' }] });
      assert.eq(heads(g)[0].textContent, XSS);
      assert.eq(g.tfoot.rows[0].cells[0].textContent, '1', 'a coluna com summary mostra a soma');
      g.setFilter(XSS);
      assert.eq(g.tbody.querySelector('.r4-msgrow').textContent, XSS);
      assert.eq(g.el.querySelectorAll('script').length, 0);
      const g2 = t.create({ xtype: 'grid', data: [{ a: 1, b: 2 }], summaryLabel: XSS, columns: [{ header: 'A', dataIndex: 'a' }, { header: 'B', dataIndex: 'b', summary: 'sum' }] });
      assert.eq(g2.tfoot.rows[0].cells[0].textContent, XSS, 'summaryLabel como texto');
      assert.eq(window.__r4tpwn, undefined);
    });

    test('seleção única: clique marca a linha, troca a seleção, evento selectionchange, aria-selected', t => {
      const ev = t.spy();
      const g = t.create({ xtype: 'grid', data: PESSOAS(), selectable: 'single', listeners: { selectionchange: ev } });
      const trs = linhas(g);
      trs[1].cells[1].click();
      assert.eq(g.getSelection().length, 1);
      assert.eq(g.getSelection()[0].nome, 'ana');
      assert.ok(trs[1].classList.contains('r4-selected'));
      assert.eq(trs[1].getAttribute('aria-selected'), 'true');
      assert.eq(trs[0].getAttribute('aria-selected'), 'false');
      trs[3].cells[1].click();
      assert.deepEq(g.getSelection().map(r => r.nome), ['Davi'], 'selecionar outra troca a seleção');
      assert.eq(ev.count, 2);
      assert.eq(ev.lastArgs[1][0].id, 4, 'evento recebe as linhas selecionadas');
      g.clearSelection();
      assert.eq(g.getSelection().length, 0);
      g.select(PESSOAS()[0]);
      assert.eq(g.isSelected(g.getData()[0]), true, 'select() por programa (chave = idProperty)');
      assert.eq(linhas(g)[0].classList.contains('r4-selected'), true);
      assert.eq(t.create({ xtype: 'grid', data: PESSOAS() }).table.querySelector('[aria-selected]'), null, 'sem selectable: sem aria-selected');
    });

    test('seleção múltipla: checkbox por linha, Ctrl+clique, Shift+clique, selecionar todas (só as filtradas) e indeterminado', t => {
      const g = t.create({ xtype: 'grid', data: PESSOAS(), selectable: 'multi' });
      assert.ok(g.table.querySelector('.r4-check-all'), 'checkbox de selecionar todos');
      assert.eq(g.table.getAttribute('aria-multiselectable'), 'true');
      const trs = linhas(g);
      trs[0].querySelector('.r4-check').click();
      trs[2].querySelector('.r4-check').click();
      assert.deepEq(g.getSelection().map(r => r.id), [1, 3], 'checkbox alterna cada linha');
      assert.eq(g._all.indeterminate, true, 'cabeçalho indeterminado');
      assert.eq(trs[0].querySelector('.r4-check').checked, true);
      trs[2].querySelector('.r4-check').click();
      assert.deepEq(g.getSelection().map(r => r.id), [1], 'desmarcar tira da seleção');
      g.setFilter('natal');
      g._all.click();
      assert.deepEq(g.getSelection().map(r => r.id).sort(), [1, 4, 5], 'selecionar todos pega as linhas filtradas');
      g.setFilter('');
      g.clearSelection();
      trs[1].cells[1].click();
      trs[3].cells[1].dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: true }));
      assert.deepEq(g.getSelection().map(r => r.id).sort(), [2, 3, 4], 'Shift+clique seleciona o intervalo');
      trs[0].cells[1].dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true }));
      assert.eq(g.getSelection().length, 4, 'Ctrl+clique soma');
      g.selectAll();
      assert.eq(g.getSelection().length, 5);
      assert.eq(g._all.checked, true);
      g.deselect(g.getData()[0]);
      assert.eq(g.getSelection().length, 4);
      g.select(r => r.ativo, false);
      assert.deepEq(g.getSelection().map(r => r.id), [1, 3, 4], 'select(fn) escolhe entre as linhas');
    });

    test('teclado (role=grid): setas movem a célula ativa, Enter seleciona, Home/End, F2 e Esc não quebram', t => {
      const g = t.create({ xtype: 'grid', data: PESSOAS(), selectable: 'single' });
      const tab = () => g.table.querySelector('[tabindex="0"]');
      assert.ok(tab(), 'uma célula com tabindex=0 (foco móvel)');
      const c0 = linhas(g)[0].cells[0];
      tecla(c0, 'ArrowDown');
      assert.eq(g._act.r, 1, 'seta para baixo');
      tecla(linhas(g)[1].cells[0], 'ArrowRight');
      assert.eq(g._act.c, 1, 'seta para a direita');
      tecla(linhas(g)[1].cells[1], 'End');
      assert.eq(g._act.c, 6, 'End vai à última coluna');
      tecla(linhas(g)[1].cells[6], 'Home');
      assert.eq(g._act.c, 0, 'Home à primeira');
      tecla(linhas(g)[1].cells[0], 'End', { ctrlKey: true });
      assert.eq(g._act.r, 4, 'Ctrl+End última linha');
      tecla(linhas(g)[4].cells[0], 'ArrowDown');
      assert.eq(g._act.r, 4, 'não passa do fim');
      tecla(linhas(g)[4].cells[0], 'Enter');
      assert.deepEq(g.getSelection().map(r => r.id), [5], 'Enter seleciona a linha ativa');
      assert.eq(tab(), linhas(g)[4].cells[0], 'o tabindex=0 acompanha a célula ativa');
      tecla(linhas(g)[4].cells[0], 'ArrowUp', { ctrlKey: false });
      tecla(linhas(g)[3].cells[0], 'ArrowUp');
      tecla(linhas(g)[2].cells[0], 'ArrowUp');
      tecla(linhas(g)[1].cells[0], 'ArrowUp');
      tecla(linhas(g)[0].cells[0], 'ArrowUp');
      assert.eq(g._act.r, -1, 'a seta para cima chega ao cabeçalho');
      tecla(heads(g)[1], 'Enter');
      assert.deepEq(g.getSorters(), [{ key: 'nome', dir: 'asc' }], 'Enter no cabeçalho ordena');
    });

    test('edição na célula: duplo clique/F2, Enter confirma com eventos, Esc cancela, beforecellchange cancela, tipos', t => {
      const antes = t.spy(), depois = t.spy();
      const g = t.create({ xtype: 'grid', data: PESSOAS(), columns: [
        { header: 'Nome', dataIndex: 'nome', editable: true }, { header: 'Idade', dataIndex: 'idade', editable: 'number' },
        { header: 'Cidade', dataIndex: 'cidade', editable: { options: ['Recife', 'Natal', { value: 'SP', text: 'São Paulo' }] } }, { header: 'Valor', dataIndex: 'valor', summary: 'sum' }],
        listeners: { beforecellchange: antes, cellchange: depois } });
      assert.eq(linhas(g)[0].cells[0].classList.contains('r4-editable'), true);
      assert.eq(g.startEdit(0, 'nome'), true);
      const inp = g.tbody.querySelector('.r4-cell-editor');
      assert.ok(inp, 'editor aberto');
      assert.eq(inp.value, 'Carla');
      inp.value = 'Carla Maria';
      tecla(inp, 'Enter');
      assert.eq(g.getData()[0].nome, 'Carla Maria', 'valor gravado na linha');
      assert.eq(linhas(g)[0].cells[0].textContent, 'Carla Maria');
      assert.eq(g.tbody.querySelector('.r4-cell-editor'), null, 'editor fechou');
      assert.eq(depois.count, 1);
      const ctx = depois.lastArgs[1];
      assert.eq(ctx.field, 'nome');
      assert.eq(ctx.value, 'Carla Maria');
      assert.eq(ctx.oldValue, 'Carla');
      assert.eq(ctx.row, g.getData()[0]);
      g.startEdit(1, 'nome');
      const i2 = g.tbody.querySelector('.r4-cell-editor');
      i2.value = 'XXXX';
      tecla(i2, 'Escape');
      assert.eq(g.getData()[1].nome, 'ana', 'Esc descarta');
      assert.eq(depois.count, 1);
      g.startEdit(0, 'idade');
      const n = g.tbody.querySelector('.r4-cell-editor');
      assert.eq(n.type, 'number');
      n.value = '31.5';
      tecla(n, 'Enter');
      assert.eq(g.getData()[0].idade, 31.5, 'tipo number: grava número (não texto)');
      g.startEdit(0, 'idade');
      const n2 = g.tbody.querySelector('.r4-cell-editor');
      n2.value = '';
      tecla(n2, 'Enter');
      assert.eq(g.getData()[0].idade, null, 'vazio vira null');
      g.startEdit(0, 'cidade');
      const s = g.tbody.querySelector('select.r4-cell-editor');
      assert.deepEq([...s.options].map(o => o.value), ['Recife', 'Natal', 'SP']);
      s.value = 'SP';
      tecla(s, 'Enter');
      assert.eq(g.getData()[0].cidade, 'SP', 'select grava o value da opção');
      assert.eq(g.startEdit(0, 'valor'), false, 'coluna sem editable não abre editor');
      assert.eq(antes.count, 4, 'beforecellchange antes de cada gravação');
      antes.reset();
      g.un('beforecellchange', antes);
      g.on('beforecellchange', () => false);
      g.startEdit(2, 'nome');
      const i3 = g.tbody.querySelector('.r4-cell-editor');
      i3.value = 'Barrado';
      tecla(i3, 'Enter');
      assert.eq(g.getData()[2].nome, 'Bruno', 'beforecellchange retornando false cancela');
      assert.eq(linhas(g)[2].cells[0].textContent, 'Bruno', 'a célula volta ao valor original');
    });

    test('rodapé de resumo: sum/avg/count/min/max/função, acompanha o filtro e as edições, rótulo configurável', t => {
      const g = t.create({ xtype: 'grid', data: PESSOAS(), summaryLabel: 'TOTAIS', columns: [
        { header: 'Nome', dataIndex: 'nome' }, { header: 'Idade', dataIndex: 'idade', summary: 'avg' }, { header: 'Valor', dataIndex: 'valor', summary: 'sum', format: 'money', editable: true },
        { header: 'Qtd', dataIndex: 'id', summary: 'count' }, { header: 'Mín', dataIndex: 'id', summary: 'min' }, { header: 'Máx', dataIndex: 'id', summary: 'max' },
        { header: 'Fn', dataIndex: 'id', summary: vals => vals.length * 100 }] });
      assert.eq(g.tfoot.hidden, false);
      const c = () => [...g.tfoot.rows[0].cells].map(td => nb(td.textContent));
      assert.deepEq(c(), ['TOTAIS', '31,50', 'R$ 2.600,49', '5', '1', '5', '500']);
      g.setFilter('davi');
      assert.deepEq(c(), ['TOTAIS', '41', 'R$ 999,99', '1', '4', '4', '100'], 'o resumo acompanha o filtro');
      g.setFilter('');
      g.startEdit(1, 'valor');
      const i = g.tbody.querySelector('.r4-cell-editor');
      i.value = '1000';
      tecla(i, 'Enter');
      assert.eq(c()[2], 'R$ 3.520,49', 'editar uma célula atualiza o total');
      const g2 = t.create({ xtype: 'grid', data: [{ a: 1 }] });
      assert.eq(g2.tfoot.hidden, true, 'sem summary: rodapé oculto');
      const g3 = t.create({ xtype: 'grid', data: [{ a: 'x' }], columns: [{ header: 'A', dataIndex: 'a', summary: 'sum' }, { header: 'B', dataIndex: 'a', summary: 'avg' }] });
      assert.deepEq([...g3.tfoot.rows[0].cells].map(td => td.textContent), ['0', ''], 'texto: soma 0 e média vazia');
    });

    test('colunas: ocultar/mostrar mantém ao menos uma; menu de colunas e de exportação abrem e fecham com Esc', t => {
      const g = t.create({ xtype: 'grid', data: PESSOAS(), columns: [{ header: 'Nome', dataIndex: 'nome' }, { header: 'Idade', dataIndex: 'idade' }], columnMenu: true, exportable: true });
      const mudou = t.spy();
      g.on('columnchange', mudou);
      g.hideColumn('idade');
      assert.deepEq(heads(g).map(h => h.textContent), ['Nome']);
      assert.eq(linhas(g)[0].cells.length, 1);
      assert.eq(mudou.count, 1);
      g.hideColumn('nome');
      assert.eq(heads(g).length, 1, 'sempre sobra uma coluna');
      g.showColumn('idade');
      assert.deepEq(heads(g).map(h => h.textContent), ['Nome', 'Idade']);
      const [bc, be] = g.el.querySelectorAll('.r4-grid-tool');
      assert.eq(bc.getAttribute('aria-expanded'), 'false');
      bc.click();
      const menu = document.querySelector('.r4-grid-menu');
      assert.ok(menu, 'menu de colunas abriu no body');
      assert.eq(menu.getAttribute('role'), 'menu');
      assert.eq(bc.getAttribute('aria-expanded'), 'true');
      assert.eq(menu.querySelectorAll('input[type=checkbox]').length, 2);
      const cb = menu.querySelector('input[data-ci="1"]');
      cb.checked = false;
      cb.dispatchEvent(new Event('change', { bubbles: true }));
      assert.deepEq(heads(g).map(h => h.textContent), ['Nome'], 'checkbox oculta a coluna');
      tecla(menu, 'Escape');
      assert.eq(document.querySelector('.r4-grid-menu'), null, 'Esc fecha o menu');
      assert.eq(bc.getAttribute('aria-expanded'), 'false');
      be.click();
      const mx = document.querySelector('.r4-grid-menu');
      assert.deepEq([...mx.querySelectorAll('[data-k]')].map(b => b.getAttribute('data-k')), ['csv', 'xlsx', 'json', 'print']);
      g.destroy();
      assert.eq(document.querySelector('.r4-grid-menu'), null, 'destroy remove o menu aberto');
    });

    test('coluna de ações: handler recebe a linha, evento action, {campo} no r4-click sem ";" encadeando', t => {
      const h = t.spy(), ev = t.spy();
      const g = t.create({ xtype: 'grid', data: [{ id: 7, nome: 'Zé;toast:injetado' }], listeners: { action: ev }, columns: [{ header: 'Nome', dataIndex: 'nome' },
        { header: 'Ações', actions: [{ text: 'Editar', handler: h }, { text: 'Avisar', 'r4-click': 'toast:Olá {nome} ({id})' }, { text: 'Apagar', 'r4-click': 'toast:ok', 'r4-confirm': 'Apagar {nome}?' }] }] });
      const b = g.tbody.querySelectorAll('.r4-grid-act');
      assert.eq(b.length, 3);
      assert.eq(heads(g)[1].classList.contains('r4-sortable'), false, 'coluna de ações não ordena');
      b[0].click();
      assert.eq(h.count, 1);
      assert.eq(h.lastArgs[0].id, 7, 'handler(linha, grid, evento)');
      assert.eq(h.lastArgs[1], g);
      assert.eq(ev.lastArgs[2].id, 7, 'evento action(grid, nome, linha)');
      assert.eq(b[1].getAttribute('r4-click'), 'toast:Olá Zé toast:injetado (7)', '";" do dado não vira outra ação');
      assert.eq(b[2].getAttribute('r4-confirm'), 'Apagar Zé toast:injetado?');
      b[1].click();
      const toasts = [...document.querySelectorAll('.r4-toast')].map(x => x.textContent);
      assert.deepEq(toasts, ['Olá Zé toast:injetado (7)'], 'só uma ação executou');
    });

    test('loadData troca os dados, volta à página 0, zera a seleção e dispara load; getData/getView são cópias', t => {
      const load = t.spy(), sel = t.spy();
      const dados = Array.from({ length: 12 }, (_, i) => ({ id: i + 1 }));
      const g = t.create({ xtype: 'grid', data: dados, pageSize: 5, selectable: 'single', listeners: { load, selectionchange: sel } });
      g.setPage(2);
      g.select(dados[0]);
      assert.eq(sel.count, 1);
      g.loadData([{ id: 100 }, { id: 101 }]);
      assert.eq(g.page, 0);
      assert.eq(g.getSelection().length, 0, 'seleção zerada');
      assert.eq(sel.count, 2, 'e avisada');
      assert.eq(load.count, 1);
      assert.deepEq(col(g, 0), ['100', '101']);
      const copia = g.getData();
      copia.push({ id: 5 });
      assert.eq(g.getData().length, 2, 'getData devolve cópia');
      g.loadData(null);
      assert.eq(g.getData().length, 0, 'valor inválido vira lista vazia');
    });

    test('virtualização: 20 mil linhas — só dezenas de <tr> no DOM, espaçadores mantêm a altura, rolar atualiza a janela', async t => {
      const dados = VitrineData.rows(20000);
      const g = t.create({ xtype: 'grid', data: dados, height: 400 });
      const rhs = () => linhas(g).map(tr => +tr.getAttribute('aria-rowindex'));
      assert.eq(g._v, true, 'virtual automático acima de 1000 linhas');
      assert.eq(g.getView().length, 20000);
      assert.lt(linhas(g).length, 80, 'só a janela visível + folga existe no DOM');
      assert.gt(linhas(g).length, 5);
      assert.eq(rhs()[0], 2, 'começa na primeira linha');
      assert.eq(col(g, 0)[0], String(dados[0].id));
      assert.lt(g.tbody.querySelectorAll('tr').length, 80, 'total de <tr> do tbody');
      assert.contains(g.pager, '20.000 registros', 'contador no lugar do paginador');
      assert.eq(g.table.getAttribute('aria-rowcount'), '20001');
      if (t.hasLayout()) {
        assert.near(g.scroller.clientHeight, 400, 20, 'contêiner com a altura pedida (layout real)');
        assert.gt(g.scroller.scrollHeight, 20000 * 30, 'altura total da rolagem preservada pelos espaçadores');
      }
      g.scroller.scrollTop = 36 * 10000;
      g.scroller.dispatchEvent(new Event('scroll'));
      await t.waitFor(() => rhs().includes(10002), 2500, 'janela perto da linha 10.000 (usa requestAnimationFrame: aba visível)');
      assert.lt(linhas(g).length, 80, 'continua com poucas linhas');
      assert.ok(rhs().every(n => n > 9900 && n < 10100), 'todas as linhas renderizadas ficam perto de 10.000: ' + rhs()[0] + '…' + rhs().at(-1));
      assert.eq(col(g, 0)[rhs().indexOf(10002)], String(dados[10000].id), 'a linha certa com os dados certos');
      g.scroller.scrollTop = 36 * 20000;   // além do fim: o navegador limita ao máximo
      g.scroller.dispatchEvent(new Event('scroll'));
      await t.waitFor(() => rhs().includes(20001), 2500, 'última linha');
      assert.eq(col(g, 0).at(-1), String(dados[19999].id));
      g.scroller.scrollTop = 0;
      g.scroller.dispatchEvent(new Event('scroll'));
      await t.waitFor(() => rhs()[0] === 2, 2500, 'volta ao topo');
    }, { timeout: 15000 });

    test('virtualização: ordenar e filtrar 20 mil linhas atualiza a janela e o contador', async t => {
      const dados = VitrineData.rows(20000);
      const g = t.create({ xtype: 'grid', data: dados, height: 400 });
      const t0 = performance.now();
      g.sort('valor', 'desc');
      const ms = performance.now() - t0;
      const maior = Math.max(...dados.map(r => r.valor));
      assert.eq(Number(col(g, 2)[0]), maior, 'primeira linha é o maior valor');
      assert.lt(ms, 2000, 'ordenar 20 mil linhas leva menos de 2 s (levou ' + Math.round(ms) + ' ms)');
      assert.lt(linhas(g).length, 80);
      const alvo = dados[1234].nome;
      g.setFilter(alvo);
      const n = dados.filter(r => String(r.nome).toLowerCase().includes(alvo.toLowerCase()) || Object.values(r).some(v => String(v ?? '').toLowerCase().includes(alvo.toLowerCase()))).length;
      assert.eq(g.getView().length, n, 'filtro conta igual ao cálculo direto');
      assert.gt(n, 0);
      assert.ok(linhas(g).length <= Math.min(n, 80));
      g.setFilter('texto-que-nao-existe-r4t');
      assert.eq(linhas(g).length, 0);
      assert.eq(g.tbody.querySelector('.r4-msgrow').hidden, false);
    }, { timeout: 15000 });

    test('estado de erro: HTTP 500 mostra a mensagem, dispara loaderror, "Tentar de novo" recarrega; dados antigos ficam', async t => {
      let tentativas = 0;
      const m = t.mockFetch({ '/api/g-erro': () => (++tentativas === 1 ? { status: 500, body: { retorno: 'quebrou <b>feio</b>' } } : { body: [{ a: 1 }, { a: 2 }] }) });
      const falha = t.spy();
      const g = t.create({ xtype: 'grid', src: '/api/g-erro', listeners: { loaderror: falha } });
      await t.waitFor(() => g.tbody.querySelector('.r4-grid-err'), 2000, 'estado de erro');
      const msg = g.tbody.querySelector('.r4-grid-err');
      assert.contains(msg, 'Falha ao carregar.');
      assert.contains(msg, 'HTTP 500: quebrou <b>feio</b>', 'mensagem do servidor como texto');
      assert.eq(msg.querySelector('b'), null, 'sem HTML da resposta');
      assert.eq(falha.count, 1);
      assert.eq(g.el.getAttribute('aria-busy'), 'false');
      const retry = msg.querySelector('.r4-grid-retry');
      assert.ok(retry, 'botão de nova tentativa');
      retry.click();
      await t.waitFor(() => linhas(g).length === 2, 2000, 'dados da segunda tentativa');
      assert.eq(m.count('/api/g-erro'), 2);
      assert.eq(g.tbody.querySelector('.r4-msgrow').hidden, true, 'linha de mensagem some depois do sucesso');
      assert.eq(g.tbody.querySelector('.r4-msgrow').textContent, '', 'e sem o texto do erro');
    });

    test('estados de erro: JSON inválido, corpo {status:500} em HTTP 200, resposta sem lista, 404', async t => {
      t.mockFetch({ '/api/g-lixo': { body: 'isto não é json', headers: { 'content-type': 'text/plain' } }, '/api/g-st': { body: { status: 500, retorno: 'erro lógico' } },
        '/api/g-obj': { body: { retorno: { nao: 'lista' } } }, '/api/g-404': { status: 404, body: { mensagem: 'sumiu' } } });
      const casos = [['/api/g-lixo', 'não é JSON válido'], ['/api/g-st', 'erro lógico'], ['/api/g-obj', 'sem lista'], ['/api/g-404', 'HTTP 404: sumiu']];
      for (const [src, trecho] of casos) {
        const g = t.create({ xtype: 'grid', src });
        await t.waitFor(() => g.tbody.querySelector('.r4-grid-err'), 2000, 'erro de ' + src);
        assert.contains(g.tbody.querySelector('.r4-grid-err'), trecho, src);
        assert.eq(linhas(g).length, 0);
      }
    });

    test('estado carregando: mask visível e aria-busy durante a requisição; formatos do envelope (retorno/data/rows)', async t => {
      t.mockFetch({ '/api/g-lento': { body: [{ a: 1 }], delay: 200 }, '/api/g-ret': { body: { status: 200, retorno: [{ a: 1 }] } }, '/api/g-data': { body: { data: [{ a: 1 }, { a: 2 }] } }, '/api/g-rows': { body: { rows: [{ a: 9 }] } } });
      const g = t.create({ xtype: 'grid', src: '/api/g-lento' });
      assert.eq(g.el.getAttribute('aria-busy'), 'true', 'ocupado enquanto carrega');
      assert.eq(g.mask.hidden, false, 'máscara visível');
      assert.contains(g.mask, 'Carregando');
      await t.waitFor(() => linhas(g).length === 1, 2000, 'dados');
      assert.eq(g.mask.hidden, true);
      assert.eq(g.el.getAttribute('aria-busy'), 'false');
      for (const [u, n] of [['/api/g-ret', 1], ['/api/g-data', 2], ['/api/g-rows', 1]]) {
        const x = t.create({ xtype: 'grid', src: u });
        await t.waitFor(() => linhas(x).length === n, 2000, u);
      }
    });

    test('modo remote: envia page/size/sort/dir/q na URL, usa o total do servidor e refaz a busca ao paginar/ordenar/filtrar', async t => {
      const todos = Array.from({ length: 23 }, (_, i) => ({ id: i + 1, nome: 'Linha ' + (i + 1) }));
      const m = t.mockFetch({ '/api/g-remoto': req => {
        const p = req.url.searchParams, page = +p.get('page'), size = +p.get('size');
        return { body: { status: 200, total: 23, retorno: todos.slice((page - 1) * size, page * size) } };
      } });
      const g = t.create({ xtype: 'grid', src: '/api/g-remoto', remote: true, pageSize: 10, columns: [{ header: 'Id', dataIndex: 'id' }, { header: 'Nome', dataIndex: 'nome' }] });
      await t.waitFor(() => linhas(g).length === 10, 2000, 'primeira página');
      let q = m.calls.at(-1).url.searchParams;
      assert.eq(q.get('page'), '1');
      assert.eq(q.get('size'), '10');
      assert.eq(q.get('sort'), null, 'sem ordenação: sem sort');
      assert.contains(g.pager, '1 / 3', 'total do servidor define as páginas');
      assert.contains(g.pager, '23 registros');
      g.setPage(2);
      await t.waitFor(() => col(g, 0)[0] === '21', 2000, 'página 3');
      assert.eq(m.calls.at(-1).url.searchParams.get('page'), '3');
      assert.eq(linhas(g).length, 3, 'última página tem 3');
      g.sort('nome', 'desc');
      await t.waitFor(() => m.calls.at(-1).url.searchParams.get('sort') === 'nome', 2000, 'ordenação no servidor');
      q = m.calls.at(-1).url.searchParams;
      assert.eq(q.get('dir'), 'desc');
      assert.eq(q.get('page'), '1', 'ordenar volta à página 1');
      g.setFilter('Linha 7');
      await t.waitFor(() => m.calls.at(-1).url.searchParams.get('q') === 'linha 7', 2000, 'filtro no servidor');
    });

    test('requisição obsoleta é descartada: resposta antiga não sobrescreve a mais nova', async t => {
      const m = t.mockFetch({ '/api/g-corrida': req => (req.url.searchParams.get('v') === 'a' ? { body: [{ v: 'antiga' }], delay: 150 } : { body: [{ v: 'nova' }], delay: 10 }) });
      const g = t.create({ xtype: 'grid', src: '/api/g-corrida?v=a' });
      g.src = '/api/g-corrida?v=b';
      g.load();
      await t.waitFor(() => linhas(g).length === 1, 2000, 'dados');
      await t.sleep(250);
      assert.eq(col(g, 0)[0], 'nova', 'a resposta mais lenta (antiga) foi descartada');
      assert.eq(m.calls.length, 2);
    });

    test('exportação: CSV (; e vírgula decimal, só filtradas/ordenadas/visíveis), JSON e XLSX — geradas sem baixar arquivo', async t => {
      const baixados = [], real = R4.files.download;
      R4.files.download = (conteudo, nome, mime) => { baixados.push({ conteudo, nome, mime }); return conteudo; };
      t.cleanup(() => { R4.files.download = real; });
      const g = t.create({ xtype: 'grid', data: PESSOAS(), exportName: 'pessoas', columns: [{ header: 'Nome', dataIndex: 'nome' }, { header: 'Valor', dataIndex: 'valor' }, { header: 'Cidade', dataIndex: 'cidade' }, { header: 'Ações', actions: [{ text: 'x' }] }] });
      const ev = t.spy();
      g.on('export', ev);
      g.sort('valor', 'desc');
      g.setFilter('natal');
      g.exportCSV();
      const csv = baixados[0];
      assert.eq(csv.nome, 'pessoas.csv');
      assert.contains(csv.mime, 'text/csv');
      assert.eq(csv.conteudo.charCodeAt(0), 0xFEFF, 'BOM para o Excel abrir em UTF-8');
      assert.eq(csv.conteudo.slice(1), 'Nome;Valor;Cidade\r\nDavi;999,99;Natal\r\nÉrica;0;Natal\r\n', 'filtrado, ordenado, sem a coluna de ações, vírgula decimal');
      g.hideColumn('cidade');
      g.exportCSV('outro.csv');
      assert.eq(baixados[1].nome, 'outro.csv');
      assert.eq(baixados[1].conteudo.slice(1), 'Nome;Valor\r\nDavi;999,99\r\nÉrica;0\r\n', 'coluna oculta não sai');
      g.exportJSON('dados');
      assert.eq(baixados[2].nome, 'dados.json');
      assert.deepEq(JSON.parse(baixados[2].conteudo), [{ nome: 'Davi', valor: 999.99 }, { nome: 'Érica', valor: 0 }], 'JSON só com as colunas visíveis');
      g.exportXLSX('planilha');
      assert.eq(baixados[3].nome, 'planilha.xlsx');
      const bin = baixados[3].conteudo;
      assert.ok(bin instanceof Blob, 'XLSX é um Blob');
      const buf = await new Promise(ok => { const r = new FileReader(); r.onload = () => ok(new Uint8Array(r.result)); r.readAsArrayBuffer(bin); });
      assert.deepEq([...buf.slice(0, 4)], [0x50, 0x4B, 0x03, 0x04], 'assinatura ZIP (PK..)');
      assert.eq(ev.count, 4, 'evento export por arquivo');
      assert.deepEq(ev.calls.map(c => c[1]), ['csv', 'csv', 'json', 'xlsx']);
    });

    test('impressão: o HTML de impressão escapa tudo e o iframe é sandbox sem scripts (sem abrir o diálogo de impressão)', t => {
      // o grid chama print() no "load" do iframe: aqui o ouvinte de load é descartado para nunca abrir o diálogo do navegador
      const proto = HTMLIFrameElement.prototype, real = proto.addEventListener;
      proto.addEventListener = function (tipo, ...r) { return tipo === 'load' ? undefined : real.call(this, tipo, ...r); };
      t.cleanup(() => { delete proto.addEventListener; });
      const g = t.create({ xtype: 'grid', data: [{ n: '<img src=x onerror=alert(1)>' }], columns: [{ header: '<script>x</script>', dataIndex: 'n' }] });
      const html = g._printHtml('<svg onload=alert(1)>');
      const corpo = html.slice(html.indexOf('<body>'));
      assert.notOk(/<img|<script|<svg/i.test(corpo), 'nada de tag ativa no corpo');
      assert.contains(html, '&lt;img src=x onerror=alert(1)&gt;');
      assert.contains(html, '&lt;svg onload=alert(1)&gt;', 'título escapado');
      g.print('Relatório');
      const f = document.querySelector('iframe.r4-print-frame');
      assert.ok(f, 'iframe de impressão criado');
      assert.notOk(/allow-scripts/.test(f.getAttribute('sandbox') || 'allow-scripts'), 'sandbox sem allow-scripts');
      assert.eq(f.getAttribute('aria-hidden'), 'true');
      assert.contains(f.srcdoc, '&lt;img src=x');
      g.destroy();
      assert.eq(document.querySelector('iframe.r4-print-frame'), null, 'destroy remove o iframe');
    });

    test('destroy: remove o elemento, o menu, os ouvintes da página e ignora respostas atrasadas', async t => {
      t.mockFetch({ '/api/g-tarde': { body: [{ a: 1 }], delay: 80 } });
      const g = t.create({ xtype: 'grid', src: '/api/g-tarde', exportable: true });
      const el = g.el;
      g.el.querySelector('.r4-grid-tool').click();
      assert.ok(document.querySelector('.r4-grid-menu'));
      g.destroy();
      assert.notOk(t.box.contains(el), 'fora do DOM');
      assert.eq(document.querySelector('.r4-grid-menu'), null);
      assert.eq(R4.get(g.id), undefined);
      await t.sleep(160);
      assert.eq(g.data.length, 0, 'a resposta que chegou depois não alterou o grid destruído');
      g.destroy();
      g.setFilter('x');
    });

    /* ======== destaque da busca (r4-hit) ======== */
    const hits = g => linhas(g).map(tr => [...tr.cells].map((td, i) => td.classList.contains('r4-hit') ? i : -1).filter(i => i >= 0));
    const RC = () => [{ id: 1, nome: 'Rafaela', cidade: 'Recife' }, { id: 2, nome: 'Zeca', cidade: 'Recife' }, { id: 3, nome: 'Tiago', cidade: 'Natal' }];

    test('destaque: buscar "r" marca nome e cidade de Rafaela, só a cidade de Zeca; limpar o filtro tira as marcas', t => {
      const g = t.create({ xtype: 'grid', data: RC(), columns: ['nome', 'cidade'] });
      assert.deepEq(hits(g), [[], [], []], 'sem filtro: nada marcado');
      g.setFilter('r');
      assert.eq(linhas(g).length, 2, 'Tiago/Natal não casa');
      assert.deepEq(hits(g), [[0, 1], [1]], 'Rafaela: nome e cidade; Zeca: só a cidade');
      g.setFilter('REC');
      assert.deepEq(hits(g), [[1], [1]], 'sem diferença de maiúsculas');
      g.setFilter('');
      assert.deepEq(hits(g), [[], [], []], 'filtro limpo: marcas somem');
    });

    test('destaque: usa o texto exibido (renderer) e o valor bruto; highlight=false desliga; coluna de ações nunca marca', t => {
      const g = t.create({ xtype: 'grid', data: [{ id: 1, nome: 'Ana', cod: 'x1' }, { id: 2, nome: 'Bia', cod: 'x2' }],
        columns: [{ dataIndex: 'nome', renderer: v => v.toUpperCase() }, { dataIndex: 'cod', renderer: () => '—' }, { actions: [{ text: 'Ana' }] }] });
      g.setFilter('ana');
      assert.eq(linhas(g).length, 1);
      assert.deepEq(hits(g), [[0]], 'texto exibido (ANA) casa; o botão "Ana" da coluna de ações não marca');
      g.setFilter('x1');
      assert.deepEq(hits(g), [[1]], 'o renderer mostra "—", mas o valor bruto (x1) casou');
      const h = t.create({ xtype: 'grid', data: RC(), columns: ['nome', 'cidade'], highlight: false });
      h.setFilter('r');
      assert.deepEq(hits(h), [[], []], 'highlight:false: filtra mas não marca');
    });

    test('destaque: padrão true e atributo HTML highlight="false"', t => {
      assert.eq(t.create({ xtype: 'grid', data: RC(), columns: ['nome'] }).highlight, true);
      t.html('<r4-grid id="g-hl-off" highlight="false"></r4-grid>');
      assert.eq(R4.get('g-hl-off').highlight, false);
    });

    test('destaque: virtualizado reaproveita <tr> — marca some quando a célula deixa de casar e vale depois de rolar', async t => {
      const dados = Array.from({ length: 3000 }, (_, i) => ({ id: i + 1, nome: 'Linha ' + (i + 1), cidade: i % 2 ? 'Natal' : 'Recife' }));
      const g = t.create({ xtype: 'grid', data: dados, columns: ['id', 'nome', 'cidade'], virtual: true, height: 300 });
      g.setFilter('recife');
      let termo = 'recife';
      const ok = () => linhas(g).every(tr => [...tr.cells].every(td => td.classList.contains('r4-hit') === td.textContent.toLowerCase().includes(termo)));
      assert.ok(linhas(g).length > 3 && ok(), 'marcas coerentes na primeira janela');
      assert.ok(hits(g).every(h => h.length === 1 && h[0] === 2), 'só a coluna cidade');
      g.scroller.scrollTop = 20000;
      await t.waitFor(() => +col(g, 0)[0] > 100 && ok(), 3000, 'depois de rolar');
      termo = '7'; g.setFilter('7');
      await t.waitFor(() => linhas(g).length > 0 && ok(), 3000, 'filtro novo reaproveitando linhas');
      assert.ok(linhas(g).some(tr => tr.querySelector('.r4-hit')), 'há marcas');
      g.setFilter('');
      assert.eq(g.el.querySelectorAll('.r4-hit').length, 0, 'tudo limpo');
    });

    test('destaque: modo remoto marca no cliente o que o servidor devolveu', async t => {
      t.mockFetch({ '/api/g-hit': () => ({ body: { status: 200, total: 2, retorno: [{ id: 1, nome: 'Rafaela', cidade: 'Recife' }, { id: 2, nome: 'Zeca', cidade: 'Recife' }] } }) });
      const g = t.create({ xtype: 'grid', src: '/api/g-hit', remote: true, pageSize: 10, columns: ['nome', 'cidade'] });
      await t.waitFor(() => linhas(g).length === 2, 2000, 'carregou');
      g.q = 'r'; g._update(false);
      assert.deepEq(hits(g), [[0, 1], [1]]);
    });

    /* ======== seletor de linhas por página ======== */
    const MUITOS = n => Array.from({ length: n }, (_, i) => ({ id: i + 1, nome: 'Item ' + (i + 1) }));
    const sel = g => g.pager.querySelector('select');

    test('seletor: desligado por padrão (grids antigos não mudam); ligado mostra select acessível com 10, 30, 50, 100 e Todos', t => {
      const g0 = t.create({ xtype: 'grid', data: MUITOS(25), pageSize: 10 });
      assert.eq(g0.pager.querySelector('select'), null, 'sem pageSizeSelector: nada novo');
      const g = t.create({ xtype: 'grid', data: MUITOS(120), pageSize: 10, pageSizeSelector: true });
      const s = sel(g);
      assert.ok(s, 'select existe');
      assert.deepEq([...s.options].map(o => o.textContent), ['10', '30', '50', '100', 'Todos']);
      assert.eq(s.value, '10');
      const lb = g.pager.querySelector('label');
      assert.eq(lb.getAttribute('for'), s.id, 'label ligado ao campo');
      assert.eq(lb.textContent, 'Linhas por página');
      assert.contains(g.pager, '1 / 12', 'paginação continua ao lado');
      assert.eq(g.pager.querySelectorAll('button').length, 2, 'anterior/próxima intactos');
    });

    test('seletor: trocar o tamanho recalcula as páginas, mantém o registro do topo e dispara pagesizechange; Todos = sem paginação', t => {
      const g = t.create({ xtype: 'grid', data: MUITOS(120), pageSize: 10, pageSizeSelector: true });
      const evs = []; g.on('pagesizechange', (_g, n) => evs.push(n));
      g.setPage(3);   // registros 31..40
      const s = sel(g);
      s.value = '30'; s.dispatchEvent(new Event('change', { bubbles: true }));
      assert.eq(g.getPageSize(), 30);
      assert.eq(linhas(g).length, 30);
      assert.eq(col(g, 1)[0], 'Item 31', 'o registro que estava no topo continua visível');
      assert.contains(g.pager, '2 / 4');
      g.setPageSize(100);
      assert.eq(linhas(g).length, 100);
      assert.contains(g.pager, '1 / 2');
      sel(g).value = 'all'; sel(g).dispatchEvent(new Event('change', { bubbles: true }));
      assert.eq(g.getPageSize(), 0);
      assert.eq(linhas(g).length, 120, 'todas as linhas');
      assert.eq(g.pager.hidden, false, 'o seletor continua para voltar');
      assert.eq(g.pager.querySelectorAll('button').length, 0, 'sem navegação em Todos');
      assert.eq(sel(g).value, 'all');
      g.setFilter('Item 11');
      assert.eq(g.getPageSize(), 0, 'filtrar mantém o tamanho');
      g.setPageSize(10);
      assert.deepEq(evs, [30, 100, 0, 10]);
      assert.eq(sel(g).value, '10');
    });

    test('seletor: o foco do select sobrevive à troca (o rodapé não recria o campo)', t => {
      const g = t.create({ xtype: 'grid', data: MUITOS(60), pageSize: 10, pageSizeSelector: true });
      const s = sel(g); s.focus();
      s.value = '30'; s.dispatchEvent(new Event('change', { bubbles: true }));
      assert.ok(sel(g) === s, 'mesmo elemento');
      assert.eq(document.activeElement, s, 'foco mantido');
    });

    test('seletor: tamanho inicial fora da lista entra nela; pageSizes personalizado (array e texto "10,30,all")', t => {
      const g = t.create({ xtype: 'grid', data: MUITOS(40), pageSize: 15, pageSizeSelector: true, pageSizes: [5, 15, 25] });
      assert.deepEq([...sel(g).options].map(o => o.value), ['5', '15', '25']);
      const h = t.create({ xtype: 'grid', data: MUITOS(40), pageSize: 20, pageSizeSelector: true, pageSizes: '10,30,all' });
      assert.deepEq([...sel(h).options].map(o => o.value), ['10', '20', '30', 'all'], '20 (pageSize) foi acrescentado');
      assert.eq(sel(h).value, '20');
    });

    test('seletor: tags HTML (page-size-selector page-sizes="10,30,all") e i18n (en)', t => {
      t.html('<r4-grid id="g-ps-tag" page-size="10" page-size-selector page-sizes="10,30,all"></r4-grid>');
      const g = R4.get('g-ps-tag');
      assert.ok(g, 'montou');
      g.loadData(MUITOS(45));
      assert.deepEq([...sel(g).options].map(o => o.value), ['10', '30', 'all']);
      assert.eq(linhas(g).length, 10);
      const anterior = R4.i18n.locale;
      t.cleanup(() => R4.i18n.set(anterior));
      R4.i18n.set('en');
      assert.eq(g.pager.querySelector('label').textContent, 'Rows per page');
      assert.eq([...sel(g).options].at(-1).textContent, 'All');
    });

    test('seletor: modo remoto envia o size novo, recarrega e não oferece Todos por padrão', async t => {
      const todos = MUITOS(95);
      const m = t.mockFetch({ '/api/g-ps': req => {
        const p = req.url.searchParams, page = +p.get('page'), size = +p.get('size');
        return { body: { status: 200, total: 95, retorno: todos.slice((page - 1) * size, page * size) } };
      } });
      const g = t.create({ xtype: 'grid', src: '/api/g-ps', remote: true, pageSize: 10, pageSizeSelector: true, columns: ['id', 'nome'] });
      await t.waitFor(() => linhas(g).length === 10, 2000, 'primeira página');
      assert.deepEq([...sel(g).options].map(o => o.value), ['10', '30', '50', '100'], 'remoto: sem Todos');
      g.setPage(2);   // 21..30
      await t.waitFor(() => col(g, 0)[0] === '21', 2000, 'página 3');
      sel(g).value = '50'; sel(g).dispatchEvent(new Event('change', { bubbles: true }));
      await t.waitFor(() => linhas(g).length === 50, 2000, 'com 50');
      const q = m.calls.at(-1).url.searchParams;
      assert.eq(q.get('size'), '50');
      assert.eq(q.get('page'), '1', 'o registro 21 está na página 1 de 50');
      assert.contains(g.pager, '1 / 2');
      const x = t.create({ xtype: 'grid', src: '/api/g-ps', remote: true, pageSize: 10, pageSizeSelector: true, pageSizes: [10, 0], columns: ['id'] });
      await t.waitFor(() => linhas(x).length === 10, 2000, 'x');
      x.setPageSize(0);
      await t.waitFor(() => x._vr() && m.calls.at(-1).url.searchParams.get('size') === '100', 2000, 'Todos vira janela remota: pede blocos de 100 linhas (o servidor limita em 500)');
    });

    test('seletor: ordenar, filtrar e exportar mantêm o tamanho escolhido', t => {
      const g = t.create({ xtype: 'grid', data: MUITOS(200), pageSize: 10, pageSizeSelector: true, exportable: true });
      g.setPageSize(50);
      g.sort('nome', 'desc');
      assert.eq(g.getPageSize(), 50);
      g.setFilter('Item 1');
      assert.eq(g.getPageSize(), 50);
      assert.ok(linhas(g).length <= 50);
      assert.eq(sel(g).value, '50');
    });

    /* ======== janela remota: remoto + "Todos" (milhões de linhas, DOM enxuto) ======== */
    const servidor = (total, atraso = 0) => req => {
      const p = req.url.searchParams, page = +p.get('page'), size = +p.get('size'), q = p.get('q'), desc = p.get('dir') === 'desc';
      const n = q ? 40 : total, ini = (page - 1) * size, fim = Math.min(n, ini + size), out = [];
      for (let i = ini; i < fim; i++) { const id = desc ? n - i : i + 1; out.push({ id, nome: (q ? 'Achado ' : 'Linha ') + id }); }
      return { body: { status: 200, total: n, retorno: out }, delay: atraso };
    };
    const trsDados = g => [...g.tbody.querySelectorAll('tr')].filter(tr => tr.cells.length > 1 && !tr.hidden);
    const idsVis = g => trsDados(g).filter(tr => !tr.classList.contains('r4-row-wait')).map(tr => +tr.cells[0].textContent);

    test('janela remota: "Todos" no modo remoto mostra o total, mantém só ~30 linhas no DOM e limita a altura da rolagem (300 mil linhas)', async t => {
      const m = t.mockFetch({ '/api/g-jan': servidor(300000) });
      const g = t.create({ xtype: 'grid', src: '/api/g-jan', remote: true, pageSize: 10, pageSizeSelector: true, pageSizes: '10,50,all', columns: [{ header: 'Id', dataIndex: 'id' }, { header: 'Nome', dataIndex: 'nome' }] });
      await t.waitFor(() => trsDados(g).length === 10, 2000, 'página de 10');
      assert.eq(g._vr(), false, 'paginado: não é janela');
      g.setPageSize(0);
      await t.waitFor(() => g._vr() && idsVis(g).length > 5, 3000, 'janela montada');
      assert.eq(m.calls.at(-1).url.searchParams.get('size'), '100', 'pede blocos de 100 linhas');
      assert.ok(trsDados(g).length < 60, 'DOM enxuto: ' + trsDados(g).length + ' linhas para 300 mil');
      assert.ok(g.scroller.scrollHeight < 8100000, 'altura da rolagem limitada (' + g.scroller.scrollHeight + ' px, e não ' + 300000 * 36 + ')');
      assert.contains(g.pager, '300.000', 'total no rodapé');
      assert.eq(sel(g).value, 'all');
      assert.eq(idsVis(g)[0], 1, 'começa na linha 1');
    });

    test('janela remota: rolar até o fim busca o último bloco; rolar pro meio mostra linhas ainda não carregadas como espera e depois preenche', async t => {
      const m = t.mockFetch({ '/api/g-jan2': servidor(300000, 60) });
      const g = t.create({ xtype: 'grid', src: '/api/g-jan2', remote: true, pageSizes: 'all', columns: [{ header: 'Id', dataIndex: 'id' }, { header: 'Nome', dataIndex: 'nome' }] });
      g.setPageSize(0);
      await t.waitFor(() => idsVis(g).length > 5, 3000, 'início');
      const max = () => g.scroller.scrollHeight - g.scroller.clientHeight;
      g.scroller.scrollTop = max();
      await t.waitFor(() => idsVis(g).includes(300000), 4000, 'última linha (300000) apareceu');
      assert.ok(m.calls.some(c => c.url.searchParams.get('page') === '3000'), 'pediu o último bloco (página 3000)');
      g.scroller.scrollTop = Math.floor(max() / 2);
      await t.waitFor(() => trsDados(g).some(tr => tr.classList.contains('r4-row-wait')) || idsVis(g).some(i => i > 140000), 1500, 'espera ou dado do meio');
      await t.waitFor(() => { const v = idsVis(g); return v.length > 5 && v[0] > 140000 && v[0] < 160000; }, 4000, 'meio preenchido');
      assert.ok(trsDados(g).length < 60, 'DOM continua enxuto');
      assert.ok(g.pager.textContent.includes('de 300.000'), 'rodapé mostra a posição');
      g.scroller.scrollTop = 0;
      await t.waitFor(() => idsVis(g)[0] === 1, 3000, 'voltou ao topo');
    });

    test('janela remota: ordenar e buscar pedem ao servidor (sort/dir/q), voltam ao topo e usam o novo total', async t => {
      const m = t.mockFetch({ '/api/g-jan3': servidor(300000) });
      const g = t.create({ xtype: 'grid', src: '/api/g-jan3', remote: true, pageSizes: 'all', columns: [{ header: 'Id', dataIndex: 'id' }, { header: 'Nome', dataIndex: 'nome' }] });
      g.setPageSize(0);
      await t.waitFor(() => idsVis(g).length > 5, 3000, 'início');
      g.scroller.scrollTop = 1e6;
      g.sort('id', 'desc');
      await t.waitFor(() => { const q = m.calls.at(-1).url.searchParams; return q.get('sort') === 'id' && q.get('dir') === 'desc'; }, 3000, 'ordenou no servidor');
      await t.waitFor(() => idsVis(g)[0] === 300000, 3000, 'maior id primeiro');
      assert.eq(g.scroller.scrollTop, 0, 'ordenar volta ao topo');
      g.setFilter('Achado');
      await t.waitFor(() => m.calls.at(-1).url.searchParams.get('q') === 'achado', 3000, 'busca no servidor');
      await t.waitFor(() => g.pager.textContent.includes('40 registros') || g.pager.textContent.includes('de 40'), 3000, 'novo total (40)');
      assert.ok(g.scroller.scrollHeight < 5000, 'poucas linhas: sem rolagem escalada');
      assert.ok(trsDados(g).some(tr => tr.querySelector('td.r4-hit')), 'destaque da busca também na janela');
    });

    test('janela remota: tamanho que cabe sem escala (500 linhas) rola normalmente até a última', async t => {
      t.mockFetch({ '/api/g-jan4': servidor(500) });
      const g = t.create({ xtype: 'grid', src: '/api/g-jan4', remote: true, pageSizes: 'all', columns: [{ header: 'Id', dataIndex: 'id' }, { header: 'Nome', dataIndex: 'nome' }] });
      g.setPageSize(0);
      await t.waitFor(() => idsVis(g).length > 5, 3000, 'início');
      g.scroller.scrollTop = g.scroller.scrollHeight;
      await t.waitFor(() => idsVis(g).includes(500), 3000, 'última linha (500)');
      assert.ok(g.scroller.scrollHeight >= 500 * 36 - 200, 'altura real (sem escala)');
    });

    /* ======== filtro por valores da coluna (funil no cabeçalho) ======== */
    const PED = [
      ...Array.from({ length: 5 }, (_, i) => ({ id: i + 1, status: 'pago', uf: i % 2 ? 'SP' : 'RJ', nome: 'Pago ' + (i + 1) })),
      ...Array.from({ length: 3 }, (_, i) => ({ id: i + 6, status: 'aberto', uf: 'SP', nome: 'Aberto ' + (i + 1) })),
      ...Array.from({ length: 2 }, (_, i) => ({ id: i + 9, status: 'enviado', uf: 'MG', nome: 'Enviado ' + (i + 1) })),
      { id: 11, status: '', uf: 'RJ', nome: 'Sem status' }
    ];
    const COLS_PED = [{ header: 'Id', dataIndex: 'id' }, { header: 'Status', dataIndex: 'status' }, { header: 'UF', dataIndex: 'uf' }, { header: 'Nome', dataIndex: 'nome' }];
    const funil = (g, k) => g.thead.querySelector('.r4-th-filter[data-cf="' + k + '"]');
    const pop = () => document.querySelector('.r4-cf');
    const itens = () => [...document.querySelectorAll('.r4-cf .r4-cf-item')].map(l => [l.querySelector('.r4-cf-val').textContent, l.querySelector('.r4-cf-n') ? l.querySelector('.r4-cf-n').textContent : null]);
    const marcar = (nome, on = true) => {
      const l = [...document.querySelectorAll('.r4-cf .r4-cf-item')].find(x => x.querySelector('.r4-cf-val').textContent === nome), cb = l.querySelector('input');
      cb.checked = on; cb.dispatchEvent(new Event('change', { bubbles: true }));
    };
    const abrir = async (t, g, k) => { funil(g, k).click(); await t.waitFor(() => pop() && document.querySelectorAll('.r4-cf .r4-cf-item').length > 0, 2000, 'popover com valores'); };

    test('filtro por valores: desligado por padrão; columnFilters põe o funil em toda coluna de dados (menos ações) e filterValues liga só uma', t => {
      const g0 = t.create({ xtype: 'grid', data: PED, columns: COLS_PED });
      assert.eq(g0.thead.querySelectorAll('.r4-th-filter').length, 0, 'sem columnFilters: nenhum funil');
      const g1 = t.create({ xtype: 'grid', data: PED, columnFilters: true, columns: [...COLS_PED, { header: 'Ações', actions: [{ text: 'x' }] }] });
      assert.eq(g1.thead.querySelectorAll('.r4-th-filter').length, 4, 'uma por coluna de dados');
      const g2 = t.create({ xtype: 'grid', data: PED, columns: [{ header: 'Id', dataIndex: 'id' }, { header: 'Status', dataIndex: 'status', filterValues: true }] });
      assert.eq(g2.thead.querySelectorAll('.r4-th-filter').length, 1, 'só a coluna com filterValues');
      const g3 = t.create({ xtype: 'grid', data: PED, columnFilters: true, columns: [{ header: 'Id', dataIndex: 'id', filterable: false }, { header: 'Status', dataIndex: 'status' }] });
      assert.eq(g3.thead.querySelectorAll('.r4-th-filter').length, 1, 'filterable:false desliga');
    });

    test('filtro por valores (local): lista os distintos com contagem, marcar um/vários filtra (OU), E entre colunas, (vazio), limpar e API', async t => {
      const g = t.create({ xtype: 'grid', data: PED, columnFilters: true, columns: COLS_PED });
      const evs = []; g.on('filterchange', (_, f) => evs.push(JSON.stringify(f)));
      await abrir(t, g, 'status');
      assert.deepEq(itens(), [['pago', '5'], ['aberto', '3'], ['enviado', '2'], ['(vazio)', '1']], 'distintos por quantidade');
      assert.contains(pop(), '0 de 4', 'rodapé do popover');
      marcar('aberto');
      await t.waitFor(() => linhas(g).length === 3, 2000, 'só aberto');
      assert.contains(pop(), '1 de 4');
      assert.deepEq(g.getColumnFilters(), { status: ['aberto'] });
      marcar('enviado');
      await t.waitFor(() => linhas(g).length === 5, 2000, 'aberto OU enviado');
      assert.eq(funil(g, 'status').querySelector('.r4-fn').textContent, '2', 'contador no funil');
      assert.ok(funil(g, 'status').classList.contains('r4-on'), 'funil destacado');
      marcar('(vazio)');
      await t.waitFor(() => linhas(g).length === 6, 2000, 'vazio entra');
      marcar('(vazio)', false); marcar('enviado', false);
      await t.waitFor(() => linhas(g).length === 3, 2000, 'volta a aberto');
      pop().querySelector('[data-k="clear"]').click();
      await t.waitFor(() => linhas(g).length === 11, 2000, 'limpar = sem filtro');
      assert.deepEq(g.getColumnFilters(), {});
      assert.ok(evs.length >= 4, 'evento filterchange disparado');
      // E entre colunas: status pago + UF SP => só o pago de SP
      g.setColumnFilter('status', ['pago']); g.setColumnFilter('uf', ['SP']);
      assert.eq(linhas(g).length, 2, 'pago E SP');
      funil(g, 'uf').click();
      await t.waitFor(() => itens().length > 0, 2000, 'popover uf');
      assert.deepEq(itens().filter(i => i[0] === 'SP'), [['SP', '2']], 'contagem reflete os OUTROS filtros (pago)');
      g.clearColumnFilters();
      assert.eq(linhas(g).length, 11);
    });

    test('filtro por valores: busca interna, ordem A-Z, funil não ordena, filtro + busca do grid + destaque e ordenação continuam valendo', async t => {
      const g = t.create({ xtype: 'grid', data: PED, columnFilters: true, columns: COLS_PED });
      await abrir(t, g, 'status');
      const bu = pop().querySelector('.r4-cf-search'); bu.value = 'en'; bu.dispatchEvent(new Event('input', { bubbles: true }));
      assert.deepEq(itens().map(i => i[0]), ['enviado'], 'busca interna');
      bu.value = ''; bu.dispatchEvent(new Event('input', { bubbles: true }));
      pop().querySelector('[data-k="ord"]').click();
      assert.deepEq(itens().map(i => i[0]), ['(vazio)', 'aberto', 'enviado', 'pago'].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })), 'A–Z');
      assert.eq(g.thead.querySelector('[aria-sort]'), null, 'clicar no funil não ordena');
      marcar('pago');
      await t.waitFor(() => linhas(g).length === 5, 2000, 'pago');
      g.setFilter('sp');
      assert.eq(linhas(g).length, 2, 'filtro por valores + busca do grid (E)');
      assert.ok(hits(g).flat().length > 0, 'destaque da busca continua');
      g.sort('id', 'desc');
      assert.eq(col(g, 0)[0], '4', 'ordenação continua (pago + SP: ids 4 e 2)');
    });

    test('filtro por valores: usa o texto EXIBIDO (renderer/format), options fixas e limite de 1000 distintos (só pela busca)', async t => {
      const dados = [{ v: 1 }, { v: 1 }, { v: 2 }];
      const g = t.create({ xtype: 'grid', data: dados, columnFilters: true, columns: [{ header: 'V', dataIndex: 'v', renderer: v => (v === 1 ? 'um' : 'dois') }] });
      await abrir(t, g, 'v');
      assert.deepEq(itens(), [['um', '2'], ['dois', '1']], 'texto do renderer');
      marcar('dois'); await t.waitFor(() => linhas(g).length === 1, 2000, 'filtra pelo texto exibido');
      g.destroy();
      const g2 = t.create({ xtype: 'grid', data: PED, columns: [{ header: 'Id', dataIndex: 'id' }, { header: 'Status', dataIndex: 'status', filterValues: true, options: ['pago', { value: 'aberto', label: 'Em aberto' }, 'cancelado'] }] });
      await abrir(t, g2, 'status');
      assert.deepEq(itens(), [['pago', '5'], ['Em aberto', '3'], ['cancelado', '0']], 'options fixas com contagem local');
      g2.destroy();
      const muitos = Array.from({ length: 1500 }, (_, i) => ({ id: i, cod: 'C' + i }));
      const g3 = t.create({ xtype: 'grid', data: muitos, columnFilters: true, columns: [{ header: 'Cod', dataIndex: 'cod' }] });
      funil(g3, 'cod').click();
      await t.waitFor(() => pop() && pop().querySelector('.r4-cf-msg'), 2000, 'aviso de muitos valores');
      assert.contains(pop(), 'Muitos valores', 'aviso');
      assert.eq(itens().length, 0, 'sem a busca não lista');
      const bu = pop().querySelector('.r4-cf-search'); bu.value = 'C149'; bu.dispatchEvent(new Event('input', { bubbles: true }));
      assert.ok(itens().length >= 11, 'a busca lista os que casam');
    });

    test('filtro por valores: acessibilidade (aria, role dialog, Esc fecha e devolve o foco ao funil, Alt+↓ no cabeçalho abre)', async t => {
      const g = t.create({ xtype: 'grid', data: PED, columnFilters: true, columns: COLS_PED });
      const b = funil(g, 'status');
      assert.eq(b.getAttribute('aria-haspopup'), 'dialog');
      assert.eq(b.getAttribute('aria-expanded'), 'false');
      assert.contains(b.getAttribute('aria-label'), 'Filtrar valores de Status');
      await abrir(t, g, 'status');
      assert.eq(b.getAttribute('aria-expanded'), 'true');
      assert.eq(pop().getAttribute('role'), 'dialog');
      pop().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      assert.eq(pop(), null, 'Esc fecha');
      assert.eq(document.activeElement, b, 'foco volta ao funil');
      assert.eq(b.getAttribute('aria-expanded'), 'false');
      const th = b.closest('th'); th.focus();
      th.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', altKey: true, bubbles: true }));
      await t.waitFor(() => pop(), 1000, 'Alt+↓ abre');
      document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      assert.eq(pop(), null, 'clique fora fecha');
    });

    test('filtro por valores (remoto): envia filtro[coluna][]=valor, busca os valores em optionsUrl (col, q, com cache) e volta à página 1', async t => {
      const todos = Array.from({ length: 40 }, (_, i) => ({ id: i + 1, status: i % 2 ? 'pago' : 'aberto', nome: 'N' + (i + 1) }));
      const m = t.mockFetch({
        '/api/g-cf': req => {
          const sp = req.url.searchParams, st = sp.getAll('filtro[status][]'), page = +sp.get('page'), size = +sp.get('size');
          const l = todos.filter(r => !st.length || st.includes(r.status));
          return { body: { status: 200, total: l.length, retorno: l.slice((page - 1) * size, page * size) } };
        },
        '/api/g-cf-vals': () => ({ body: { status: 200, retorno: [{ valor: 'aberto', qtd: 20 }, { valor: 'pago', qtd: 20 }] } })
      });
      const g = t.create({ xtype: 'grid', src: '/api/g-cf', remote: true, pageSize: 10, columnFilters: true, columns: [{ header: 'Id', dataIndex: 'id' }, { header: 'Status', dataIndex: 'status', optionsUrl: '/api/g-cf-vals' }, { header: 'Nome', dataIndex: 'nome' }] });
      await t.waitFor(() => linhas(g).length === 10, 2000, 'primeira página');
      g.setPage(1);
      await t.waitFor(() => col(g, 0)[0] === '11', 2000, 'página 2');
      funil(g, 'status').click();
      await t.waitFor(() => itens().length === 2, 2000, 'valores do servidor');
      const cv = m.calls.filter(c => c.url.pathname === '/api/g-cf-vals');
      assert.eq(cv.length, 1);
      assert.eq(cv[0].url.searchParams.get('col'), 'status');
      assert.deepEq(itens(), [['aberto', '20'], ['pago', '20']]);
      marcar('pago');
      await t.waitFor(() => m.calls.at(-1).url.searchParams.getAll('filtro[status][]').length === 1, 3000, 'filtro enviado');
      const q = m.calls.at(-1).url.searchParams;
      assert.deepEq(q.getAll('filtro[status][]'), ['pago']);
      assert.eq(q.get('page'), '1', 'filtrar volta à página 1');
      await t.waitFor(() => linhas(g).length === 10 && col(g, 1).every(v => v === 'pago'), 2000, 'só pago');
      assert.contains(g.pager, '20 registros', 'total do servidor');
      marcar('aberto');
      await t.waitFor(() => m.calls.at(-1).url.searchParams.getAll('filtro[status][]').length === 2, 3000, 'dois valores');
      assert.deepEq(m.calls.at(-1).url.searchParams.getAll('filtro[status][]'), ['pago', 'aberto']);
      g.destroy();
    });

    test('filtro por valores (remoto): optionsUrl recebe q da busca e o cache invalida quando a busca muda; valor com acento e & é codificado', async t => {
      const m = t.mockFetch({
        '/api/g-cf2': req => ({ body: { status: 200, total: 1, retorno: [{ id: 1, status: 'em análise & revisão' }] } }),
        '/api/g-cf2-vals': () => ({ body: { status: 200, retorno: [{ valor: 'em análise & revisão', qtd: 1 }] } })
      });
      const g = t.create({ xtype: 'grid', src: '/api/g-cf2', remote: true, pageSize: 10, columns: [{ header: 'Id', dataIndex: 'id' }, { header: 'Status', dataIndex: 'status', filterValues: true, optionsUrl: '/api/g-cf2-vals' }] });
      await t.waitFor(() => linhas(g).length === 1, 2000, 'carregou');
      g.setFilter('ana');
      await t.waitFor(() => m.calls.at(-1).url.searchParams.get('q') === 'ana', 2000, 'busca');
      await abrir(t, g, 'status');
      assert.eq(m.calls.filter(c => c.url.pathname === '/api/g-cf2-vals').at(-1).url.searchParams.get('q'), 'ana', 'optionsUrl recebe a busca atual');
      g.setColumnFilter('status', ['em análise & revisão']);
      await t.waitFor(() => m.calls.at(-1).url.searchParams.getAll('filtro[status][]').length === 1, 2000, 'filtro enviado');
      assert.deepEq(m.calls.at(-1).url.searchParams.getAll('filtro[status][]'), ['em análise & revisão'], 'acento e & chegam inteiros');
      assert.contains(m.calls.at(-1).url.search, 'filtro%5Bstatus%5D%5B%5D=', 'chave com colchetes codificada');
    });

    test('filtro por valores (janela remota): com "Todos" o filtro é enviado em cada bloco e a janela volta ao topo', async t => {
      const m = t.mockFetch({ '/api/g-cf3': req => {
        const sp = req.url.searchParams, st = sp.getAll('filtro[status][]'), page = +sp.get('page'), size = +sp.get('size'), n = st.length ? 250 : 5000, out = [];
        for (let i = (page - 1) * size; i < Math.min(n, page * size); i++) out.push({ id: i + 1, status: st[0] || 'x' });
        return { body: { status: 200, total: n, retorno: out } };
      } });
      const g = t.create({ xtype: 'grid', src: '/api/g-cf3', remote: true, pageSizes: 'all', columnFilters: true, columns: [{ header: 'Id', dataIndex: 'id' }, { header: 'Status', dataIndex: 'status' }] });
      g.setPageSize(0);
      await t.waitFor(() => g._vr() && trsDados(g).length > 5, 3000, 'janela');
      g.scroller.scrollTop = 2000;
      g.setColumnFilter('status', ['pago']);
      await t.waitFor(() => m.calls.at(-1).url.searchParams.getAll('filtro[status][]').join() === 'pago', 3000, 'bloco com filtro');
      await t.waitFor(() => g.pager.textContent.includes('250'), 3000, 'novo total 250');
      assert.eq(g.scroller.scrollTop, 0, 'voltou ao topo');
      assert.eq(m.calls.at(-1).url.searchParams.get('size'), '100');
    });
  });
})();
