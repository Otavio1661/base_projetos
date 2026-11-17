/* suíte repeater: itens por <r4-item-template>, valor = array de objetos, add/remove/move, min/max, validação por item,
   integração com o form (getValues/setValues/reset), bindings dentro do item, limites e chaves perigosas. */
(() => {
  const { suite, test, assert } = R4Test;
  const quadro = t => t.sleep(50);
  const digitar = (inp, v) => { inp.value = v; inp.dispatchEvent(new Event('input', { bubbles: true })); };
  const TPL = '<r4-item-template><r4-textfield name="dias" label="Dias" required></r4-textfield><r4-textfield name="inicio" label="Início"></r4-textfield></r4-item-template>';
  const montar = (t, attrs = '', extra = '') => {
    t.html('<r4-form id="rpt-f"><r4-repeater name="horarios" label="Horários" ' + attrs + '>' + TPL + '</r4-repeater>' + extra + '</r4-form>');
    const f = R4.get('rpt-f');
    return { f, r: f.getField('horarios') };
  };
  const btn = (it, act) => it.tools.querySelector('[data-act="' + act + '"]');

  suite('repeater', () => {
    test('monta pelo HTML: min cria itens, value (JSON) preenche, valor = array de objetos e o form só vê o repeater', t => {
      const { f, r } = montar(t, 'min="1" max="4" item-title="{dias} {inicio}" value=\'[{"dias":"Seg","inicio":"08:00"},{"dias":"Sáb"}]\'');
      assert.eq(r.xtype, 'repeater');
      assert.eq(r.count(), 2);
      assert.deepEq(r.getValue(), [{ dias: 'Seg', inicio: '08:00' }, { dias: 'Sáb', inicio: '' }]);
      assert.deepEq(Object.keys(f.getValues()), ['horarios'], 'campos internos não vazam para o form');
      assert.deepEq(f.getValues().horarios, r.getValue());
      assert.deepEq([...r.el.querySelectorAll('.r4-rep-title')].map(n => n.textContent), ['Seg 08:00', 'Sáb'], 'título por item');
      assert.eq(r.box.getAttribute('role'), 'group'); assert.eq(r.listEl.getAttribute('role'), 'list');
      assert.eq(r.getItems()[0].el.getAttribute('role'), 'listitem');
      t.html('<r4-repeater name="x" label="X" min="2">' + TPL + '</r4-repeater>');
      const r2 = R4.instances[t.box.querySelector('.r4-repeater').id];
      assert.eq(r2.count(), 2, 'min="2" já nasce com 2 itens');
    });

    test('add / remove / move: eventos, limites min/max, botões e aria-labels', t => {
      const { r } = montar(t, 'min="1" max="3" item-title="{dias}"');
      const ev = { add: t.spy(), remove: t.spy(), move: t.spy(), change: t.spy() };
      Object.keys(ev).forEach(k => r.on(k, ev[k]));
      assert.eq(r.count(), 1);
      assert.ok(btn(r.getItems()[0], 'remove').disabled, 'não remove abaixo do mínimo');
      r.add({ dias: 'B' }); r.add({ dias: 'C' });
      assert.eq(ev.add.count, 2); assert.eq(ev.change.count, 2);
      assert.eq(r.add({ dias: 'D' }), null, 'máximo 3');
      assert.ok(r.addBtn.disabled, 'botão adicionar desligado no máximo');
      r.getItems()[0].setValues({ dias: 'A' });
      r.move(2, 0);
      assert.deepEq(r.getValue().map(x => x.dias), ['C', 'A', 'B']);
      assert.deepEq(ev.move.lastArgs.slice(1), [2, 0]);
      const it0 = r.getItems()[0];
      assert.ok(btn(it0, 'up').disabled, 'primeiro não sobe');
      assert.eq(btn(it0, 'remove').getAttribute('aria-label'), 'Remover C');
      btn(r.getItems()[1], 'down').click();
      assert.deepEq(r.getValue().map(x => x.dias), ['C', 'B', 'A'], 'botão descer');
      btn(r.getItems()[0], 'remove').click();
      assert.eq(ev.remove.count, 1); assert.deepEq(ev.remove.lastArgs[1], { dias: 'C', inicio: '' });
      assert.deepEq(r.getValue().map(x => x.dias), ['B', 'A']);
      assert.ok(t.box.querySelector('.r4-rep-live').textContent.includes('removido'), 'anúncio para leitor de tela');
    });

    test('teclado: Alt+↓ / Alt+↑ reordena a partir de qualquer campo do item', t => {
      const { r } = montar(t, '', '');
      r.setValue([{ dias: '1' }, { dias: '2' }, { dias: '3' }]);
      const inp = r.getItems()[0].getField('dias').input;
      inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', altKey: true, bubbles: true }));
      assert.deepEq(r.getValue().map(x => x.dias), ['2', '1', '3']);
      inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', altKey: true, bubbles: true }));
      assert.deepEq(r.getValue().map(x => x.dias), ['1', '2', '3']);
    });

    test('form.setValues / reset / isDirty com arrays; chaves __proto__/constructor ignoradas', t => {
      const { f, r } = montar(t, 'max="5"');
      f.setValues({ horarios: [{ dias: 'Seg', inicio: '07:00' }] }, true);
      assert.eq(r.count(), 1);
      assert.notOk(f.isDirty());
      r.add({ dias: 'Ter' });
      assert.ok(f.isDirty());
      f.reset();
      assert.deepEq(r.getValue(), [{ dias: 'Seg', inicio: '07:00' }], 'reset volta aos itens originais');
      const mal = JSON.parse('[{"__proto__":{"r4polluted":1},"constructor":{"prototype":{"r4polluted":2}},"dias":"X","extra":"<img src=x onerror=alert(1)>"}]');
      r.setValue(mal);
      assert.eq({}.r4polluted, undefined, 'nada poluiu Object.prototype');
      const v = r.getValue();
      assert.deepEq(Object.keys(v[0]).sort(), ['dias', 'inicio'], 'só os campos do template');
      assert.eq(Object.getPrototypeOf(v[0]), Object.prototype);
      assert.eq(r.el.querySelector('img'), null);
    });

    test('array gigante no setValue é cortado no max (ou 100) com aviso — sem travar', t => {
      const { r } = montar(t, 'max="4"');
      const t0 = performance.now();
      r.setValue(Array.from({ length: 100000 }, (_, i) => ({ dias: 'd' + i })));
      assert.eq(r.count(), 4);
      assert.ok(t.logs.take('warn').some(m => m.includes('100000 itens') && m.includes('4 primeiros')));
      const r2 = R4.repeater(t.box, { name: 'big', fields: [{ type: 'text', name: 'a' }] });
      r2.setValue(Array.from({ length: 5000 }, () => ({ a: 1 })));
      assert.eq(r2.count(), 100, 'limite absoluto de 100');
      assert.lt(performance.now() - t0, 4000, 'rápido');
      t.logs.take('warn');
      r2.setValue('isto não é json');
      assert.eq(r2.count(), 0);
    });

    test('validação por item: campo obrigatório vazio reprova o form; required = pelo menos 1 item; min', t => {
      const { f, r } = montar(t, 'required');
      assert.notOk(f.validate(), 'sem itens + required');
      assert.eq(r.getError(), 'Campo obrigatório.');
      r.add();
      assert.notOk(f.validate(), 'item com "dias" vazio');
      const dias = r.getItems()[0].getField('dias');
      assert.ok(dias.getError(), 'erro aparece no campo do item');
      assert.eq(r.getError(), 'Corrija os itens destacados.');
      digitar(dias.input, 'Seg');
      assert.ok(f.validate());
      assert.eq(r.getError(), '');
    });

    test('r4-bind e r4-show-if dentro do item enxergam o PRÓPRIO item; o form vê a quantidade (#campo)', async t => {
      const tpl = '<r4-item-template><r4-textfield name="titulo" label="T"></r4-textfield><b class="eco" r4-bind="texto:titulo|vazio"></b><i class="so" r4-show-if="titulo=x">x!</i></r4-item-template>';
      t.html('<r4-form id="rpt-b"><r4-repeater name="links" label="L">' + tpl + '</r4-repeater><p id="rpt-n" r4-bind="texto:#links"></p></r4-form>');
      const r = R4.get('rpt-b').getField('links');
      r.add({ titulo: 'um' }); r.add({ titulo: 'x' });
      await quadro(t);
      assert.deepEq([...t.box.querySelectorAll('.eco')].map(n => n.textContent), ['um', 'x']);
      assert.deepEq([...t.box.querySelectorAll('.so')].map(n => n.hidden), [true, false]);
      assert.eq(document.getElementById('rpt-n').textContent, '2');
      digitar(r.getItems()[0].getField('titulo').input, 'x');
      await quadro(t);
      assert.deepEq([...t.box.querySelectorAll('.so')].map(n => n.hidden), [false, false]);
      assert.eq(t.logs.take('warn').filter(m => m.includes('não existe')).length, 0, 'sem aviso de campo inexistente');
    });

    test('change do campo interno vira change do repeater (e do form) uma vez; destroy limpa itens, estados e componentes', async t => {
      const { f, r } = montar(t, 'min="1"');
      const fc = t.spy(), rc = t.spy();
      f.on('change', fc); r.on('change', rc);
      const ids = r.getItems()[0].getFields().map(x => x.id);
      digitar(r.getItems()[0].getField('dias').input, 'Q');
      assert.eq(rc.count, 1); assert.eq(fc.count, 1);
      assert.eq(fc.lastArgs[1], r, 'o form recebe o repeater como campo');
      const antes = R4.reactive.stats().bindings;
      r.destroy();
      ids.forEach(id => assert.eq(R4.instances[id], undefined, 'campo interno destruído'));
      assert.ok(R4.reactive.stats().bindings <= antes);
    });

    test('ids no template são removidos (com aviso); disabled desliga os campos internos e os botões', t => {
      t.html('<r4-repeater name="z" label="Z" min="1"><r4-item-template><r4-textfield id="dup" name="a" label="A"></r4-textfield></r4-item-template></r4-repeater>');
      assert.ok(t.logs.take('warn').some(m => m.includes('id dentro de <r4-item-template>')));
      const r = R4.instances[t.box.querySelector('.r4-repeater').id];
      r.add();
      assert.eq(document.querySelectorAll('#dup').length, 0);
      r.setDisabled(true);
      assert.ok(r.getItems().every(it => it.getFields().every(f => f.disabled)));
      assert.ok(r.addBtn.disabled);
    });

    test('R4.repeater(alvo, fields, opções) e i18n (en)', t => {
      const r = R4.repeater(t.box, [{ type: 'text', name: 'nome', label: 'Nome' }], { name: 'pessoas', label: 'Pessoas', min: 1 });
      assert.eq(r.count(), 1);
      assert.ok(r.getItems()[0].getField('nome'));
      if (!R4.i18n) return;
      const prev = R4.i18n.locale;
      t.cleanup(() => R4.i18n.set(prev));
      R4.i18n.set('en');
      assert.eq(r.addBtn.textContent.trim(), 'Add');
      assert.eq(r.getItems()[0].titleEl.textContent, 'Item 1');
    });
  });
})();
