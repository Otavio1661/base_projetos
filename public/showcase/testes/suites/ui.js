/* suíte ui: accordion, dropdown, pagination, steps, alert, notify, mask e tooltip — criar, interagir por clique/teclado e destruir sem sobrar ouvintes */
(() => {
  const { suite, test, assert } = R4Test;
  const tecla = (alvo, key, extra) => alvo.dispatchEvent(new KeyboardEvent('keydown', Object.assign({ key, bubbles: true, cancelable: true }, extra)));
  const XSS = '<img src=x onerror=window.__r4tpwn=1>';

  const vazamentos = R4Test.leaks;   // ouvintes que sobram em document/window depois do destroy()

  suite('ui', () => {
    /* ---------------- accordion ---------------- */
    test('accordion: ARIA (botão ↔ região), abrir/fechar por clique, só uma aberta por vez, multiple e disabled', t => {
      const ev = t.spy(), antes = t.spy(() => true);
      const a = t.create({ xtype: 'accordion', items: [{ title: 'Um', html: '<p>um</p>', open: true }, { title: 'Dois', text: 'dois <b>x</b>' }, { title: 'Três', html: 'x', disabled: true }], listeners: { toggle: ev, beforetoggle: antes } });
      const btns = [...a.el.querySelectorAll('.r4-acc-btn')];
      assert.eq(btns.length, 3);
      assert.eq(btns[0].getAttribute('aria-expanded'), 'true');
      assert.eq(btns[1].getAttribute('aria-expanded'), 'false');
      assert.eq(btns[0].getAttribute('aria-controls'), a.el.querySelectorAll('.r4-acc-panel')[0].id);
      assert.eq(a.el.querySelectorAll('.r4-acc-panel')[0].getAttribute('aria-labelledby'), btns[0].id);
      assert.eq(a.el.querySelectorAll('.r4-acc-panel')[0].getAttribute('role'), 'region');
      assert.eq(btns[2].disabled, true);
      assert.eq(a.el.querySelectorAll('.r4-acc-body')[1].textContent, 'dois <b>x</b>', 'text vira texto puro');
      assert.eq(a.el.querySelector('.r4-acc-body b'), null);
      assert.deepEq(a.getOpen(), [0]);
      btns[1].click();
      assert.deepEq(a.getOpen(), [1], 'abrir uma fecha a outra');
      assert.eq(btns[0].getAttribute('aria-expanded'), 'false');
      assert.ok(a.el.querySelectorAll('.r4-acc-item')[1].classList.contains('r4-open'));
      assert.eq(ev.lastArgs[2], true, 'evento toggle(cmp, índice, aberto)');
      btns[1].click();
      assert.deepEq(a.getOpen(), [], 'clicar na aberta fecha');
      a.open(2);
      assert.deepEq(a.getOpen(), [], 'seção desabilitada não abre');
      a.openAll();
      assert.deepEq(a.getOpen(), [], 'openAll só vale com multiple');
      const m = t.create({ xtype: 'accordion', multiple: true, items: ['A', 'B', 'C'] });
      m.openAll();
      assert.deepEq(m.getOpen(), [0, 1, 2]);
      m.close(1);
      assert.deepEq(m.getOpen(), [0, 2]);
      m.toggle(1);
      m.closeAll();
      assert.deepEq(m.getOpen(), []);
    });

    test('accordion: beforetoggle retornando false cancela; teclado (setas/Home/End pulam desabilitados); add/remove/setHtml', t => {
      const a = t.create({ xtype: 'accordion', items: [{ title: 'A' }, { title: 'B' }, { title: 'C', disabled: true }, { title: 'D' }] });
      const b = [...a.el.querySelectorAll('.r4-acc-btn')];
      a.on('beforetoggle', (c, i) => i !== 1);
      b[1].click();
      assert.deepEq(a.getOpen(), [], 'cancelado');
      b[0].focus();
      tecla(b[0], 'ArrowDown');
      assert.eq(document.activeElement, b[1], 'seta para baixo');
      tecla(b[1], 'ArrowDown');
      assert.eq(document.activeElement, b[3], 'pula a desabilitada');
      tecla(b[3], 'ArrowDown');
      assert.eq(document.activeElement, b[0], 'volta ao início');
      tecla(b[0], 'ArrowUp');
      assert.eq(document.activeElement, b[3], 'seta para cima dá a volta');
      tecla(b[3], 'Home');
      assert.eq(document.activeElement, b[0]);
      tecla(b[0], 'End');
      assert.eq(document.activeElement, b[3]);
      a.add({ title: 'E', html: '<i>e</i>' });
      assert.eq(a.el.querySelectorAll('.r4-acc-item').length, 5);
      a.setHtml(4, '<b>novo</b>');
      assert.eq(a.el.querySelectorAll('.r4-acc-body')[4].innerHTML, '<b>novo</b>');
      a.remove(4);
      assert.eq(a.el.querySelectorAll('.r4-acc-item').length, 4);
    });

    test('accordion: destruir não deixa ouvintes em document/window', async t => {
      const sobrou = await vazamentos(() => { const a = R4.create({ xtype: 'accordion', renderTo: t.box, items: ['A', 'B'] }); a.open(0); a.destroy(); });
      assert.deepEq(sobrou, [], 'ouvintes que sobraram');
    });

    /* ---------------- dropdown ---------------- */
    test('dropdown: abre no body com role=menu, aria-expanded, itens, divisor, desabilitado e perigo', t => {
      const sel = t.spy(), h = t.spy();
      const d = t.create({ xtype: 'dropdown', text: 'Menu', items: [{ text: 'A', handler: h }, '-', { text: 'B', disabled: true }, { text: 'C', danger: true }], listeners: { select: sel } });
      assert.eq(d.btn.getAttribute('aria-haspopup'), 'menu');
      assert.eq(d.btn.getAttribute('aria-expanded'), 'false');
      assert.eq(document.getElementById(d.id + '-menu'), null, 'menu só existe aberto');
      d.btn.click();
      const m = document.getElementById(d.id + '-menu');
      assert.ok(m, 'menu no body');
      assert.eq(m.parentNode, document.body);
      assert.eq(m.getAttribute('role'), 'menu');
      assert.eq(d.btn.getAttribute('aria-expanded'), 'true');
      assert.eq(m.querySelectorAll('[role=menuitem]').length, 3);
      assert.eq(m.querySelectorAll('[role=separator]').length, 1);
      assert.eq(m.querySelector('.r4-dis').getAttribute('aria-disabled'), 'true');
      assert.ok(m.querySelector('.r4-dd-danger'));
      m.querySelector('.r4-dis').click();
      assert.eq(sel.count, 0, 'desabilitado não seleciona');
      assert.eq(d.isOpen, true);
      m.querySelector('[data-i="0"]').click();
      assert.eq(h.count, 1);
      assert.eq(sel.count, 1);
      assert.eq(sel.lastArgs[1].text, 'A', 'evento select(cmp, item)');
      assert.eq(d.isOpen, false, 'escolher fecha');
      assert.eq(document.getElementById(d.id + '-menu'), null, 'menu removido do body');
      assert.eq(d.btn.getAttribute('aria-expanded'), 'false');
    });

    test('dropdown: teclado — setas movem o foco, letra salta, Enter ativa, Esc fecha e devolve o foco; clique fora fecha', t => {
      const d = t.create({ xtype: 'dropdown', text: 'Menu', items: [{ text: 'Alfa' }, { text: 'Beta' }, { text: 'Gama' }] });
      tecla(d.btn, 'ArrowDown');
      assert.eq(d.isOpen, true, 'seta para baixo abre');
      const itens = [...d.menu.querySelectorAll('.r4-dd-item')];
      assert.eq(document.activeElement, itens[0], 'foco no primeiro item');
      tecla(itens[0], 'ArrowDown');
      assert.eq(document.activeElement, itens[1]);
      tecla(itens[1], 'End');
      assert.eq(document.activeElement, itens[2]);
      tecla(itens[2], 'ArrowDown');
      assert.eq(document.activeElement, itens[0], 'dá a volta');
      tecla(itens[0], 'g');
      assert.eq(document.activeElement, itens[2], 'digitar "g" salta para Gama');
      tecla(itens[2], 'Escape');
      assert.eq(d.isOpen, false, 'Esc fecha');
      assert.eq(document.activeElement, d.btn, 'e devolve o foco ao botão');
      tecla(d.btn, 'ArrowUp');
      assert.eq(document.activeElement, d.menu.querySelectorAll('.r4-dd-item')[2], 'seta para cima abre no último');
      document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      assert.eq(d.isOpen, false, 'clique fora fecha');
      const bloqueia = t.create({ xtype: 'dropdown', text: 'x', items: ['a'], listeners: { beforeopen: () => false } });
      bloqueia.open();
      assert.notOk(bloqueia.isOpen, 'beforeopen retornando false cancela');
      assert.eq(document.getElementById(bloqueia.id + '-menu'), null);
      const off = t.create({ xtype: 'dropdown', text: 'x', items: ['a'], disabled: true });
      off.btn.click();
      assert.notOk(off.isOpen, 'desabilitado não abre');
    });

    test('dropdown: href perigoso é descartado, r4-click usa as ações, texto/ícone hostil vira texto; setItems reabre', t => {
      const d = t.create({ xtype: 'dropdown', text: XSS, icon: XSS, items: [{ text: XSS, href: 'javascript:window.__r4tpwn=1' }, { text: 'ok', href: '/pagina' }, { text: 'Avisar', 'r4-click': 'toast:do menu' }] });
      assert.eq(d.btn.textContent, XSS + XSS, 'ícone hostil e texto hostil: ambos como texto');
      assert.eq(d.btn.querySelector('img'), null);
      d.open();
      const m = d.menu;
      assert.eq(m.querySelector('img'), null);
      const links = [...m.querySelectorAll('a')];
      assert.eq(links.length, 1, 'só o href seguro vira <a>');
      assert.eq(links[0].getAttribute('href'), '/pagina');
      assert.eq(m.querySelector('[href^="javascript"]'), null);
      assert.eq(m.querySelectorAll('.r4-dd-item')[0].textContent, XSS, 'texto como texto');
      m.querySelector('[r4-click]').click();
      assert.ok([...document.querySelectorAll('.r4-toast')].some(x => x.textContent === 'do menu'), 'r4-click do item executou');
      assert.eq(window.__r4tpwn, undefined);
      d.setItems([{ text: 'Novo' }]);
      assert.eq(d.isOpen, false);
      d.open();
      assert.eq(d.menu.querySelectorAll('.r4-dd-item').length, 1, 'novos itens');
      d.setText('Outro');
      assert.eq(d.btn.textContent, XSS + 'Outro', 'ícone mantido, texto trocado');
    });

    test('dropdown: destruir aberto remove o menu e não deixa ouvintes em document/window', async t => {
      const sobrou = await vazamentos(() => {
        const d = R4.create({ xtype: 'dropdown', renderTo: t.box, text: 'M', items: ['a', 'b'] });
        d.open();
        assert.ok(document.getElementById(d.id + '-menu'));
        d.destroy();
        assert.eq(document.getElementById(d.id + '-menu'), null, 'menu removido junto');
      });
      assert.deepEq(sobrou, [], 'ouvintes que sobraram');
    });

    /* ---------------- pagination ---------------- */
    test('pagination: janela de páginas com reticências, aria-current, info "41–50 de 100", anterior/próxima desabilitados nas pontas', t => {
      const ant = t.spy(), dep = t.spy();
      const p = t.create({ xtype: 'pagination', total: 100, pageSize: 10, page: 5, info: true, listeners: { beforepagechange: ant, pagechange: dep } });
      const rot = () => [...p.el.querySelectorAll('.r4-pgn-list > li')].map(li => li.textContent.trim() || (li.querySelector('svg') ? '<>' : ''));
      assert.deepEq(rot(), ['<>', '1', '…', '4', '5', '6', '…', '10', '<>']);
      assert.eq(p.el.querySelector('[aria-current=page]').textContent, '5');
      assert.eq(p.el.querySelector('.r4-pgn-info').textContent, '41–50 de 100');
      assert.deepEq(p.getInfo(), { page: 5, pageSize: 10, total: 100, pages: 10, from: 41, to: 50, offset: 40 });
      p.el.querySelector('[data-page="6"]').click();
      assert.eq(p.page, 6);
      assert.eq(ant.lastArgs[1], 6, 'beforepagechange(cmp, nova, atual)');
      assert.eq(ant.lastArgs[2], 5);
      assert.eq(dep.count, 1);
      assert.eq(dep.lastArgs[1], 6);
      assert.eq(dep.lastArgs[2].from, 51);
      p.el.querySelector('[data-page="next"]').click();
      assert.eq(p.page, 7);
      p.prev();
      assert.eq(p.page, 6);
      p.setPage(1);
      assert.eq(p.el.querySelector('[data-page="prev"]').disabled, true, 'primeira: anterior desabilitado');
      p.setPage(10);
      assert.eq(p.el.querySelector('[data-page="next"]').disabled, true);
      assert.eq(p.getInfo().to, 100);
    });

    test('pagination: setPage limita, não repete evento na mesma página, beforepagechange cancela, setTotal reajusta; total 0', t => {
      const dep = t.spy();
      const p = t.create({ xtype: 'pagination', total: 35, pageSize: 10, listeners: { pagechange: dep } });
      assert.eq(p.pages(), 4);
      p.setPage(99);
      assert.eq(p.page, 4, 'acima do máximo vira a última');
      p.setPage(-3);
      assert.eq(p.page, 1);
      p.setPage(1);
      assert.eq(dep.count, 2, 'mesma página não dispara evento');
      p.setPage('abc');
      assert.eq(p.page, 1, 'valor inválido não quebra');
      p.on('beforepagechange', () => false);
      p.setPage(3);
      assert.eq(p.page, 1, 'cancelado');
      p.un('beforepagechange', p._ev.beforepagechange[0].fn);
      p.setPage(4, true);
      assert.eq(dep.count, 2, 'silent não dispara evento');
      p.setTotal(15);
      assert.eq(p.page, 2, 'setTotal ajusta a página atual ao novo máximo');
      assert.eq(p.pages(), 2);
      p.setTotal(0);
      assert.eq(p.pages(), 1);
      assert.deepEq(p.getInfo().from, 0);
      const info = t.create({ xtype: 'pagination', total: 0, info: true });
      assert.eq(info.el.querySelector('.r4-pgn-info').textContent, 'Nenhum registro');
    });

    test('pagination: setas/Home/End movem o foco entre os botões; função rápida R4.pagination(alvo, total, fn)', t => {
      const mudou = t.spy();
      const p = R4.pagination(t.box, 50, mudou);
      const bs = () => [...p.el.querySelectorAll('button:not(:disabled)')];
      bs()[0].focus();
      tecla(bs()[0], 'ArrowRight');
      assert.eq(document.activeElement, bs()[1], 'seta para a direita');
      tecla(document.activeElement, 'End');
      assert.eq(document.activeElement, bs().at(-1));
      tecla(document.activeElement, 'Home');
      assert.eq(document.activeElement, bs()[0]);
      p.el.querySelector('[data-page="3"]').click();
      assert.eq(mudou.count, 1);
      assert.eq(mudou.lastArgs[0], 3, 'a função recebe a página');
      assert.eq(mudou.lastArgs[1].offset, 20);
    });

    /* ---------------- steps ---------------- */
    test('steps: estados cur/done/todo, aria-current, next/prev/goTo, finish na última, erro e reset', t => {
      const fim = t.spy(), mud = t.spy();
      const s = t.create({ xtype: 'steps', steps: ['Dados', { title: 'Pagamento', text: 'cartão' }, 'Revisão'], listeners: { finish: fim, stepchange: mud } });
      const est = () => [...s.el.querySelectorAll('.r4-step')].map(li => li.className.replace('r4-step r4-step-', ''));
      assert.deepEq(est(), ['cur', 'todo', 'todo']);
      assert.eq(s.el.querySelector('[aria-current=step]').textContent.includes('Dados'), true);
      assert.eq(s.el.querySelector('.r4-step-desc').textContent, 'cartão');
      s.next();
      assert.deepEq(est(), ['done', 'cur', 'todo']);
      assert.eq(s.getActive(), 1);
      assert.deepEq(mud.lastArgs.slice(1), [1, 0], 'stepchange(cmp, novo, antigo)');
      s.setError(1);
      assert.deepEq(est(), ['done', 'err', 'todo']);
      s.setError(1, false);
      s.goTo(2);
      assert.deepEq(est(), ['done', 'done', 'cur']);
      s.next();
      assert.eq(fim.count, 1, 'next na última conclui');
      assert.deepEq(est(), ['done', 'done', 'done']);
      s.next();
      assert.eq(fim.count, 1, 'não conclui duas vezes');
      s.prev();
      assert.deepEq(est(), ['done', 'done', 'cur'], 'prev depois de concluído reabre a última');
      s.goTo(99);
      assert.eq(s.getActive(), 2, 'goTo limita ao intervalo');
      s.reset();
      assert.deepEq(est(), ['cur', 'todo', 'todo']);
      s.on('beforestepchange', () => false);
      s.next();
      assert.eq(s.getActive(), 0, 'beforestepchange cancela');
    });

    test('steps: clickable vira botão com setas; sem clickable não é interativo; texto hostil como texto', t => {
      const s = t.create({ xtype: 'steps', steps: ['A', 'B', 'C'], clickable: true });
      const bt = () => [...s.el.querySelectorAll('button.r4-step-btn')];   // a lista é refeita a cada mudança
      assert.eq(bt().length, 3);
      bt()[2].click();
      assert.eq(s.getActive(), 2, 'clicar vai à etapa');
      bt()[2].focus();
      tecla(bt()[2], 'ArrowLeft');
      assert.eq(document.activeElement.getAttribute('data-i'), '1', 'seta para a esquerda');
      const n = t.create({ xtype: 'steps', steps: ['A', 'B'] });
      assert.eq(n.el.querySelectorAll('button').length, 0, 'sem clickable não há botões');
      const x = t.create({ xtype: 'steps', steps: [{ title: XSS, text: XSS }] });
      assert.eq(x.el.querySelector('img'), null);
      assert.eq(x.el.querySelector('.r4-step-title').textContent, XSS);
      assert.eq(window.__r4tpwn, undefined);
      const v = t.create({ xtype: 'steps', steps: ['A'], orientation: 'vertical' });
      assert.ok(v.el.classList.contains('r4-steps-v'));
    });

    /* ---------------- alert ---------------- */
    test('alert: role por variante, título, texto escapado, html confiável, fechar destrói ou esconde, beforeclose cancela', t => {
      const fechou = t.spy();
      const a = t.create({ xtype: 'alert', variant: 'warn', title: 'Atenção', text: '<b>x</b>', closable: true, listeners: { close: fechou } });
      assert.eq(a.el.getAttribute('role'), 'alert', 'warn usa role=alert');
      assert.ok(a.el.classList.contains('r4-v-warn'));
      assert.eq(a.el.querySelector('.r4-al-title').textContent, 'Atenção');
      assert.eq(a.el.querySelector('.r4-al-text').textContent, '<b>x</b>', 'text é texto');
      assert.eq(a.el.querySelector('.r4-al-text b'), null);
      assert.eq(t.create({ xtype: 'alert', variant: 'info', text: 'i' }).el.getAttribute('role'), 'status');
      assert.eq(t.create({ xtype: 'alert', variant: 'err', text: 'e' }).el.getAttribute('role'), 'alert');
      assert.ok(t.create({ xtype: 'alert', variant: 'success', text: 's' }).el.classList.contains('r4-v-ok'), 'success é sinônimo de ok');
      assert.ok(t.create({ xtype: 'alert', html: '<i class="x">h</i>' }).el.querySelector('i.x'), 'html confiável');
      a.setText('novo');
      assert.eq(a.body.textContent, 'novo');
      a.on('beforeclose', () => false);
      a.el.querySelector('.r4-al-x').click();
      assert.ok(t.box.contains(a.el), 'cancelado');
      a.un('beforeclose', a._ev.beforeclose[0].fn);
      a.el.querySelector('.r4-al-x').click();
      assert.eq(fechou.count, 1);
      assert.notOk(t.box.contains(a.el), 'fechar destrói');
      const h = t.create({ xtype: 'alert', text: 'x', closable: true, closeAction: 'hide' });
      h.close();
      assert.eq(h.el.hidden, true, 'closeAction hide só esconde');
      assert.ok(t.box.contains(h.el));
    });

    /* ---------------- notify ---------------- */
    test('notify: aparece no canto, role por tipo, título/texto escapados, fecha no ×, Esc e por programa; onClose e pilha máxima', async t => {
      const cfg0 = R4.notify.config();
      t.cleanup(() => { R4.notify.config(cfg0); R4.notify.closeAll(); });
      const fechou = t.spy();
      const h = R4.notify({ title: 'Oi', text: XSS, type: 'ok', duration: 0, onClose: fechou });
      assert.ok(document.body.contains(h.el));
      assert.eq(h.type, 'ok');
      assert.eq(h.el.getAttribute('role'), 'status');
      assert.eq(h.el.querySelector('.r4-ntf-text').textContent, XSS, 'text é texto');
      assert.eq(h.el.querySelector('img'), null);
      assert.eq(window.__r4tpwn, undefined);
      assert.ok(h.el.parentNode.classList.contains('r4-ntf-top-right'), 'canto padrão');
      assert.eq(h.el.parentNode.getAttribute('aria-live'), 'polite');
      assert.eq(R4.notify.err('x', { duration: 0 }).el.getAttribute('role'), 'alert', 'erro usa role=alert');
      assert.eq(R4.notify.warn('x', { duration: 0 }).el.getAttribute('role'), 'alert');
      assert.eq(R4.notify.info('x', { duration: 0 }).type, 'info');
      assert.eq(R4.notify('só texto', { duration: 0, position: 'bottom-left' }).el.parentNode.classList.contains('r4-ntf-bottom-left'), true, 'position');
      h.el.querySelector('.r4-ntf-x').click();
      await t.waitFor(() => !document.body.contains(h.el), 1500, 'notificação some depois do ×');
      assert.eq(fechou.count, 1);
      const e = R4.notify({ text: 'esc', duration: 0 });
      tecla(e.el, 'Escape');
      await t.waitFor(() => !document.body.contains(e.el), 1500, 'Esc fecha');
      R4.notify.config({ max: 2 });
      const a = R4.notify({ text: 'a', duration: 0 }), b = R4.notify({ text: 'b', duration: 0 }), c = R4.notify({ text: 'c', duration: 0 });
      assert.notOk(document.body.contains(a.el), 'a mais antiga saiu (max 2)');
      assert.ok(document.body.contains(b.el) && document.body.contains(c.el));
      R4.notify.closeAll();
      assert.eq(document.querySelectorAll('.r4-ntf').length, 0, 'closeAll');
    });

    test('notify: some sozinha depois de duration, pausa com o mouse/foco, ações com handler, html confiável e closable:false', async t => {
      t.cleanup(() => R4.notify.closeAll());
      const h = R4.notify({ text: 'rápida', duration: 150 });
      assert.ok(document.body.contains(h.el));
      await t.waitFor(() => !document.body.contains(h.el), 2000, 'fechamento automático');
      const p = R4.notify({ text: 'pausada', duration: 200 });
      p.el.dispatchEvent(new MouseEvent('mouseenter'));
      await t.sleep(400);
      assert.ok(document.body.contains(p.el), 'com o mouse em cima não fecha');
      p.el.dispatchEvent(new MouseEvent('mouseleave'));
      await t.waitFor(() => !document.body.contains(p.el), 2000, 'fecha depois que o mouse sai');
      const ok = t.spy(), manter = t.spy();
      const a = R4.notify({ text: 'ações', duration: 0, actions: [{ text: 'Desfazer', handler: ok }, { text: 'Manter', handler: manter, close: false }] });
      const bs = a.el.querySelectorAll('.r4-ntf-act');
      assert.eq(bs.length, 2);
      bs[1].click();
      assert.eq(manter.count, 1);
      assert.ok(document.body.contains(a.el), 'close:false mantém');
      bs[0].click();
      assert.eq(ok.count, 1);
      await t.waitFor(() => !document.body.contains(a.el), 1500, 'fecha ao clicar na ação');
      const html = R4.notify({ html: '<b class="n">negrito</b>', duration: 0 });
      assert.eq(html.el.querySelector('b.n').textContent, 'negrito', 'html é confiável');
      const nc = R4.notify({ text: 'sem x', duration: 0, closable: false });
      assert.eq(nc.el.querySelector('.r4-ntf-x'), null);
    });

    test('notify via r4-click ("notify:ok|Salvo!") e dados com __proto__ não poluem', t => {
      t.cleanup(() => R4.notify.closeAll());
      t.html('<button id="r4t-n1" r4-click="notify:ok|Salvo!">a</button><button id="r4t-n2" r4-click="notify:err|Falhou">b</button><button id="r4t-n3" r4-click="notify:só texto">c</button>');
      ['r4t-n1', 'r4t-n2', 'r4t-n3'].forEach(id => t.box.querySelector('#' + id).click());
      const ns = [...document.querySelectorAll('.r4-ntf')];
      assert.eq(ns.length, 3);
      assert.ok(ns[0].classList.contains('r4-v-ok') || ns.some(n => n.classList.contains('r4-v-ok')));
      assert.ok(ns.some(n => n.textContent.includes('Salvo!') && n.classList.contains('r4-v-ok')), 'tipo ok');
      assert.ok(ns.some(n => n.textContent.includes('Falhou') && n.classList.contains('r4-v-err')), 'tipo err');
      assert.ok(ns.some(n => n.textContent.includes('só texto')), 'sem tipo vira info');
      R4.notify(JSON.parse('{"text":"x","duration":0,"__proto__":{"pwnNt":1},"constructor":{"prototype":{"pwnNt2":1}}}'));
      assert.eq({}.pwnNt, undefined);
      assert.eq({}.pwnNt2, undefined);
    });

    /* ---------------- mask ---------------- */
    test('mask: cobre o alvo, aria-busy, conteúdo inert, texto atualizável e unmask restaura tudo (devolve true/false)', t => {
      const alvo = document.createElement('div');
      alvo.innerHTML = '<button id="r4t-mb">clique</button><p>conteúdo</p>';
      t.box.append(alvo);
      const m = R4.mask(alvo, 'Carregando x');
      assert.eq(alvo.getAttribute('aria-busy'), 'true');
      assert.ok(alvo.querySelector('.r4-lmask'), 'overlay dentro do alvo');
      assert.eq(m.el.getAttribute('role'), 'status');
      assert.contains(m.el, 'Carregando x');
      assert.eq(alvo.querySelector('#r4t-mb').hasAttribute('inert'), true, 'conteúdo de trás inert');
      assert.eq(m.el.hasAttribute('inert'), false, 'o overlay não');
      const mesmo = R4.mask(alvo, 'Outro texto');
      assert.eq(mesmo, m, 'mascarar de novo só troca o texto');
      assert.contains(m.el, 'Outro texto');
      assert.eq(alvo.querySelectorAll('.r4-lmask').length, 1);
      m.update('Terceiro');
      assert.contains(m.el, 'Terceiro');
      assert.eq(R4.unmask(alvo), true);
      assert.eq(alvo.querySelector('.r4-lmask'), null);
      assert.eq(alvo.getAttribute('aria-busy'), null);
      assert.eq(alvo.querySelector('#r4t-mb').hasAttribute('inert'), false);
      assert.eq(R4.unmask(alvo), false, 'sem máscara devolve false');
      const m2 = R4.mask(alvo);
      assert.contains(m2.el, 'Carregando...', 'texto padrão em português');
      m2.close();
      assert.eq(alvo.querySelector('.r4-lmask'), null, 'close() do handle também remove');
      assert.throws(() => R4.mask('#nao-existe-r4t'), /alvo não encontrado/);
    });

    test('mask: aceita seletor e componente como alvo; texto vazio mostra só o círculo (com rótulo para leitor de tela)', t => {
      t.box.id = 'r4t-mask-box';
      const m = R4.mask('#r4t-mask-box', '');
      assert.eq(t.box.querySelector('.r4-lmask-text').hidden, true);
      assert.ok(t.box.querySelector('.r4-sr'), 'texto só para leitor de tela');
      R4.unmask('#r4t-mask-box');
      const p = t.create({ xtype: 'panel', title: 'P', html: 'x' });
      const mc = R4.mask(p, 'No painel');
      assert.ok(p.el.contains(mc.el), 'componente como alvo');
      assert.eq(R4.unmask(p), true);
    });

    test('mask: em document.body prende o Tab e desfaz tudo ao remover (sem sobrar inert nem ouvintes)', async t => {
      const antes = [...document.body.children].filter(n => n.hasAttribute('inert')).length;
      const m = R4.mask(document.body, 'Tela toda');
      t.cleanup(() => R4.unmask(document.body));
      assert.ok(m.el.classList.contains('r4-lmask-fixed'));
      const ev = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
      m.el.dispatchEvent(ev);
      assert.eq(ev.defaultPrevented, true, 'Tab é preso');
      assert.gt([...document.body.children].filter(n => n.hasAttribute('inert')).length, antes, 'o resto da página fica inert');
      assert.eq(R4.unmask(document.body), true);
      assert.eq([...document.body.children].filter(n => n.hasAttribute('inert')).length, antes, 'nada ficou inert');
      assert.eq(document.body.getAttribute('aria-busy'), null);
    });

    /* ---------------- tooltip ---------------- */
    test('tooltip: r4-tip no foco mostra o texto (como texto), liga aria-describedby, Esc/foco fora escondem e restauram', t => {
      t.html('<button id="r4t-tp" r4-tip="<b>dica</b> segura" aria-describedby="outro-id">alvo</button>');
      const b = t.box.querySelector('#r4t-tp');
      b.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
      const box = document.querySelector('.r4-tipbox');
      assert.ok(box && !box.hidden, 'caixa visível');
      assert.eq(box.getAttribute('role'), 'tooltip');
      assert.eq(box.textContent, '<b>dica</b> segura', 'texto puro');
      assert.eq(box.querySelector('b'), null);
      assert.eq(b.getAttribute('aria-describedby'), 'outro-id ' + box.id, 'acrescenta sem perder o existente');
      tecla(b, 'Escape');
      assert.eq(box.hidden, true);
      assert.eq(b.getAttribute('aria-describedby'), 'outro-id', 'restaura o original');
      b.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
      assert.eq(box.hidden, false);
      b.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
      assert.eq(box.hidden, true, 'sair do foco esconde');
      const c = document.createElement('button');
      c.setAttribute('r4-tip', 't');
      t.box.append(c);
      c.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
      c.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
      assert.eq(c.hasAttribute('aria-describedby'), false, 'sem describedby original: o atributo some');
    });

    test('tooltip: com o mouse aparece depois de ~350 ms e some ao sair; R4.tip.attach/show/hide; <r4-tooltip> focável', async t => {
      t.html('<button id="r4t-m" r4-tip="com mouse">alvo</button>');
      const b = t.box.querySelector('#r4t-m');
      b.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      const visivel = () => { const x = document.querySelector('.r4-tipbox'); return x && !x.hidden && x.textContent === 'com mouse'; };
      assert.notOk(visivel(), 'não aparece na hora');
      await t.waitFor(visivel, 2000, 'tooltip depois do atraso');
      b.dispatchEvent(new MouseEvent('mouseout', { bubbles: true }));
      assert.notOk(visivel(), 'sair esconde');
      const x = document.createElement('span');
      t.box.append(x);
      assert.eq(R4.tip.attach(x, 'por js', 'bottom'), x);
      assert.eq(x.getAttribute('r4-tip'), 'por js');
      assert.eq(x.getAttribute('r4-tip-pos'), 'bottom');
      R4.tip.show(x);
      assert.eq(document.querySelector('.r4-tipbox').textContent, 'por js');
      assert.eq(document.querySelector('.r4-tipbox').hidden, false);
      R4.tip.hide();
      assert.eq(document.querySelector('.r4-tipbox').hidden, true);
      t.html('<r4-tooltip id="r4t-tt" text="no componente">conteúdo</r4-tooltip>');
      const tt = R4.get('r4t-tt');
      assert.eq(tt.el.getAttribute('tabindex'), '0', 'focável para o teclado');
      assert.eq(tt.el.getAttribute('r4-tip'), 'no componente');
      tt.setText('novo texto');
      assert.eq(tt.el.getAttribute('r4-tip'), 'novo texto');
      tt.el.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
      assert.eq(document.querySelector('.r4-tipbox').textContent, 'novo texto');
      tt.destroy();
      assert.eq(document.querySelector('.r4-tipbox').hidden, true, 'destruir o alvo esconde a dica');
    });

    /* ---------------- stat / badge / tag / avatar / progress / skeleton / spinner / breadcrumb / timeline / emptystate ---------------- */
    test('progress, spinner, skeleton: valor/ARIA, limites, estados e eventos', t => {
      const mud = t.spy(), fim = t.spy();
      const p = t.create({ xtype: 'progress', value: 40, label: 'Envio', listeners: { change: mud, complete: fim } });
      const bar = p.el.querySelector('[role=progressbar]');
      assert.ok(bar, 'role=progressbar');
      assert.eq(bar.getAttribute('aria-valuenow'), '40');
      assert.eq(bar.getAttribute('aria-valuemin'), '0');
      assert.eq(bar.getAttribute('aria-valuemax'), '100');
      assert.contains(p.el, '40%');
      p.setValue(150);
      assert.eq(bar.getAttribute('aria-valuenow'), '100', 'limita ao máximo');
      assert.eq(fim.count, 1, 'complete ao chegar em 100%');
      p.setValue(-5);
      assert.eq(bar.getAttribute('aria-valuenow'), '0', 'limita a zero');
      p.setMax(200); p.setValue(50);
      assert.contains(p.el, '25%');
      p.setIndeterminate(true);
      assert.eq(bar.hasAttribute('aria-valuenow'), false, 'indeterminada: sem valor');
      assert.ok(mud.count >= 2);
      const c = t.create({ xtype: 'progress', type: 'circle', value: 30, diameter: 80 });
      assert.ok(c.el.querySelector('svg'), 'círculo é SVG');
      assert.notOk(/NaN/.test(c.el.innerHTML), 'sem NaN no círculo');
      const s = t.create({ xtype: 'spinner', text: 'Carregando dados' });
      assert.contains(s.el, 'Carregando dados');
      assert.eq(s.el.getAttribute('role'), 'status');
      const sk = t.create({ xtype: 'skeleton', type: 'list', rows: 4 });
      assert.eq(sk.el.getAttribute('role'), 'status');
      assert.eq(sk.el.getAttribute('aria-busy'), 'true');
      assert.eq(sk.el.getAttribute('aria-label'), 'Carregando conteúdo');
      assert.eq(sk.el.querySelectorAll('.r4-sk-row').length, 4, 'uma linha por item da lista');
    });

    test('breadcrumb, badge, tag e avatar: texto seguro, href perigoso descartado, contador 99+, iniciais, tag fecha', t => {
      const bc = t.create({ xtype: 'breadcrumb', items: [{ text: 'Início', href: '/' }, { text: XSS, href: 'javascript:window.__r4tpwn=1' }, 'Atual'] });
      assert.eq(bc.el.querySelector('img'), null);
      assert.eq(bc.el.querySelectorAll('a').length, 1, 'só o link seguro');
      assert.eq(bc.el.querySelector('[href^=javascript]'), null);
      assert.eq(bc.el.querySelector('[aria-current=page]').textContent, 'Atual', 'último item é a página atual');
      assert.eq(bc.el.localName, 'nav');
      const b = t.create({ xtype: 'badge', count: 150, max: 99 });
      assert.eq(b.el.textContent, '99+');
      b.setCount(5);
      assert.eq(b.el.textContent, '5');
      assert.eq(t.create({ xtype: 'badge', text: XSS }).el.querySelector('img'), null);
      const fecha = t.spy();
      const tg = t.create({ xtype: 'tag', text: 'etiqueta', closable: true, listeners: { close: fecha } });
      tg.el.querySelector('button').click();
      assert.eq(fecha.count, 1);
      assert.notOk(t.box.contains(tg.el), 'tag some ao fechar');
      const av = t.create({ xtype: 'avatar', name: 'Ana Maria Souza' });
      assert.eq(av.el.textContent, 'AS', 'iniciais do primeiro e do último nome');
      assert.eq(av.el.getAttribute('role') === 'img' || !!av.el.getAttribute('aria-label'), true, 'nome acessível');
      const av2 = t.create({ xtype: 'avatar', name: XSS, src: 'javascript:window.__r4tpwn=1' });
      assert.eq(av2.el.querySelector('img'), null, 'src perigoso não vira <img>');
      assert.eq(window.__r4tpwn, undefined);
      const av3 = t.create({ xtype: 'avatar', name: 'Zé', src: '/img/x.png' });
      assert.eq(av3.el.querySelector('img').getAttribute('src'), '/img/x.png');
    });

    test('stat/stats: formatos pt-BR, variação com sinal e cor, invert; fonte src com fetch simulado; timeline ordena e limita', async t => {
      const s = t.create({ xtype: 'stat', title: 'Receita', value: 1234.5, format: 'money', change: 12.5, changeText: 'vs. mês anterior' });
      assert.contains(s.el, 'Receita');
      assert.eq(s.el.querySelector('.r4-stat-value').textContent.replace(/ /g, ' '), 'R$ 1.234,50');
      assert.contains(s.el, '12,5');
      assert.contains(s.el, 'vs. mês anterior');
      assert.ok(s.el.querySelector('.r4-stat-change.r4-pos.r4-up'), 'variação positiva: verde e seta para cima');
      assert.contains(s.el.querySelector('.r4-sr'), 'Aumento de', 'texto para leitor de tela');
      const neg = t.create({ xtype: 'stat', title: 'Churn', value: 3, change: -2, invert: true });
      assert.ok(neg.el.querySelector('.r4-stat-change.r4-down'), 'variação negativa: seta para baixo');
      assert.ok(neg.el.querySelector('.r4-stat-change.r4-pos'), 'invert: queda é boa (cor positiva)');
      const pct = t.create({ xtype: 'stat', title: 'Taxa', value: 3.84, format: 'percent', decimals: 2 });
      assert.contains(pct.el, '3,84');
      assert.eq(t.create({ xtype: 'stat', title: 'Peso', value: 1536, format: 'bytes' }).el.textContent.includes('1.5 KB'), true);
      t.mockFetch({ '/api/kpis': { body: [{ id: 'a', titulo: 'Vendas', valor: 10, formato: 'number' }, { id: 'b', titulo: 'Pedidos', valor: 7 }] } });
      const ss = t.create({ xtype: 'stats', src: '/api/kpis' });
      await t.waitFor(() => ss.el.querySelectorAll('.r4-stat').length === 2, 2000, 'cartões do src');
      assert.contains(ss.el, 'Vendas');
      const um = t.create({ xtype: 'stat', src: '/api/kpis', key: 'b' });
      await t.waitFor(() => um.el.textContent.includes('Pedidos'), 2000, 'stat por key');
      const tl = t.create({ xtype: 'timeline', order: 'desc', limit: 2, items: [{ title: 'A', date: '2026-01-01' }, { title: 'B', date: '2026-03-01' }, { title: 'C', date: '2026-02-01' }] });
      const tit = [...tl.el.querySelectorAll('.r4-tl-title')].map(x => x.textContent);
      assert.deepEq(tit, ['B', 'C'], 'ordena por data (desc) e limita a 2');
      const es = t.create({ xtype: 'emptystate', title: 'Vazio', text: 'sem dados', actionText: 'Criar', actionClick: 'toast:criado' });
      assert.eq(es.el.querySelector('.r4-es-title').textContent, 'Vazio');
      es.btn.click();
      assert.ok([...document.querySelectorAll('.r4-toast')].some(x => x.textContent === 'criado'), 'botão de ação usa r4-click');
    });
  });
})();
