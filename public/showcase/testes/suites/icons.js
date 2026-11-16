/* suíte icons: todos os nomes geram SVG sem NaN, nome malicioso inerte, icon="★" vira texto, R4.icon.add valida o path */
(() => {
  const { suite, test, assert } = R4Test;
  const XSS = '<img src=x onerror=window.__r4tpwn=1>';

  suite('icons', () => {
    test('há dezenas de ícones e TODOS geram <svg> com viewBox 24, traço currentColor e path sem NaN/undefined', t => {
      const nomes = R4.icon.names;
      assert.gt(nomes.length, 60, 'quantidade de ícones');
      assert.ok(nomes.includes('edit') && nomes.includes('trash') && nomes.includes('check') && nomes.includes('close'), 'nomes básicos');
      const ruins = [];
      nomes.forEach(n => {
        const s = R4.icon(n), h = s.outerHTML;
        const ok = s.localName === 'svg' && s.getAttribute('viewBox') === '0 0 24 24' && s.getAttribute('stroke') === 'currentColor'
          && s.classList.contains('r4-icon-' + n) && s.querySelectorAll('path').length >= 1 && s.getAttribute('aria-hidden') === 'true'
          && !/NaN|undefined|null|Infinity/.test(h) && [...s.querySelectorAll('path')].every(p => /^[MmLlHhVvCcSsQqTtAaZz0-9\s.,-]+$/.test(p.getAttribute('d') || ''));
        if (!ok) ruins.push(n);
      });
      assert.deepEq(ruins, [], 'ícones com problema');
      assert.eq(new Set(nomes).size, nomes.length, 'sem nomes repetidos');
    });

    test('opções: size, title (acessível), cls; sem title o ícone é decorativo; tamanho inválido é ignorado', t => {
      const a = R4.icon('edit');
      assert.eq(a.getAttribute('aria-hidden'), 'true');
      assert.eq(a.getAttribute('role'), null);
      assert.eq(a.hasAttribute('width'), false, 'sem size acompanha a fonte (1em)');
      const b = R4.icon('edit', { size: 32, title: 'Editar', cls: 'x y' });
      assert.eq(b.getAttribute('width'), '32');
      assert.eq(b.getAttribute('height'), '32');
      assert.eq(b.getAttribute('role'), 'img');
      assert.eq(b.querySelector('title').textContent, 'Editar');
      assert.eq(b.getAttribute('aria-hidden'), null);
      assert.ok(b.classList.contains('x') && b.classList.contains('y') && b.classList.contains('r4-icon-edit'));
      const c = R4.icon('edit', { size: XSS, title: XSS, cls: XSS });
      assert.eq(c.hasAttribute('width'), false, 'size hostil ignorado');
      assert.eq(c.querySelector('title').textContent, XSS, 'title é texto');
      assert.eq(c.querySelector('img'), null);
      assert.eq(c.outerHTML.includes('<img'), false);
    });

    test('nome desconhecido/malicioso vira círculo neutro com aviso "quis dizer"; nada de markup', t => {
      const u = R4.icon('editt');
      assert.eq(u.querySelectorAll('path').length, 1);
      assert.notOk([...u.classList].some(c => c === 'r4-icon-editt'), 'sem classe com o nome inválido');
      assert.contains(t.logs.take('warn').join('|'), 'ícone desconhecido "editt" — quis dizer "edit"?');
      const evil = '"><img src=x onerror=window.__r4tpwn=1>';
      const e = R4.icon(evil);
      t.box.append(e);
      assert.eq(t.box.querySelector('img'), null, 'nome não vira markup');
      assert.eq(e.querySelectorAll('path').length, 1, 'círculo neutro');
      assert.eq(e.outerHTML.includes('onerror'), false);
      assert.eq(window.__r4tpwn, undefined);
      ['__proto__', 'constructor', 'toString', 'hasOwnProperty'].forEach(n => {
        assert.eq(R4.icon.has(n), false, n + ' não é ícone');
        R4.icon(n);
      });
      t.logs.clear();
      assert.eq(R4.icon.has('edit'), true);
      assert.eq(R4.icon.has(''), false);
    });

    test('R4.icon.fill: nome vira SVG; texto/emoji/HTML vira texto (nunca innerHTML)', t => {
      const e = document.createElement('span');
      t.box.append(e);
      assert.eq(R4.icon.fill(e, 'edit'), true);
      assert.ok(e.querySelector('svg.r4-icon-edit'));
      assert.eq(R4.icon.fill(e, '★'), false);
      assert.eq(e.textContent, '★');
      assert.eq(e.querySelector('svg'), null, 'o SVG anterior saiu');
      assert.eq(R4.icon.fill(e, XSS), false);
      assert.eq(e.textContent, XSS);
      assert.eq(e.querySelector('img'), null);
      R4.icon.fill(e, '');
      assert.eq(e.textContent, '');
      R4.icon.fill(e, null);
      assert.eq(e.textContent, '');
    });

    test('opção icon dos componentes: nome vira SVG; "★" e HTML viram texto (button, stat, alert, dropdown)', t => {
      const b1 = t.create({ xtype: 'button', text: 'a', icon: 'edit' }), b2 = t.create({ xtype: 'button', text: 'b', icon: '★' }), b3 = t.create({ xtype: 'button', text: 'c', icon: XSS });
      assert.ok(b1.el.querySelector('.r4-ico svg.r4-icon-edit'), 'nome → svg');
      assert.eq(b2.el.querySelector('.r4-ico').textContent, '★', 'icon="★" vira texto');
      assert.eq(b2.el.querySelector('svg'), null);
      assert.eq(b3.el.querySelector('.r4-ico').textContent, XSS);
      assert.eq(b3.el.querySelector('img'), null);
      b1.setIcon('trash');
      assert.ok(b1.el.querySelector('svg.r4-icon-trash') && !b1.el.querySelector('svg.r4-icon-edit'), 'setIcon troca');
      b1.setIcon('');
      assert.eq(b1.el.querySelector('.r4-ico'), null, 'setIcon("") remove');
      const st = t.create({ xtype: 'stat', title: 'T', value: 1, icon: XSS });
      assert.eq(st.el.querySelector('.r4-stat-icon').textContent, XSS);
      const al = t.create({ xtype: 'alert', text: 'x', icon: 'bell' });
      assert.ok(al.el.querySelector('.r4-al-ico svg.r4-icon-bell'));
      const dd = t.create({ xtype: 'dropdown', text: 'm', icon: XSS, items: [{ text: 'i', icon: XSS }] });
      dd.open();
      assert.eq(document.querySelectorAll('.r4-dd-menu img').length, 0);
      assert.eq(t.box.querySelectorAll('img').length, 0);
      assert.eq(window.__r4tpwn, undefined);
    });

    test('componente/tag <r4-icon> e R4.icon(alvo, nome): setName troca, tamanho e título', t => {
      t.html('<r4-icon id="r4t-ic" name="check" size="24" title="Pronto"></r4-icon>');
      const c = R4.get('r4t-ic');
      assert.eq(c.xtype, 'icon');
      const svg = t.box.querySelector('svg');
      assert.ok(svg.classList.contains('r4-icon-check'));
      assert.eq(svg.getAttribute('width'), '24');
      assert.eq(svg.querySelector('title').textContent, 'Pronto');
      c.setName('trash');
      assert.ok(t.box.querySelector('svg.r4-icon-trash'));
      assert.eq(t.box.querySelectorAll('svg').length, 1, 'troca sem duplicar');
      const d = R4.icon(t.box, 'edit', { size: 20 });
      assert.eq(d.xtype, 'icon', 'R4.icon(alvo, nome) monta o componente');
      assert.ok(t.box.querySelector('svg.r4-icon-edit'));
    });

    test('R4.icon.add: registra path válido (só <path d>) e recusa markup, nome inválido, texto grande e objetos', t => {
      const antes = R4.icon.names.length;
      const nome = 'r4t-teste';   // nome fixo: o mapa de ícones não tem remoção, então só fica uma entrada de teste
      const recusas = [R4.icon.add('x1', 'M0 0"/><script>window.__r4tpwn=1</script>'), R4.icon.add('x2', 'M0 0 ' + 'L1 1 '.repeat(500)), R4.icon.add('"><img>', 'M0 0h1'),
        R4.icon.add('__proto__', 'M0 0h1'), R4.icon.add('x3', 'url(javascript:1)'), R4.icon.add('x4', { toString: () => 'M0 0' }), R4.icon.add('', 'M0 0h1'), R4.icon.add('Maiúscula', 'M0 0h1')];
      assert.deepEq(recusas, new Array(8).fill(false), 'todas recusadas');
      assert.eq(R4.icon.names.length, antes, 'mapa intacto');
      assert.eq(R4.icon.has('constructor'), false, 'constructor não existe como ícone');
      assert.eq(R4.icon.has('__proto__'), false);
      assert.eq(R4.icon.add(nome, 'M2 2h20v20H2z'), true);
      const svg = R4.icon(nome);
      assert.eq(svg.querySelectorAll('*').length, 1, 'só um <path>');
      assert.eq(svg.querySelector('path').getAttribute('d'), 'M2 2h20v20H2z');
      assert.eq(window.__r4tpwn, undefined);
      assert.eq(String(R4.icon.html('edit')).startsWith('<svg'), true, 'R4.icon.html devolve markup para R4.html');
      assert.ok(R4.util.isRaw(R4.icon.html('edit')), 'marcado como HTML confiável');
    });
  });
})();
