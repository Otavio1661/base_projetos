/* suíte tabs: tabpanel (abas, fechar, key), reordenar com move()/Alt+setas/arrastar, ARIA de tablist, abas persistentes (persist/restoreSaved/maxTabs) */
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

    /* ---------- abas persistentes (persist / persistTtl / maxTabs) ---------- */
    const T0 = 1700000000000, CH = 'teste.abas', RAW = 'r4:' + CH;
    const RLO = String.fromCharCode(0x202e), NUL = String.fromCharCode(0);
    const SUJO = new RegExp('[<>' + RLO + NUL + ']');
    /** área de armazenamento falsa que conta gravações por chave */
    class Area {
      constructor() { this.m = new Map(); this.w = {}; }
      get length() { return this.m.size; }
      key(i) { const k = [...this.m.keys()][i]; return k === undefined ? null : k; }
      getItem(k) { return this.m.has(k) ? this.m.get(k) : null; }
      setItem(k, v) { this.m.set(k, String(v)); this.w[k] = (this.w[k] || 0) + 1; }
      removeItem(k) { this.m.delete(k); }
    }
    /** troca o R4.store principal por uma área e um relógio falsos (volta ao normal no fim do teste) */
    function falso(t) {
      const orig = R4.store._area(), antes = R4.store._agora, area = new Area(), clock = { t: T0 };
      R4.store.use(area); R4.store._agora = () => clock.t;
      t.cleanup(() => { R4.store.use(orig); R4.store._agora = antes; });
      return { area, clock, salvo: () => { const r = area.getItem(RAW); return r === null ? null : JSON.parse(r); } };
    }
    // grava DIRETO na área (como outro script/extensão) e faz o store reler (ele guarda em cache o que já leu)
    const direto = (area, raw) => { area.setItem(RAW, raw); R4.store.use(area); };
    const grava = (area, d, extra) => direto(area, JSON.stringify(Object.assign({ v: 1, d, e: T0 + 1e9, a: T0, b: 10 }, extra)));
    const persiste = (t, extra) => mk(t, Object.assign({ persist: CH }, extra));

    test('persist: salva só {key, título curto} de cada aba e a aba ativa (nunca conteúdo/HTML); aba sem key não entra; título é texto puro e curto', t => {
      const { area, salvo } = falso(t);
      const p = t.create({ xtype: 'tabpanel', persist: CH, items: [
        { title: 'Um', key: 'a', html: 'SEGREDO-DE-CONTEUDO' }, { title: 'Sem chave', html: 'x' },
        { title: '<img src=x onerror=1>Dois' + RLO + NUL + 'z'.repeat(100), key: 'b.x-1_2', html: '<b>html</b>' }, { title: 'Chave ruim', key: 'a b/../c' }] });
      assert.eq(area.getItem(RAW), null, 'montar o painel não grava nada (só mudanças)');
      p.setActive(p.find('b.x-1_2'));
      assert.eq(p.saveState(), true);
      const d = salvo().d;
      assert.deepEq(d.tabs.map(x => x.key), ['a', 'b.x-1_2'], 'só chaves [A-Za-z0-9_.-]');
      assert.eq(d.active, 'b.x-1_2');
      assert.ok(d.tabs.every(x => x.title.length <= 60 && !SUJO.test(x.title)), 'título curto, sem < > nem controles');
      assert.notContains(area.getItem(RAW), 'SEGREDO'); assert.notContains(area.getItem(RAW), 'html');
      assert.eq(salvo().e, T0 + 7 * 86400000, 'persistTtl padrão: 7 dias');
      p.setActive(p.find('a')); p.saveState();
      assert.eq(salvo().d.active, 'a');
    });

    test('gravação com debounce (~300 ms): abrir, fechar, mover e trocar de aba em rajada viram UMA gravação; sem persist não grava', async t => {
      const { area, salvo } = falso(t);
      const p = persiste(t);
      p.add({ title: 'Quatro', key: 'd', closable: true }); p.move('d', 0); p.setActive(p.find('b')); p.remove(p.find('c')); p.add({ title: 'Cinco', key: 'e' });
      assert.eq(area.w[RAW] || 0, 0, 'ainda não gravou (debounce)');
      await t.sleep(450);
      assert.eq(area.w[RAW], 1, 'uma gravação só');
      assert.deepEq(salvo().d.tabs.map(x => x.key), ['d', 'a', 'b', 'e']);
      assert.eq(salvo().d.active, 'e');
      p.find('b').el.click(); p.find('d').el.querySelector('.r4-x').click();
      await t.sleep(450);
      assert.deepEq(salvo().d.tabs.map(x => x.key), ['a', 'b', 'e'], 'fechar remove do estado salvo');
      const antes = Object.keys(area.w).length;
      const q = mk(t); q.add({ title: 'x', key: 'zz' }); q.move('a', 2);
      await t.sleep(400);
      assert.eq(Object.keys(area.w).length, antes, 'sem persist nada novo é gravado');
    });

    test('restaurar: restoreSaved(fábrica) recria na ordem, reativa a aba ativa, não repete chave aberta, ignora chave fora da lista permitida e dispara tabsrestore', t => {
      const { salvo } = falso(t);
      const a = persiste(t); a.add({ title: 'Quatro', key: 'd' }); a.setActive(a.find('b')); a.move('d', 0); a.saveState();
      assert.deepEq(salvo().d.tabs.map(x => x.key), ['d', 'a', 'b', 'c']);
      const vistas = [], rest = t.spy();
      const b = t.create({ xtype: 'tabpanel', persist: CH, items: [{ title: 'Início', key: 'a', html: 'já aberta' }], listeners: { tabsrestore: rest } });
      const n = b.restoreSaved(s => { vistas.push(s.key); return s.key === 'c' ? null : { title: 'T-' + s.key, html: 'conteúdo ' + s.key, closable: true }; });
      assert.eq(n, 2, 'abriu d e b (a já existia, c foi barrada pela fábrica)');
      assert.deepEq(vistas, ['d', 'b', 'c'], 'a fábrica só é consultada para o que ainda não está aberto (a não passa por ela)');
      assert.deepEq(b.tabs.map(x => x.key), ['a', 'd', 'b']);
      assert.eq(b.current.key, 'b', 'aba ativa salva reativada');
      assert.eq(b.find('d').el.firstChild.textContent, 'T-d', 'título vem da fábrica (não do storage)');
      assert.eq(rest.count, 1); assert.eq(rest.lastArgs[0], b); assert.eq(rest.lastArgs[2], 2);
      assert.deepEq(salvo().d.tabs.map(x => x.key), ['a', 'd', 'b'], 'estado regravado só com o que valeu (c descartada)');
      assert.eq(b.restoreSaved(s => ({ title: s.key })), 0, 'de novo: nada novo, nada duplicado');
      assert.eq(b.tabs.length, 3);
      const c = t.create({ xtype: 'tabpanel', persist: 'teste.outra', items: [] });
      assert.eq(c.restoreSaved(() => ({ title: 'x' })), 0, 'sem estado salvo'); assert.eq(c.getSavedState(), null);
      assert.eq(t.create({ xtype: 'tabpanel', items: [] }).restoreSaved(() => ({ title: 'x' })), 0, 'sem persist');
    });

    test('getSavedState SEMPRE valida: estado adulterado (chaves maliciosas, tipos errados, duplicadas, 500 abas) é filtrado ou apagado', t => {
      const { area, salvo } = falso(t);
      const p = persiste(t, { maxTabs: 30 });
      const mal = [{ key: '__proto__', title: 'x' }, { key: 'constructor' }, { key: 'prototype' }, { key: 'a b' }, { key: '../etc/passwd' }, { key: '' }, { key: 'x'.repeat(65) }, { key: 5 }, { key: ['a'] },
        null, 7, 'texto', [], { title: 'sem key' }, { key: 'ok', title: '<b>negrito</b>' + RLO }, { key: 'ok', title: 'duplicada' }, { key: 'ok2', title: 42 }, { key: 'ok3', title: 'y'.repeat(500) }];
      grava(area, { tabs: mal, active: 'naoexiste' });
      const st = p.getSavedState();
      assert.deepEq(st.tabs.map(x => x.key), ['ok', 'ok2', 'ok3'], 'só as chaves válidas, sem duplicata');
      assert.eq(st.active, null, 'ativa inexistente vira null');
      assert.ok(st.tabs.every(x => typeof x.title === 'string' && x.title.length >= 1 && x.title.length <= 60 && !SUJO.test(x.title)), 'títulos limpos e curtos');
      assert.eq(st.tabs[1].title, 'ok2', 'título que não é texto vira a própria chave');
      assert.eq(({}).polui, undefined);
      grava(area, { tabs: [{ key: 'a' }, { key: 'b' }], active: 'b' });
      assert.eq(p.getSavedState().active, 'b');
      // tipos errados no nível de cima: descartado e a chave é APAGADA pela lixeira
      ['texto', 123, [], null, {}, { tabs: 'x' }, { tabs: {} }, { tabs: [] }, { tabs: [null, 3, 'a'] }, { active: 'a' }].forEach(d => {
        grava(area, d);
        assert.eq(p.getSavedState(), null, 'inválido: ' + JSON.stringify(d));
        assert.eq(area.getItem(RAW), null, 'e apagado do storage: ' + JSON.stringify(d));
      });
      // 500 abas: só entram até maxTabs (ou 100 sem limite)
      const muitas = Array.from({ length: 500 }, (_, i) => ({ key: 'k' + i, title: 'Aba ' + i }));
      grava(area, { tabs: muitas, active: 'k499' });
      const s30 = p.getSavedState();
      assert.eq(s30.tabs.length, 30, 'respeita maxTabs'); assert.eq(s30.active, null, 'a ativa ficou fora do corte');
      const q = persiste(t, { maxTabs: 0 });
      grava(area, { tabs: muitas }); assert.eq(q.getSavedState().tabs.length, 100, 'sem maxTabs: teto de 100');
      // JSON quebrado, versão antiga e envelope vencido
      direto(area, '{quebrado'); assert.eq(p.getSavedState(), null); assert.eq(area.getItem(RAW), null);
      direto(area, JSON.stringify({ v: 9, d: { tabs: [{ key: 'a' }] } })); assert.eq(p.getSavedState(), null); assert.eq(area.getItem(RAW), null);
      grava(area, { tabs: [{ key: 'a' }] }, { e: T0 - 1 }); assert.eq(p.getSavedState(), null, 'vencido'); assert.eq(area.getItem(RAW), null);
      // restaurar com estado adulterado nunca abre o que a fábrica não permite
      grava(area, { tabs: [{ key: '__proto__' }, { key: 'constructor' }, { key: 'ok' }, { key: 'hasOwnProperty' }], active: 'ok' });
      const alvo = t.create({ xtype: 'tabpanel', persist: CH, items: [{ title: 'Início', key: 'home' }] });
      const PERMITIDAS = { ok: 'Ok' };
      assert.eq(alvo.restoreSaved(s => (Object.prototype.hasOwnProperty.call(PERMITIDAS, s.key) ? { title: PERMITIDAS[s.key] } : null)), 1);
      assert.deepEq(alvo.tabs.map(x => x.key), ['home', 'ok']);
      assert.deepEq(salvo().d.tabs.map(x => x.key), ['home', 'ok'], 'estado regravado limpo');
    });

    test('TTL das abas: a validade (persistTtl) é renovada a cada uso e, vencida, a lixeira apaga o estado', t => {
      const { area, clock, salvo } = falso(t);
      const p = persiste(t, { persistTtl: '1h' });
      p.add({ title: 'N', key: 'n' }); p.saveState();
      assert.eq(salvo().e, T0 + 3600000);
      assert.eq(salvo().s, 3600000, 'sliding');
      clock.t += 50 * 60000; assert.ok(p.getSavedState(), 'ainda vale aos 50 min');
      clock.t += 50 * 60000; assert.ok(p.getSavedState(), 'a leitura renovou: vale aos 100 min');
      clock.t += 61 * 60000; assert.eq(p.getSavedState(), null, 'sem uso por mais de 1 h: expirou');
      assert.eq(area.getItem(RAW), null, 'e foi apagado');
      p.saveState(); assert.ok(salvo(), 'grava de novo normalmente');
      const q = persiste(t, { persistTtl: 'lixo' });
      q.saveState(); assert.eq(salvo().e - clock.t, 7 * 86400000, 'ttl inválido: padrão do store (7 dias)');
    });

    test('maxTabs: ao passar do limite fecha a aba mais ANTIGA que não esteja ativa (nunca a ativa nem a nova); 0 = sem limite; itens iniciais não são cortados', t => {
      const fechadas = [];
      const p = mk(t, { maxTabs: 3, listeners: { tabremove: (c, painel, key) => fechadas.push(key) } });   // a, b, c
      assert.eq(p.tabs.length, 3);
      const novo = p.add({ title: 'D', key: 'd' });
      assert.deepEq(p.tabs.map(x => x.key), ['b', 'c', 'd'], 'a (a mais antiga) saiu');
      assert.eq(R4.get(novo.id), novo);
      p.setActive(p.find('b'));
      p.add({ title: 'E', key: 'e' }, false);
      assert.deepEq(p.tabs.map(x => x.key), ['b', 'd', 'e'], 'b é a mais antiga mas está ativa: saiu c');
      assert.eq(p.current.key, 'b');
      p.move('e', 0); p.add({ title: 'F', key: 'f' }, false);
      assert.deepEq(p.tabs.map(x => x.key).sort(), ['b', 'e', 'f'], 'a ordem de criação conta, não a posição: d (mais antiga) saiu');
      assert.deepEq(fechadas, ['a', 'c', 'd']);
      const livre = mk(t, { maxTabs: 0 });
      for (let i = 0; i < 40; i++) livre.add({ title: 'n' + i, key: 'n' + i }, false);
      assert.eq(livre.tabs.length, 43, 'sem limite');
      const grande = t.create({ xtype: 'tabpanel', maxTabs: 2, items: ['a', 'b', 'c', 'd'].map(k => ({ title: k, key: k })) });
      assert.eq(grande.tabs.length, 4, 'itens iniciais (config) não são cortados');
      grande.add({ title: 'e', key: 'e' });
      assert.eq(grande.tabs.length, 2, 'ao abrir uma nova, o limite passa a valer');
      assert.eq(grande.current.key, 'e');
      assert.eq(t.create({ xtype: 'tabpanel', items: [] }).maxTabs, 30, 'padrão 30');
    });

    test('clearSaved(): apaga o estado salvo (sem fechar abas) e cancela gravação pendente; persist vazio/inválido/sensível nunca grava nem lança', async t => {
      const { area, salvo } = falso(t);
      const p = persiste(t);
      p.saveState(); assert.ok(salvo());
      assert.eq(p.clearSaved(), p, 'encadeável'); assert.eq(area.getItem(RAW), null); assert.eq(p.tabs.length, 3, 'as abas abertas continuam');
      p.move('a', 2);                            // agenda gravação...
      p.clearSaved();                            // ...e o apagar cancela
      await t.sleep(450);
      assert.eq(area.getItem(RAW), null, 'gravação pendente cancelada');
      p.setActive(p.find('b')); await t.sleep(450);
      assert.ok(salvo(), 'depois de limpar, novas mudanças voltam a ser salvas');
      assert.eq(mk(t).saveState(), false, 'persist vazio: não grava'); assert.eq(mk(t).getSavedState(), null);
      ['a b', 'x'.repeat(70), '__meta'].forEach(k => { const q = mk(t, { persist: k }); assert.eq(q.saveState(), false); assert.eq(q.getSavedState(), null); q.clearSaved(); });
      assert.gt(t.logs.take('warn').length, 0, 'chave inválida avisa no console');
      const s = mk(t, { persist: 'auth.abas' }); assert.eq(s.saveState(), false, 'nome sensível é recusado pelo R4.store'); assert.eq(area.getItem('r4:auth.abas'), null);
      t.logs.take('warn');
    });

    test('ciclo de vida: fechar a aba destrói também os componentes de dentro (nada sobra em R4.instances); destroy cancela gravação adiada; pagehide grava a pendente', async t => {
      const { area, salvo } = falso(t);
      const base = Object.keys(R4.instances).length;
      const p = persiste(t);
      const painel = p.add({ title: 'Com botão', key: 'btn', closable: true, html: '<r4-button id="r4t-dentro">ok</r4-button><r4-textfield label="x"></r4-textfield>' });
      R4.scan(painel.el);
      const dentro = Object.keys(R4.instances).filter(id => R4.instances[id] !== painel && R4.instances[id].el && painel.el.contains(R4.instances[id].el));
      assert.gt(dentro.length, 0, 'há componentes montados dentro da aba');
      p.find('btn').el.querySelector('.r4-x').click();
      assert.eq(dentro.filter(id => R4.instances[id]).length, 0, 'todos destruídos junto com a aba');
      assert.eq(R4.instances[painel.id], undefined);
      p.destroy();
      assert.eq(Object.keys(R4.instances).length, base, 'nada sobrou em R4.instances (' + (Object.keys(R4.instances).length - base) + ' a mais)');
      // destroy antes do debounce: não grava depois
      const q = persiste(t); q.add({ title: 'z', key: 'z' }); const antes = area.w[RAW] || 0; q.destroy();
      await t.sleep(450);
      assert.eq(area.w[RAW] || 0, antes, 'painel destruído não grava');
      // sair da página (pagehide) grava o que estava pendente
      const r = persiste(t); r.add({ title: 'y', key: 'y' });
      const n = area.w[RAW] || 0;
      window.dispatchEvent(new Event('pagehide'));
      assert.eq(area.w[RAW], n + 1, 'pagehide gravou na hora');
      assert.ok(salvo().d.tabs.some(x => x.key === 'y'));
      await t.sleep(400);
      assert.eq(area.w[RAW], n + 1, 'e o timer adiado não grava de novo');
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
