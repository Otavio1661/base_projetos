/* suíte i18n: pt-BR ↔ en, plural, params como texto, <r4-t>, r4-i18n, formatos, onChange e componentes que se retraduzem */
(() => {
  const { suite, test, assert } = R4Test;
  const XSS = '<img src=x onerror=window.__r4tpwn=1>';

  suite('i18n', () => {
    // o idioma é global da página: cada teste volta ao que estava (sem gravar no localStorage)
    let loc0;
    beforeEach(() => { loc0 = R4.i18n.locale; });
    afterEach(() => { if (R4.i18n.locale !== loc0) R4.i18n.set(loc0, { persist: false }); document.documentElement.lang = loc0; });

    test('idioma padrão pt-BR, lista de idiomas, has() e mensagens da lib em português', t => {
      assert.eq(R4.i18n.locale, 'pt-BR');
      assert.deepEq(R4.i18n.locales.slice(0, 2), ['pt-BR', 'en']);
      assert.eq(R4.i18n.has('r4.empty'), true);
      assert.eq(R4.i18n.has('nao.existe.xyz'), false);
      assert.eq(R4.t('r4.empty'), 'Nenhum registro.');
      assert.eq(R4.t('r4.pager.info', { page: 2, pages: 5, n: 47 }), '2 / 5  ·  47 registros');
      assert.eq(R4.util.T('r4.empty', 0, 'reserva'), 'Nenhum registro.');
      assert.eq(R4.util.T('chave.nova.r4t', 0, 'reserva'), 'chave.nova.r4t', 'com o módulo carregado, chave ausente devolve a chave (a reserva só vale sem i18n)');
      t.logs.clear();
    });

    test('chave ausente devolve a própria chave com aviso; parâmetros ausentes não quebram', t => {
      assert.eq(R4.t('chave.que.nao.existe'), 'chave.que.nao.existe');
      assert.contains(t.logs.take('warn').join('|'), 'chave não encontrada');
      R4.i18n.add('pt-BR', { r4t: { saudacao: 'Olá {nome}!' } });
      assert.eq(R4.t('r4t.saudacao'), 'Olá {nome}!', 'parâmetro faltando fica como está (visível para quem programa)');
      assert.eq(R4.t('r4t.saudacao', { nome: 'Ana' }), 'Olá Ana!');
    });

    test('add(): mescla objetos aninhados (a.b.c), não polui Object.prototype e ignora __proto__', t => {
      R4.i18n.add('pt-BR', JSON.parse('{"r4t":{"n1":{"n2":"fundo"}},"__proto__":{"pwnI18n":"1"}}'));
      assert.eq(R4.t('r4t.n1.n2'), 'fundo', 'chave aninhada vira ponto');
      assert.eq({}.pwnI18n, undefined);
      assert.eq(R4.i18n.has('pwnI18n'), false);
      R4.i18n.add('pt-BR', { r4t: { n1: { n3: 'irmão' } } });
      assert.eq(R4.t('r4t.n1.n2'), 'fundo', 'mesclar não apaga o que já existia');
      assert.eq(R4.t('r4t.n1.n3'), 'irmão');
    });

    test('plural pelo parâmetro n (ou count): regra do idioma (pt: 0 e 1 no singular; en: só 1)', t => {
      R4.i18n.add('pt-BR', { r4t: { itens: { um: '{n} item', outros: '{n} itens' }, coisas: { one: '{n} coisa', other: '{n} coisas' } } });
      R4.i18n.add('en', { r4t: { itens: { one: '{n} item', other: '{n} items' } } });
      assert.eq(R4.t('r4t.itens', { n: 1 }), '1 item');
      assert.eq(R4.t('r4t.itens', { n: 2 }), '2 itens');
      assert.eq(R4.t('r4t.itens', { n: 0 }), '0 item', 'em português o zero usa o singular');
      assert.eq(R4.t('r4t.coisas', { n: 1 }), '1 coisa');
      assert.eq(R4.t('r4t.coisas', { n: 5 }), '5 coisas');
      assert.eq(R4.t('r4t.itens', { count: 1, n: 1 }), '1 item');
      R4.i18n.set('en', { persist: false });
      assert.eq(R4.t('r4t.itens', { n: 0 }), '0 items', 'em inglês o zero é plural');
      assert.eq(R4.t('r4t.itens', { n: 1 }), '1 item');
      assert.eq(R4.t('r4t.itens', { n: 2 }), '2 items');
    });

    test('trocar o idioma: <html lang>, onChange (e cancelar), formatos de número/moeda/data e volta ao pt-BR', t => {
      const ouvinte = t.spy();
      const cancela = R4.i18n.onChange(ouvinte);
      assert.eq(R4.i18n.number(1234.5), '1.234,5');
      assert.eq(R4.i18n.money(10).replace(/ /g, ' '), 'R$ 10,00');
      assert.eq(R4.i18n.date('2026-03-05'), '05/03/2026');
      R4.i18n.set('en', { persist: false });
      assert.eq(R4.i18n.locale, 'en');
      assert.eq(document.documentElement.getAttribute('lang'), 'en');
      assert.eq(ouvinte.count, 1);
      assert.deepEq(ouvinte.lastArgs, ['en', 'pt-BR'], 'onChange(novo, anterior)');
      assert.eq(R4.t('r4.empty'), 'No records.');
      assert.eq(R4.i18n.number(1234.5), '1,234.5');
      assert.eq(R4.i18n.money(10), '$10.00', 'moeda do idioma (USD em inglês)');
      assert.eq(R4.i18n.money(10, 'EUR').replace(/ /g, ' '), '€10.00', 'moeda informada');
      assert.eq(R4.i18n.date('2026-03-05'), '3/5/2026', "data 'AAAA-MM-DD' sem deslocar o dia");
      R4.i18n.set('pt-BR', { persist: false });
      assert.eq(document.documentElement.getAttribute('lang'), 'pt-BR');
      assert.eq(R4.t('r4.empty'), 'Nenhum registro.');
      cancela();
      R4.i18n.set('en', { persist: false });
      assert.eq(ouvinte.count, 2, 'depois de cancelar não ouve mais');
    });

    test('idioma inválido/malicioso é recusado ou usa reserva (sem quebrar atributo lang)', t => {
      const antes = R4.i18n.locale;
      R4.i18n.set('en"><img src=x onerror=1>', { persist: false });
      assert.eq(R4.i18n.locale, antes, 'não troca para valor inválido');
      assert.eq(document.documentElement.getAttribute('lang').includes('<'), false);
      R4.i18n.set('', { persist: false });
      R4.i18n.set(null, { persist: false });
      R4.i18n.set('xx-YY', { persist: false });
      assert.eq(document.documentElement.getAttribute('lang').includes('<'), false);
      assert.ok(t.logs.take('warn').length >= 1, 'avisos no console');
    });

    test('<r4-t>: params viram TEXTO (nunca HTML), o conteúdo é a reserva e a tag se retraduz', async t => {
      R4.i18n.add('pt-BR', { r4t: { ola: 'Olá {nome}' } });
      R4.i18n.add('en', { r4t: { ola: 'Hello {nome}' } });
      t.box.innerHTML = '<p id="r4t-p1"><r4-t key="r4t.ola" params=\'{"nome":"Ana"}\'>reserva</r4-t></p><p id="r4t-p2"><r4-t key="chave.sem.traducao.r4t">texto reserva</r4-t></p><p id="r4t-p3"><r4-t key="r4t.ola" params=\'' + JSON.stringify({ nome: XSS }).replace(/'/g, '&#39;') + '\'></r4-t></p>';
      R4.i18n.bind(t.box);
      assert.eq(t.box.querySelector('#r4t-p1').textContent, 'Olá Ana');
      assert.eq(t.box.querySelector('#r4t-p2').textContent, 'texto reserva', 'chave inexistente mostra o conteúdo da tag');
      assert.eq(t.box.querySelector('#r4t-p3').textContent, 'Olá ' + XSS, 'HTML nos params é texto');
      assert.eq(t.box.querySelector('img'), null);
      assert.eq(window.__r4tpwn, undefined);
      R4.i18n.set('en', { persist: false });
      await t.waitFor(() => t.box.querySelector('#r4t-p1').textContent === 'Hello Ana', 1500, 'retradução da tag');
      assert.eq(t.box.querySelector('#r4t-p2').textContent, 'texto reserva');
    });

    test('r4-i18n: texto e atributos permitidos (placeholder/title/aria-label); onclick e href nunca são escritos', async t => {
      t.box.innerHTML = '<span id="r4t-a" r4-i18n="r4.empty"></span><input id="r4t-b" r4-i18n="placeholder:r4.filter"><a id="r4t-c" r4-i18n="onclick:r4.empty;href:r4.empty;title:r4.empty">x</a>';
      R4.i18n.bind(t.box);
      assert.eq(t.box.querySelector('#r4t-a').textContent, 'Nenhum registro.');
      assert.eq(t.box.querySelector('#r4t-b').placeholder, 'Filtrar...');
      const c = t.box.querySelector('#r4t-c');
      assert.eq(c.hasAttribute('onclick'), false, 'on* recusado');
      assert.eq(c.hasAttribute('href'), false, 'href recusado');
      assert.eq(c.title, 'Nenhum registro.', 'title permitido');
      R4.i18n.set('en', { persist: false });
      await t.waitFor(() => t.box.querySelector('#r4t-a').textContent === 'No records.', 1500, 'retradução');
      assert.eq(t.box.querySelector('#r4t-b').placeholder, 'Filter...');
    });

    test('componentes se retraduzem ao trocar o idioma: grid (vazio, filtro, rodapé) e paginador', async t => {
      const g = t.create({ xtype: 'grid', data: [{ a: 1 }, { a: 2 }, { a: 3 }], pageSize: 2, exportable: true, columns: [{ header: 'A', dataIndex: 'a', summary: 'sum' }] });
      assert.eq(g.filterEl.placeholder, 'Filtrar...');
      assert.contains(g.pager, 'registros');
      assert.contains(g.el, 'Exportar');
      assert.eq(g.tfoot.rows[0].cells[0].textContent, '6');
      R4.i18n.set('en', { persist: false });
      await t.waitFor(() => g.filterEl.placeholder === 'Filter...', 1500, 'placeholder em inglês');
      assert.contains(g.pager, 'records');
      assert.contains(g.el, 'Export');
      g.setFilter('zzz');
      assert.eq(g.tbody.querySelector('.r4-msgrow').textContent, 'No records.');
      R4.i18n.set('pt-BR', { persist: false });
      await t.waitFor(() => g.filterEl.placeholder === 'Filtrar...', 1500, 'volta ao português');
      assert.eq(g.tbody.querySelector('.r4-msgrow').textContent, 'Nenhum registro.');
    });

    test('mensagens de validação do form seguem o idioma, e R4.validation.messages editado tem prioridade', t => {
      const f = t.create({ xtype: 'textfield', name: 'n', required: true });
      f.validate();
      assert.eq(f.getError(), 'Campo obrigatório.');
      R4.i18n.set('en', { persist: false });
      f.validate();
      assert.eq(f.getError(), 'Required field.');
      const antes = R4.validation.messages.required;
      R4.validation.messages.required = 'Preencha!';
      t.cleanup(() => { R4.validation.messages.required = antes; });
      f.validate();
      assert.eq(f.getError(), 'Preencha!', 'texto editado vence a tradução');
    });

    test('R4.util.tx liga o texto ao idioma (atributo r4-i18n) e params ficam no atributo "params"', t => {
      const e = R4.util.tx(document.createElement('span'), 'r4.error', 'Erro: {message}', null, { message: XSS });
      t.box.append(e);
      assert.eq(e.textContent, 'Erro: ' + XSS, 'texto, não HTML');
      assert.eq(e.querySelector('img'), null);
      assert.eq(e.getAttribute('r4-i18n'), 'r4.error');
      assert.eq(JSON.parse(e.getAttribute('params')).message, XSS);
      const i = R4.util.tx(document.createElement('input'), 'r4.filter', 'x', 'placeholder');
      assert.eq(i.placeholder, 'Filtrar...');
      assert.eq(i.getAttribute('r4-i18n'), 'placeholder:r4.filter');
    });

    test('persistência do idioma: set() grava no localStorage (e funciona sem ele)', t => {
      const k = 'r4:locale', antes = (() => { try { return localStorage.getItem(k); } catch (e) { return null; } })();
      const ler = () => { const r = localStorage.getItem(k); return r === null ? null : JSON.parse(r).d; };   // R4.store: { v:1, d:valor, e, a, b }
      t.cleanup(() => { try { antes == null ? localStorage.removeItem(k) : localStorage.setItem(k, antes); } catch (e) { /* */ } });
      R4.i18n.set('en');
      let gravado = null; try { gravado = ler(); } catch (e) { /* bloqueado */ }
      assert.eq(gravado, 'en', 'idioma salvo');
      R4.i18n.set('pt-BR');
      try { assert.eq(ler(), 'pt-BR'); } catch (e) { if (e.name === 'AssertionError') throw e; }
      const real = Storage.prototype.setItem;
      Storage.prototype.setItem = () => { throw new Error('bloqueado'); };
      t.cleanup(() => { Storage.prototype.setItem = real; });
      R4.i18n.set('en');
      assert.eq(R4.i18n.locale, 'en', 'sem armazenamento o idioma muda mesmo assim');
      Storage.prototype.setItem = real;
    });
  });
})();
