/* suíte quick: funções prontas R4.grid/button/panel/window/render/callout/alert/confirm... (todo xtype vira função) */
(() => {
  const { suite, test, assert } = R4Test;
  const janelas = () => [...document.querySelectorAll('.r4-window')];
  const botao = (win, txt) => [...win.querySelectorAll('button')].find(b => b.textContent.trim() === txt);

  suite('quick', () => {
    test('todo componente visível ganha a função R4.<xtype>', t => {
      const visiveis = Object.keys(R4.registry).filter(k => !R4.registry[k].meta.hidden);
      assert.gt(visiveis.length, 30, 'há dezenas de componentes registrados');
      const sem = visiveis.filter(k => typeof R4[k] !== 'function');
      assert.deepEq(sem, [], 'xtypes sem função rápida');
      assert.eq(R4.registry.component.meta.hidden, true);
      assert.eq(R4.component, undefined, 'o componente base (oculto) não ganha atalho');
    });

    test('componente definido depois também ganha a função automaticamente', t => {
      R4.define('r4tQuick', { config: { texto: 'q' }, build() { return R4.util.el('i', { class: 'r4t-quick', text: this.texto }); } });
      t.cleanup(() => { delete R4.registry.r4tQuick; delete R4.r4tQuick; });
      assert.eq(typeof R4.r4tQuick, 'function');
      const c = R4.r4tQuick(t.box, { texto: 'olá' });
      assert.eq(c.xtype, 'r4tQuick');
      assert.eq(t.box.querySelector('.r4t-quick').textContent, 'olá', 'objeto no lugar dos dados = config');
    });

    test('R4.grid(alvo, linhas): colunas automáticas das chaves; paginação só acima de 15 linhas', t => {
      t.box.id = 'r4t-quick-box';
      const g = R4.grid('#r4t-quick-box', [{ nome_completo: 'Ana', v: 1 }, { nome_completo: 'Bia', v: 2 }]);
      assert.eq(g.xtype, 'grid');
      assert.ok(t.box.contains(g.el), 'renderizou no alvo (seletor)');
      assert.deepEq(g.columns.map(c => c.dataIndex), ['nome_completo', 'v']);
      assert.deepEq(g.columns.map(c => c.header), ['Nome completo', 'V'], 'cabeçalho legível a partir da chave');
      assert.eq(g.pageSize, 0, '2 linhas: sem paginação');
      assert.eq(g.getView().length, 2);
      const g2 = R4.grid(t.box, Array.from({ length: 20 }, (_, i) => ({ i })));
      assert.eq(g2.pageSize, 10, '20 linhas: páginas de 10');
      assert.eq(g2.el.querySelectorAll('tbody tr[aria-rowindex]').length, 10);
      const g3 = R4.grid(t.box, { data: [{ a: 1 }], columns: [{ header: 'Letra', dataIndex: 'a' }] });
      assert.eq(g3.columns[0].header, 'Letra', 'objeto no lugar das linhas = config completa');
    });

    test('R4.grid(alvo, url) busca em src (fetch simulado) e aceita columns como lista de nomes', async t => {
      const m = t.mockFetch({ '/api/q': { body: [{ id: 1, nome: 'Ana' }, { id: 2, nome: 'Bia' }] } });
      const g = R4.grid(t.box, '/api/q', { columns: ['nome'] });
      assert.eq(g.src, '/api/q');
      await t.waitFor(() => g.getData().length === 2, 2000, 'dados do src');
      assert.eq(m.calls[0].method, 'GET');
      assert.deepEq(g.columns.map(c => c.dataIndex), ['nome']);
      assert.deepEq([...g.tbody.querySelectorAll('tr[aria-rowindex] td')].map(td => td.textContent), ['Ana', 'Bia']);
    });

    test('R4.button(alvo, texto, função): clique chama a função; objeto de opções vira variante', t => {
      const f = t.spy();
      const b = R4.button(t.box, 'Salvar', f);
      assert.eq(b.el.textContent, 'Salvar');
      b.el.click();
      assert.eq(f.count, 1);
      assert.eq(f.lastArgs[0], b, 'handler recebe o botão');
      const p = R4.button(t.box, 'Enviar', { variant: 'primary', icon: 'send' });
      assert.ok(p.el.classList.contains('r4-btn-primary'));
      assert.eq(p.icon, 'send');
      const d = R4.button(t.box, { text: 'Config completa', disabled: true });
      assert.eq(d.el.disabled, true, 'objeto no lugar do texto = config');
      d.el.click();
      assert.eq(f.count, 1);
    });

    test('R4.panel / textfield / div / toolbar / tabpanel / treepanel aceitam os dados mais comuns', t => {
      const p = R4.panel(t.box, 'Título', '<p class="r4t-p">html</p>');
      assert.eq(p.el.querySelector('.r4-title').textContent, 'Título');
      assert.ok(p.body.querySelector('.r4t-p'));
      const tf = R4.textfield(t.box, 'Rótulo', { placeholder: 'dica' });
      assert.eq(tf.el.querySelector('.r4-label').textContent, 'Rótulo');
      assert.eq(tf.input.placeholder, 'dica');
      const d = R4.div(t.box, '<b>x</b>', { cols: 2, gap: '3' });
      assert.eq(d.el.innerHTML, '<b>x</b>');
      assert.ok(d.el.classList.contains('r4-div-cols'));
      const tb = R4.toolbar(t.box, [{ text: 'A' }, '->', { text: 'B' }]);
      assert.eq(tb.el.querySelectorAll('button').length, 2);
      const tp = R4.tabpanel(t.box, { Primeira: 'um', Segunda: 'dois' });
      assert.deepEq([...tp.strip.children].map(x => x.textContent), ['Primeira', 'Segunda']);
      assert.ok(!tp.tabs[0].cmp.el.hidden && tp.tabs[1].cmp.el.hidden, 'primeira aba ativa');
      const sel = t.spy();
      const tr = R4.treepanel(t.box, [{ id: 'a', text: 'Folha A' }, { id: 'b', text: 'Pasta', children: [{ id: 'c', text: 'Folha C' }] }], sel);
      tr.select('c');
      assert.eq(sel.count, 1, 'função recebe o nó escolhido');
      assert.eq(sel.lastArgs[0].id, 'c');
    });

    test('R4.window(título, html) abre direto no body, sem alvo; fecha por Esc e por ×', t => {
      const antes = janelas().length;
      const w = R4.window('Aviso', '<p>Olá</p>');
      assert.eq(w.xtype, 'window');
      assert.eq(janelas().length, antes + 1);
      assert.eq(w.el.parentNode, document.body, 'renderiza no body');
      assert.eq(w.el.hidden, false);
      assert.contains(w.el, 'Olá');
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      assert.eq(janelas().length, antes, 'Esc fecha e destrói');
      assert.ok(w._destroyed);
      const w2 = R4.window({ title: 'Config', html: 'x', width: 300 });
      assert.eq(w2.width, 300, 'objeto = config');
      w2.el.querySelector('.r4-tool').click();
      assert.ok(w2._destroyed, '× fecha');
    });

    test('R4.render(alvo, html) coloca o HTML, ativa as tags e devolve o elemento', t => {
      const el = R4.render(t.box, '<r4-badge text="oi" variant="ok"></r4-badge><span id="r4t-r">cru</span>');
      assert.eq(el, t.box);
      assert.eq(t.box.querySelector('.r4-bdg').textContent, 'oi', 'tag montada');
      assert.eq(t.box.querySelector('#r4t-r').textContent, 'cru');
      const por_id = R4.render('#r4t-r', '<r4-badge text="dentro"></r4-badge>');
      assert.eq(por_id.id, 'r4t-r', 'aceita seletor');
      assert.eq(por_id.querySelector('.r4-bdg').textContent, 'dentro');
      assert.throws(() => R4.render('#nao-existe-r4t', 'x'), /alvo não encontrado/);
    });

    test('R4.callout cria o aviso embutido por variante; R4.alert é só o diálogo', t => {
      const c = R4.callout(t.box, 'Salvo com sucesso', { variant: 'ok', title: 'Pronto', closable: true });
      assert.eq(c.xtype, 'alert');
      assert.ok(t.box.contains(c.el));
      assert.contains(c.el, 'Salvo com sucesso');
      assert.contains(c.el, 'Pronto');
      assert.ok(c.el.classList.contains('r4-v-ok'));
      const e = R4.callout(t.box, 'Falhou', { variant: 'err' });
      assert.eq(e.el.getAttribute('role'), 'alert', 'erro usa role=alert');
      assert.eq(c.el.getAttribute('role'), 'status', 'info/ok usa role=status');
      const x = R4.callout(t.box, '<b>não é html</b>');
      assert.eq(x.el.querySelector('b'), null, 'texto comum é escapado');
      const antes = janelas().length;
      R4.callout(t.box, 'ainda embutido');
      assert.eq(janelas().length, antes, 'callout não abre diálogo');
    });

    test('R4.alert abre diálogo (texto escapado) e chama o callback no OK; R4.confirm devolve true/false', t => {
      const cb = t.spy(), antes = janelas().length;
      const w = R4.alert('Título', '<b>x</b> & y', cb);
      const j = janelas().at(-1);
      assert.eq(janelas().length, antes + 1);
      assert.eq(j.querySelector('.r4-title').textContent, 'Título');
      assert.eq(j.querySelector('.r4-body p').textContent, '<b>x</b> & y', 'texto, não HTML');
      assert.eq(j.querySelector('b'), null);
      assert.eq(cb.count, 0);
      botao(j, 'OK').click();
      assert.eq(cb.count, 1, 'callback no OK');
      assert.eq(janelas().length, antes, 'fechou');
      assert.ok(w._destroyed);
      const r = t.spy();
      R4.confirm('Pergunta', 'Apagar?', r);
      botao(janelas().at(-1), 'Cancelar').click();
      R4.confirm('Pergunta', 'Apagar?', r);
      botao(janelas().at(-1), 'Sim').click();
      assert.deepEq(r.calls, [[false], [true]], 'Cancelar → false; Sim → true');
    });
  });
})();
