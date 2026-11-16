/* suíte tabs: tabpanel (abas, fechar, key), reordenar com move()/Alt+setas/arrastar, ARIA de tablist */
(() => {
  const { suite, test, assert } = R4Test;
  const tecla = (alvo, key, extra) => alvo.dispatchEvent(new KeyboardEvent('keydown', Object.assign({ key, bubbles: true, cancelable: true }, extra)));
  const mk = (t, extra) => t.create(Object.assign({ xtype: 'tabpanel', items: [{ title: 'Um', key: 'a', html: 'conteúdo um' }, { title: 'Dois', key: 'b', html: 'conteúdo dois' }, { title: 'Três', key: 'c', html: 'conteúdo três', closable: true }] }, extra));
  const titulos = p => [...p.strip.querySelectorAll('.r4-tab')].map(x => x.firstChild.textContent);
  const ordem = p => p.tabs.map(x => x.key).join('');

  suite('tabs', () => {
    test('monta as abas, ativa a primeira, mostra só o painel ativo e respeita activeTab', t => {
      const p = mk(t);
      assert.deepEq(titulos(p), ['Um', 'Dois', 'Três']);
      assert.eq(p.current, p.tabs[0]);
      assert.deepEq(p.tabs.map(x => x.cmp.el.hidden), [false, true, true], 'só o painel da aba ativa fica visível');
      assert.ok(p.tabs[0].el.classList.contains('r4-active'));
      assert.contains(p.stage, 'conteúdo um');
      const q = mk(t, { activeTab: 2 });
      assert.eq(q.current, q.tabs[2], 'activeTab escolhe a inicial');
      const grande = mk(t, { activeTab: 99 });
      assert.eq(grande.current, grande.tabs[2], 'activeTab acima do máximo vira a última');
      assert.eq(t.create({ xtype: 'tabpanel', items: [] }).current, undefined, 'sem abas não quebra');
    });

    test('ARIA: faixa com role=tablist, abas com role=tab, aria-selected e tabindex; Enter/Espaço ativam', t => {
      const p = mk(t);
      assert.eq(p.strip.getAttribute('role'), 'tablist');
      const abas = [...p.strip.querySelectorAll('.r4-tab')];
      assert.deepEq(abas.map(a => a.getAttribute('role')), ['tab', 'tab', 'tab']);
      assert.deepEq(abas.map(a => a.getAttribute('tabindex')), ['0', '0', '0'], 'cada aba entra na ordem do Tab');
      assert.deepEq(abas.map(a => a.getAttribute('aria-selected')), ['true', 'false', 'false']);
      tecla(abas[1], 'Enter');
      assert.eq(p.current, p.tabs[1]);
      assert.deepEq(abas.map(a => a.getAttribute('aria-selected')), ['false', 'true', 'false']);
      tecla(abas[2], ' ');
      assert.eq(p.current, p.tabs[2], 'Espaço ativa');
      tecla(abas[0], 'a');
      assert.eq(p.current, p.tabs[2], 'outras teclas não fazem nada');
      abas[0].click();
      assert.eq(p.current, p.tabs[0], 'clique ativa');
      assert.ok(!p.tabs[0].cmp.el.hidden && p.tabs[2].cmp.el.hidden);
    });

    test('eventos beforetabchange (cancelável) e tabchange; setActive por índice/objeto; mesma aba não repete', t => {
      const antes = t.spy(), depois = t.spy();
      const p = mk(t, { listeners: { beforetabchange: antes, tabchange: depois } });
      const n0 = depois.count;
      p.setActive(1);
      assert.eq(p.current, p.tabs[1]);
      assert.eq(depois.count, n0 + 1);
      assert.eq(depois.lastArgs[1], p.tabs[1].cmp, 'tabchange(cmp, painel)');
      p.setActive(p.tabs[1]);
      assert.eq(depois.count, n0 + 1, 'mesma aba: nada acontece');
      p.setActive(99);
      assert.eq(p.current, p.tabs[1], 'índice inexistente é ignorado');
      p.on('beforetabchange', () => false);
      p.setActive(2);
      assert.eq(p.current, p.tabs[1], 'cancelado');
    });

    test('add() cria e ativa; key evita duplicata via find(); closable fecha pelo × e ativa a vizinha; remove()', t => {
      const p = mk(t);
      const novo = p.add({ title: 'Quatro', key: 'd', html: 'q', closable: true });
      assert.eq(p.tabs.length, 4);
      assert.eq(p.current.key, 'd', 'add ativa a nova');
      assert.eq(p.tabs[3].el.getAttribute('role'), 'tab', 'aba criada depois também ganha ARIA');
      assert.eq(p.find('d'), p.tabs[3]);
      assert.eq(p.find('zzz'), undefined);
      p.add({ title: 'Cinco', key: 'e' }, false);
      assert.eq(p.current.key, 'd', 'add(cfg, false) não ativa');
      const x = p.tabs[3].el.querySelector('.r4-x');
      assert.ok(x, 'botão fechar');
      assert.eq(x.getAttribute('title'), 'Fechar');
      x.click();
      assert.eq(p.tabs.length, 4);
      assert.eq(ordem(p), 'abce');
      assert.eq(novo._destroyed, true, 'painel da aba fechada foi destruído');
      assert.eq(p.current.key, 'c', 'ativa a vizinha da esquerda');
      p.remove(p.find('c'));
      assert.eq(ordem(p), 'abe');
      assert.eq(p.current.key, 'b');
      p.remove({});
      assert.eq(p.tabs.length, 3, 'remover algo desconhecido não faz nada');
    });

    test('move(): por índice, chave, aba ou painel; DOM e lista na mesma ordem; limites; evento tabmove(cmp, painel, de, para)', t => {
      const mov = t.spy();
      const p = mk(t, { listeners: { tabmove: mov } });
      assert.eq(ordem(p), 'abc');
      p.move(0, 2);
      assert.eq(ordem(p), 'bca');
      assert.deepEq(titulos(p), ['Dois', 'Três', 'Um'], 'a faixa de abas no DOM acompanha');
      assert.deepEq(mov.lastArgs.slice(2), [0, 2], 'tabmove(cmp, painel, de, para)');
      p.move('c', 0);
      assert.eq(ordem(p), 'cba');
      p.move(p.tabs[2], 1);
      assert.eq(ordem(p), 'cab');
      p.move(p.tabs[0].cmp, 2);
      assert.eq(ordem(p), 'abc', 'também aceita o painel');
      p.move('a', 99);
      assert.eq(ordem(p), 'bca', 'índice acima do máximo vai para o fim');
      p.move('a', -5);
      assert.eq(ordem(p), 'abc', 'abaixo de zero vai para o início');
      const n = mov.count;
      p.move('a', 0);
      assert.eq(mov.count, n, 'mesma posição não dispara evento');
      p.move('inexistente', 1);
      p.move(42, 0);
      assert.eq(ordem(p), 'abc');
      assert.eq(p.move('a', 1), p, 'encadeável');
      assert.eq(p.current.key, 'a', 'mover não muda a aba ativa');
      assert.deepEq([...p.stage.children].length, 3, 'painéis intactos');
    });

    test('Alt+← / Alt+→ reordenam a aba focada e mantêm o foco; sem Alt não move; reorderable:false desliga', t => {
      const p = mk(t);
      const aba = k => p.find(k).el;
      aba('b').focus();
      tecla(aba('b'), 'ArrowRight', { altKey: true });
      assert.eq(ordem(p), 'acb', 'Alt+→ avança uma posição');
      assert.eq(document.activeElement, aba('b'), 'o foco continua na aba movida');
      tecla(aba('b'), 'ArrowLeft', { altKey: true });
      tecla(aba('b'), 'ArrowLeft', { altKey: true });
      assert.eq(ordem(p), 'bac', 'Alt+← duas vezes');
      tecla(aba('b'), 'ArrowLeft', { altKey: true });
      assert.eq(ordem(p), 'bac', 'na primeira posição não passa do início');
      tecla(aba('a'), 'ArrowRight');
      assert.eq(ordem(p), 'bac', 'sem Alt nada muda');
      const q = mk(t, { reorderable: false });
      tecla(q.find('a').el, 'ArrowRight', { altKey: true });
      assert.eq(ordem(q), 'abc', 'reorderable:false ignora Alt+setas');
      q.move('a', 2);
      assert.eq(ordem(q), 'bca', 'mas move() por código continua valendo');
      const x = mk(t);
      const fechar = x.find('c').el.querySelector('.r4-x');
      tecla(fechar, 'ArrowRight', { altKey: true });
      assert.eq(ordem(x), 'abc', 'teclas do botão de fechar não reordenam a aba');
    });

    test('arrastar uma aba por cima das outras troca a ordem (layout real; clique logo depois não ativa)', async t => {
      t.needLayout();
      if (typeof PointerEvent === 'undefined') t.skip('PointerEvent indisponível');
      const cap = Element.prototype.setPointerCapture;
      Element.prototype.setPointerCapture = function () {};   // ponteiro sintético não pode ser capturado de verdade
      t.cleanup(() => { Element.prototype.setPointerCapture = cap; });
      const p = mk(t);
      p.strip.parentNode.style.width = '700px';
      const a = p.find('a').el, r = a.getBoundingClientRect();
      assert.gt(r.width, 10, 'aba tem largura real');
      const ev = (tipo, x) => new PointerEvent(tipo, { pointerId: 7, pointerType: 'mouse', button: 0, bubbles: true, clientX: x, clientY: r.top + 5 });
      const x0 = r.left + r.width / 2;
      a.dispatchEvent(ev('pointerdown', x0));
      a.dispatchEvent(ev('pointermove', x0 + 2));
      assert.eq(ordem(p), 'abc', 'abaixo de 5px não é arrasto');
      const fim = p.find('c').el.getBoundingClientRect().right;   // solta além da última aba
      a.dispatchEvent(ev('pointermove', fim));
      assert.ok(a.classList.contains('r4-dragging'), 'marca a aba arrastada');
      assert.notEq(ordem(p), 'abc', 'passou do centro dos vizinhos: trocou de lugar');
      assert.eq(ordem(p).indexOf('a'), 2, 'a aba "a" foi para o fim');
      a.dispatchEvent(ev('pointerup', fim));
      assert.notOk(a.classList.contains('r4-dragging'));
      assert.eq(a.style.transform, '', 'transformação do arrasto removida');
      const antes = p.current;
      a.click();
      assert.eq(p.current, antes, 'o clique logo depois do arrasto não ativa a aba');
    });

    test('tabpanel pelo HTML (<r4-tab>) e pela função rápida: títulos, key, closable e conteúdo', t => {
      t.html('<r4-tabpanel id="r4t-tp"><r4-tab title="Geral" key="g">conteúdo <b>geral</b></r4-tab><r4-tab title="Extra" key="x" closable>extra</r4-tab></r4-tabpanel>');
      const p = R4.get('r4t-tp');
      assert.deepEq(titulos(p), ['Geral', 'Extra']);
      assert.eq(p.find('x').el.querySelectorAll('.r4-x').length, 1, 'closable no HTML');
      assert.eq(p.find('g').el.querySelectorAll('.r4-x').length, 0);
      assert.eq(p.find('g').cmp.body.querySelector('b').textContent, 'geral');
      p.move('x', 0);
      assert.deepEq(titulos(p), ['Extra', 'Geral']);
      const q = R4.tabpanel(t.box, { Primeira: 'um', Segunda: 'dois' });
      assert.deepEq(titulos(q), ['Primeira', 'Segunda']);
      q.move(1, 0);
      assert.deepEq(titulos(q), ['Segunda', 'Primeira']);
      const titulo = t.create({ xtype: 'tabpanel', items: [{ title: '<img src=x onerror=window.__r4tpwn=1>', html: 'x' }] });
      assert.eq(titulo.strip.querySelector('img'), null, 'título da aba é texto');
      assert.eq(window.__r4tpwn, undefined);
    });

    test('destroy do tabpanel não deixa ouvintes em document/window; roda do mouse não é capturada sem barra de rolagem', async t => {
      const sobrou = await R4Test.leaks(() => {
        const p = R4.create({ xtype: 'tabpanel', renderTo: t.box, items: [{ title: 'A', html: 'a', closable: true }, { title: 'B', html: 'b' }] });
        p.move(0, 1);
        p.add({ title: 'C' });
        p.destroy();
        assert.eq(t.box.children.length, 0, 'elemento removido');
        assert.eq(R4.get(p.id), undefined);
      });
      assert.deepEq(sobrou, [], 'ouvintes que sobraram');
      const p = mk(t);
      const ev = new WheelEvent('wheel', { deltaY: 40, bubbles: true, cancelable: true });
      p.strip.dispatchEvent(ev);
      assert.eq(ev.defaultPrevented, false, 'sem barra de rolagem a roda do mouse não é capturada (a página rola normal)');
    });

    // BUG REAL da lib (components.js, tabpanel.add): o painel de cada aba é criado com R4.create + render(stage) mas não entra em
    // this._children, então destroy() do tabpanel não destrói os painéis: eles continuam em R4.instances (vazamento de memória).
    test('destroy do tabpanel destrói também os painéis das abas (não ficam em R4.instances)', t => {
      const p = R4.create({ xtype: 'tabpanel', renderTo: t.box, items: [{ title: 'A', html: 'a' }, { title: 'B', html: 'b' }] });
      const ids = p.tabs.map(x => x.cmp.id);
      p.destroy();
      assert.deepEq(ids.filter(id => R4.get(id)), [], 'painéis que continuam registrados depois do destroy');
    });
  });
})();
