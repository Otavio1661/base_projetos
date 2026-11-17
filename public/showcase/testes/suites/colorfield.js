/* suíte colorfield: normalização #rrggbb, seletor nativo, sugestões, contraste WCAG (aviso e bloqueio), form e estado. */
(() => {
  const { suite, test, assert } = R4Test;
  const digitar = (inp, v) => { inp.value = v; inp.dispatchEvent(new Event('input', { bubbles: true })); };
  const cf = t => R4.instances[t.box.querySelector('.r4-colorfield').id];

  suite('colorfield', () => {
    test('getValue sempre #rrggbb minúsculo; #rgb normaliza; texto inválido reprova', t => {
      const c = t.create({ xtype: 'colorfield', name: 'cor', label: 'Cor', value: '#ABC' });
      assert.eq(c.getValue(), '#aabbcc');
      assert.eq(c.picker.value, '#aabbcc');
      assert.eq(c.input.getAttribute('id'), c.labelEl.getAttribute('for'), 'rótulo ligado ao campo de texto');
      digitar(c.input, '#1E88E5');
      assert.eq(c.getValue(), '#1e88e5');
      assert.eq(c.picker.value, '#1e88e5', 'seletor acompanha o texto');
      digitar(c.input, 'azul');
      assert.eq(c.getValue(), '');
      assert.notOk(c.validate());
      assert.contains(c.getError(), '#rrggbb');
      digitar(c.input, '');
      assert.ok(c.validate(), 'vazio vale quando não é obrigatório');
      c.setRequired(true);
      assert.notOk(c.validate());
      ['red', '#12345', 'url(x)', '#ff00ff00', '<b>'].forEach(v => { c.setValue(v); assert.eq(c.getValue(), '', 'recusado: ' + v); });
      c.setValue('#FfF');
      assert.eq(c.getValue(), '#ffffff');
    });

    test('seletor nativo e cores sugeridas: change, aria-pressed e amostra', t => {
      const c = t.create({ xtype: 'colorfield', name: 'cor', label: 'Cor', presets: '#0b3d2e, #1E88E5, lixo, #fff' });
      const ch = t.spy(); c.on('change', ch);
      const ps = [...c.presetsEl.querySelectorAll('button')];
      assert.eq(ps.length, 3, 'inválida ignorada');
      assert.eq(c.presetsEl.getAttribute('role'), 'group');
      assert.ok(ps.every(b => b.getAttribute('aria-label')), 'cada sugestão tem nome acessível');
      ps[1].click();
      assert.eq(c.getValue(), '#1e88e5'); assert.eq(ch.count, 1);
      assert.eq(ps[1].getAttribute('aria-pressed'), 'true'); assert.eq(ps[0].getAttribute('aria-pressed'), 'false');
      assert.eq(c.swatch.style.getPropertyValue('--r4-cf-bg'), '#1e88e5');
      c.picker.value = '#00ff00';
      c.picker.dispatchEvent(new Event('input', { bubbles: true }));
      assert.eq(c.input.value, '#00ff00'); assert.eq(ch.count, 2);
    });

    test('contraste WCAG: R4.color.contrast, contrast-with ao vivo, min-contrast avisa, required-contrast bloqueia', async t => {
      assert.near(R4.color.contrast('#000', '#fff'), 21, 0.01);
      assert.near(R4.color.contrast('#777777', '#ffffff'), 4.48, 0.01);
      assert.ok(isNaN(R4.color.contrast('x', '#fff')));
      t.html('<r4-form id="cft-f"><r4-colorfield name="fundo" label="Fundo" value="#ffffff"></r4-colorfield><r4-colorfield name="texto" label="Texto" value="#777777" contrast-with="fundo" min-contrast="4.5" required-contrast="3"></r4-colorfield></r4-form>');
      await t.sleep(10);
      const f = R4.get('cft-f'), tx = f.getField('texto'), fundo = f.getField('fundo');
      assert.eq(tx.ctrEl.hidden, false);
      assert.ok(tx.ctrEl.classList.contains('r4-cf-low'), 'abaixo de 4.5: aviso');
      assert.contains(tx.ctrEl.textContent, '4,47', 'arredonda para BAIXO (nunca mostra "4,5" para quem reprova)');
      assert.ok(tx.input.getAttribute('aria-describedby').includes(tx.ctrEl.id), 'aviso ligado ao campo');
      assert.ok(f.validate(), '4.48 ≥ 3: passa (só avisa)');
      digitar(fundo.input, '#999999');
      assert.ok(tx.getContrast() < 3, 'acompanha a outra cor ao vivo');
      assert.notOk(f.validate(), 'abaixo do required-contrast bloqueia');
      assert.contains(tx.getError(), 'abaixo do mínimo');
      digitar(fundo.input, '#000000');
      assert.notOk(tx.ctrEl.classList.contains('r4-cf-low'));
      assert.contains(tx.ctrEl.textContent, 'AA');
      assert.ok(f.validate());
      const lit = t.create({ xtype: 'colorfield', name: 'x', value: '#000000', contrastWith: '#ffffff' });
      assert.near(lit.getContrast(), 21, 0.01, 'contrast-with com cor fixa');
    });

    test('no form e no estado: getValues, r4-bind var com a cor, setValues normaliza', async t => {
      t.html('<r4-form id="cft-s"><r4-colorfield name="cor" label="Cor" value="#3b5bdb"></r4-colorfield><div id="cft-d" r4-bind="var:--x:cor"></div></r4-form>');
      const f = R4.get('cft-s'), d = document.getElementById('cft-d');
      assert.deepEq(f.getValues(), { cor: '#3b5bdb' });
      f.setValues({ cor: '#ABC' });
      await t.sleep(50);
      assert.eq(d.style.getPropertyValue('--x'), '#aabbcc');
      digitar(f.getField('cor').input, '#123456');
      await t.sleep(50);
      assert.eq(d.style.getPropertyValue('--x'), '#123456');
      f.reset();
      assert.eq(f.getField('cor').getValue(), '#3b5bdb');
    });

    test('readOnly/disabled e destroy (para de ouvir o form)', async t => {
      t.html('<r4-form id="cft-r"><r4-colorfield name="a" label="A" value="#ffffff"></r4-colorfield><r4-colorfield name="b" label="B" value="#000000" contrast-with="a" presets="#ff0000"></r4-colorfield></r4-form>');
      await t.sleep(10);
      const f = R4.get('cft-r'), b = f.getField('b');
      b.setReadOnly(true);
      b.presetsEl.querySelector('button').click();
      assert.eq(b.getValue(), '#000000', 'somente leitura não troca pela sugestão');
      b.setDisabled(true);
      assert.ok(b.input.disabled && b.picker.disabled);
      b.destroy();
      digitar(f.getField('a').input, '#eeeeee');   // não pode lançar (ouvinte removido)
      assert.eq(f.getField('b'), null);
    });

    test('HTML declarativo e R4.colorfield(alvo, rótulo, opções)', t => {
      t.html('<r4-colorfield name="marca" label="Marca" value="#0B3D2E"></r4-colorfield>');
      assert.eq(cf(t).getValue(), '#0b3d2e');
      const c = R4.colorfield(t.box, 'Outra', { name: 'o', value: '#fff' });
      assert.eq(c.label, 'Outra'); assert.eq(c.getValue(), '#ffffff');
    });
  });
})();
