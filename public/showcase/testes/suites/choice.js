/* suíte choice: opções em cartões (radio nativo), markup confiável do <r4-option> x dado escapado, form, a11y. */
(() => {
  const { suite, test, assert } = R4Test;
  const ch = t => R4.instances[t.box.querySelector('.r4-choicefield').id];

  suite('choice', () => {
    test('HTML: <r4-option> com SVG (markup da página), ícone, descrição, selected e disabled', t => {
      t.html(`<r4-choice name="estilo" label="Estilo" columns="3">
        <r4-option value="solido" label="Sólido"><svg viewBox="0 0 10 10" class="ilu"><rect width="10" height="4"/></svg></r4-option>
        <r4-option value="grade" label="Grade" icon="grid" description="Três por linha" selected></r4-option>
        <r4-option value="off" label="Indisponível" disabled></r4-option></r4-choice>`);
      const c = ch(t);
      assert.eq(c.getValue(), 'grade', 'selected');
      const cards = [...c.el.querySelectorAll('.r4-choice-card')];
      assert.eq(cards.length, 3);
      assert.ok(cards[0].querySelector('svg.ilu'), 'SVG do conteúdo da tag');
      assert.ok(cards[1].querySelector('.r4-choice-visual svg'), 'ícone vira SVG');
      assert.eq(cards[1].querySelector('.r4-choice-desc').textContent, 'Três por linha');
      assert.ok(cards[1].classList.contains('r4-checked'));
      assert.ok(cards[2].querySelector('input').disabled);
      assert.eq(c.group.getAttribute('role'), 'radiogroup');
      assert.eq(c.group.getAttribute('aria-labelledby'), c.labelEl.id);
      assert.eq(c.group.style.getPropertyValue('--r4-choice-cols'), '3');
      const radios = c.el.querySelectorAll('input[type="radio"]');
      assert.eq(new Set([...radios].map(r => r.name)).size, 1, 'mesmo grupo (setas do teclado trocam)');
      assert.ok([...radios].every(r => c.el.querySelector('label[for="' + r.id + '"]')), 'cada radio tem rótulo');
    });

    test('clique troca o valor, dispara change e r4-fieldchange; readOnly impede', t => {
      const c = t.create({ xtype: 'choice', name: 'l', label: 'L', options: ['a', 'b'], value: 'a' });
      const s = t.spy(); c.on('change', s);
      c.el.querySelectorAll('input')[1].click();
      assert.eq(c.getValue(), 'b'); assert.eq(s.count, 1); assert.deepEq(s.lastArgs.slice(1), ['b']);
      c.setReadOnly(true);
      c.el.querySelectorAll('input')[0].click();
      assert.eq(c.getValue(), 'b', 'somente leitura');
    });

    test('dado de fora é TEXTO: label/description/html string escapados; HTML só com R4.html; thumb perigosa recusada', t => {
      const c = t.create({ xtype: 'choice', name: 'x', options: [
        { value: '1', label: '<img src=x onerror="window.__r4c=1">', description: '<b>d</b>' },
        { value: '2', label: 'dois', html: '<script>window.__r4c=2</script><i>i</i>' },
        { value: '3', label: 'tres', html: R4.html`<em>${'<b>'}</em>` },
        { value: '4', label: 'quatro', thumb: 'javascript:alert(1)' },
        { value: '5', label: 'cinco', thumb: '/showcase/x.png' },
        JSON.parse('{"value":"6","label":"seis","__proto__":{"r4c":1}}')
      ] });
      assert.eq(c.el.querySelector('img[onerror],script,i,b'), null, 'nada de markup vindo de dado');
      assert.contains(c.el, '<img src=x', 'label como texto');
      assert.eq(c.el.querySelectorAll('em').length, 1, 'R4.html vira HTML');
      assert.eq(c.el.querySelector('em').textContent, '<b>', 'com o ${} escapado');
      const imgs = [...c.el.querySelectorAll('.r4-choice-visual img')].map(i => i.getAttribute('src'));
      assert.deepEq(imgs, ['/showcase/x.png'], 'thumb javascript: recusada');
      assert.eq({}.r4c, undefined);
      assert.eq(window.__r4c, undefined);
    });

    test('no form: getValues/setValues/reset, required (Selecione uma opção) e estado reativo', async t => {
      t.html('<r4-form id="cht-f"><r4-choice name="plano" label="Plano" required><r4-option value="free" label="Grátis"></r4-option><r4-option value="pro" label="Pro"></r4-option></r4-choice><p id="cht-p" r4-show-if="plano=pro">PRO</p></r4-form>');
      const f = R4.get('cht-f'), c = f.getField('plano');
      assert.notOk(f.validate());
      assert.eq(c.getError(), 'Selecione uma opção.');
      f.setValues({ plano: 'pro' }, true);
      assert.ok(c.el.querySelectorAll('input')[1].checked);
      await t.sleep(50);
      assert.notOk(document.getElementById('cht-p').hidden);
      c.el.querySelectorAll('input')[0].click();
      await t.sleep(50);
      assert.ok(document.getElementById('cht-p').hidden);
      f.reset();
      assert.eq(c.getValue(), 'pro');
      assert.deepEq(f.getValues(), { plano: 'pro' });
    });

    test('R4.choice(alvo, opções, extra), setOptions e foco no item marcado', t => {
      const c = R4.choice(t.box, [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }], { name: 'z', value: 'b' });
      c.focus();
      assert.eq(document.activeElement, c.el.querySelectorAll('input')[1]);
      c.setOptions([{ value: 'c', label: 'C', icon: 'star' }]);
      assert.deepEq(c.getOptions(), [{ value: 'c', label: 'C' }]);
      assert.eq(c.getValue(), 'b', 'valor mantido (sem opção correspondente)');
    });
  });
})();
