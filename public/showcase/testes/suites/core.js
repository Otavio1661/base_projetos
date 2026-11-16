/* suíte core: R4.define/create, config herdada, destroy, utilitários (merge/assign/esc/el/debounce), formatos pt-BR */
(() => {
  const { suite, test, assert } = R4Test;
  const nb = s => String(s).replace(/[  ]/g, ' ');   // o Intl usa espaço não separável: normaliza para comparar

  suite('core', () => {
    test('R4.define registra o xtype e R4.create instancia (config padrão + config do usuário)', t => {
      R4.define('r4tBase', { config: { a: 1, b: 'x', lista: [1] }, build() { return R4.util.el('div', { class: 'r4t-base', text: this.b }); } }, { hidden: true });
      t.cleanup(() => { delete R4.registry.r4tBase; });
      assert.ok(R4.registry.r4tBase, 'registrado');
      assert.eq(R4.registry.r4tBase.meta.title, 'r4tBase', 'título padrão = xtype');
      const c = t.create({ xtype: 'r4tBase', b: 'olá' });
      assert.eq(c.xtype, 'r4tBase');
      assert.eq(c.a, 1, 'padrão preservado');
      assert.eq(c.b, 'olá', 'cfg do usuário vence o padrão');
      assert.ok(c.el.classList.contains('r4-cmp'), 'classe r4-cmp');
      assert.eq(c.el.id, c.id, 'id do elemento = id do componente');
      assert.eq(t.box.querySelector('.r4t-base').textContent, 'olá');
      assert.eq(R4.get(c.id), c, 'R4.get devolve a instância');
    });

    test('config é herdada pai → filho e cada instância tem sua cópia dos padrões', t => {
      R4.define('r4tPai', { config: { a: 1, b: 'x', lista: [1] }, build() { return R4.util.el('div'); } }, { hidden: true });
      R4.define('r4tFilho', { extend: 'r4tPai', config: { b: 'y', c: true } }, { hidden: true });
      t.cleanup(() => { delete R4.registry.r4tPai; delete R4.registry.r4tFilho; });
      const f = R4.create({ xtype: 'r4tFilho', c: false });
      assert.eq(f.a, 1, 'herda do pai');
      assert.eq(f.b, 'y', 'filho sobrescreve o padrão do pai');
      assert.eq(f.c, false, 'cfg do usuário vence');
      assert.ok(f instanceof R4.registry.r4tPai.cls, 'instanceof do pai');
      f.lista.push(2);
      const g = R4.create({ xtype: 'r4tFilho' });
      assert.deepEq(g.lista, [1], 'array padrão não é compartilhado entre instâncias');
      assert.deepEq(R4.configDefaults('r4tFilho'), { a: 1, b: 'y', lista: [1], c: true });
    });

    test('R4.create com xtype desconhecido lança erro claro; padrão é panel; define com pai inexistente lança', t => {
      assert.throws(() => R4.create({ xtype: 'naoExiste' }), /xtype desconhecido "naoExiste"/);
      const p = R4.create({ title: 'sem xtype', renderTo: t.box });
      assert.eq(p.xtype, 'panel', 'sem xtype usa o padrão');
      assert.throws(() => R4.define('r4tOrfao', { extend: 'zzz' }), /pai desconhecido/);
      assert.throws(() => R4.create({ xtype: 'panel', renderTo: '#nao-existe-aqui' }), /renderTo não encontrado/);
    });

    test('destroy() remove o elemento e o registro, dispara eventos e é idempotente', t => {
      const c = t.create({ xtype: 'panel', title: 'x' });
      const aoDestruir = t.spy();
      c.on('destroy', aoDestruir);
      assert.ok(t.box.contains(c.el));
      c.destroy();
      assert.notOk(t.box.contains(c.el), 'elemento removido do DOM');
      assert.eq(R4.get(c.id), undefined, 'saiu de R4.instances');
      assert.eq(aoDestruir.count, 1, 'evento destroy uma vez');
      c.destroy();
      assert.eq(aoDestruir.count, 1, 'segunda chamada não faz nada');
      assert.eq(c._destroyed, true);
    });

    test('beforedestroy retornando false cancela a destruição; filhos são destruídos junto', t => {
      const c = t.create({ xtype: 'panel', title: 'pai', items: [{ xtype: 'panel', title: 'filho' }] });
      const filho = c._children[0];
      let travar = true;
      c.on('beforedestroy', () => !travar ? true : false);
      c.destroy();
      assert.ok(R4.get(c.id), 'continua registrado');
      assert.ok(t.box.contains(c.el), 'continua no DOM');
      travar = false;
      c.destroy();
      assert.eq(R4.get(c.id), undefined);
      assert.eq(filho._destroyed, true, 'filho destruído com o pai');
    });

    test('Observable: on/un/fire, retorno false, escopo e listeners na config', t => {
      const o = new R4.Observable(), a = t.spy(), b = t.spy(() => false), ctx = {};
      o.on('x', a).on('x', b, ctx);
      assert.eq(o.fire('x', 1, 2), false, 'um ouvinte devolveu false');
      assert.deepEq(a.lastArgs, [1, 2]);
      assert.eq(b.count, 1);
      o.un('x', b);
      assert.eq(o.fire('x', 3), true, 'sem ouvinte cancelador');
      assert.eq(a.count, 2);
      assert.eq(b.count, 1, 'removido não é chamado');
      assert.eq(o.fire('sem-ouvintes'), true);
      const viaCfg = t.spy();
      const c = t.create({ xtype: 'panel', listeners: { render: viaCfg } });
      assert.eq(viaCfg.count, 1, 'listeners da config valem já no render do create');
      c.fire('render', c);
      assert.eq(viaCfg.count, 2, 'e continuam registrados');
    });

    test('renderItems aceita cfg, componente pronto, "->" e "-"', t => {
      const prontoCmp = R4.create({ xtype: 'button', text: 'pronto' });
      const tb = t.create({ xtype: 'toolbar', items: [{ text: 'A' }, '-', prontoCmp, '->', { xtype: 'textfield', placeholder: 'busca' }] });
      assert.eq(tb.el.querySelectorAll('button.r4-btn').length, 2, 'dois botões (cfg sem xtype vira button)');
      assert.eq(tb.el.querySelectorAll('.r4-sep').length, 1, 'separador');
      assert.eq(tb.el.querySelectorAll('.r4-fill').length, 1, 'espaçador');
      assert.ok(tb.el.querySelector('input.r4-input'), 'textfield');
      assert.eq(tb.el.querySelectorAll('button')[1].textContent, 'pronto');
      assert.eq(tb._children.length, 3);
    });

    test('R4.util.merge e assign ignoram __proto__/constructor/prototype (sem poluir protótipos)', t => {
      const evil = JSON.parse('{"__proto__":{"pwn1":1},"constructor":{"prototype":{"pwn2":1}},"prototype":{"pwn3":1},"ok":{"a":1}}');
      const alvo = {};
      R4.util.merge(alvo, evil);
      assert.eq({}.pwn1, undefined, 'Object.prototype.pwn1');
      assert.eq({}.pwn2, undefined, 'Object.prototype.pwn2 via constructor.prototype');
      assert.eq(Object.getPrototypeOf(alvo), Object.prototype, 'protótipo intacto');
      assert.deepEq(alvo, { ok: { a: 1 } }, 'só a chave legítima foi copiada');
      const alvo2 = R4.util.assign({}, evil, null, 'texto', { z: 2 });
      assert.eq({}.pwn1, undefined);
      assert.deepEq(Object.keys(alvo2).sort(), ['ok', 'z']);
      assert.eq(alvo2.z, 2);
      // merge recursivo: mescla objetos e substitui valores simples
      const m = R4.util.merge({ a: { b: 1, c: 2 }, d: 1 }, { a: { c: 3, e: 4 }, d: [1] });
      assert.deepEq(m, { a: { b: 1, c: 3, e: 4 }, d: [1] });
      assert.eq(R4.util.merge({ x: 1 }, null).x, 1, 'origem inválida é ignorada');
    });

    test('config do componente com __proto__/constructor (JSON de API) não troca o protótipo', t => {
      const c = t.create(JSON.parse('{"xtype":"panel","title":"ok","__proto__":{"build":null},"constructor":"x","prototype":{"a":1}}'));
      assert.ok(c instanceof R4.registry.panel.cls, 'continua sendo um panel');
      assert.notEq(c.constructor, 'x');
      assert.notOk(Object.prototype.hasOwnProperty.call(c, 'prototype'), 'sem "prototype" próprio');
      assert.ok(t.box.querySelector('.r4-panel'), 'montou normalmente');
    });

    test('R4.util.esc e escArg', t => {
      assert.eq(R4.util.esc('<a href="x" onclick=\'y\'>&</a>'), '&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;&lt;/a&gt;');
      assert.eq(R4.util.esc(null), '', 'null vira vazio');
      assert.eq(R4.util.esc(5), '5');
      assert.eq(R4.util.escArg('a;b\nc<d'), 'a b c&lt;d', 'tira ; e quebras que encadeariam ações');
      const raw = R4.raw('<b>x</b>');
      assert.ok(R4.util.isRaw(raw));
      assert.notOk(R4.util.isRaw('<b>x</b>'), 'string comum não é HTML confiável');
      assert.notOk(R4.util.isRaw({ html: '<b>x</b>' }), 'objeto forjado não vale');
      const h = R4.html`<i>${'<u>'}</i>${raw}${['<', R4.raw('<s>')]}`;
      assert.eq(String(h), '<i>&lt;u&gt;</i><b>x</b>&lt;<s>');
    });

    test('R4.util.el cria elementos com texto seguro, classe, estilo, filhos e ouvintes', t => {
      const fn = t.spy();
      const e = R4.util.el('button', { class: 'a b', text: '<i>x</i>', style: { color: 'red' }, title: 't', onclick: fn, hidden: false, 'data-x': 1 }, ['filho', R4.util.el('b', { text: 'n' }), null, 7]);
      assert.eq(e.localName, 'button');
      assert.eq(e.className, 'a b');
      assert.eq(e.getAttribute('data-x'), '1');
      assert.eq(e.getAttribute('title'), 't');
      assert.eq(e.hasAttribute('hidden'), false, 'false não cria o atributo');
      assert.eq(e.style.color, 'red');
      assert.eq(e.textContent, '<i>x</i>filhon7', 'text literal + filhos anexados (null ignorado, número vira texto)');
      assert.eq(e.querySelector('i'), null, 'text não vira HTML');
      e.click();
      assert.eq(fn.count, 1, 'onclick função vira listener');
    });

    test('R4.util.el recusa handler inline (string), href javascript: e srcdoc', t => {
      const a = R4.util.el('a', { href: 'javascript:window.x=1', onclick: 'window.x=1', onmouseover: 'x()', srcdoc: '<b>', text: 'x' });
      assert.eq(a.getAttribute('href'), null, 'javascript: recusado');
      assert.eq(a.getAttribute('onclick'), null, 'handler inline recusado');
      assert.eq(a.getAttribute('onmouseover'), null);
      assert.eq(a.hasAttribute('srcdoc'), false);
      assert.ok(t.logs.take('warn').length >= 3, 'cada recusa gera aviso no console');
      const ok = R4.util.el('a', { href: '/pagina?x=1#y' });
      assert.eq(ok.getAttribute('href'), '/pagina?x=1#y', 'URL relativa passa');
      const img = R4.util.el('img', { src: ' java\nscript:alert(1)' });
      assert.eq(img.getAttribute('src'), null, 'esquema disfarçado com quebra de linha também');
      t.logs.clear();
    });

    test('R4.util.setContent: Node anexa, R4.html é HTML, o resto é texto', t => {
      const e = document.createElement('div');
      R4.util.setContent(e, '<b>x</b>');
      assert.eq(e.textContent, '<b>x</b>', 'string comum vira texto');
      assert.eq(e.children.length, 0);
      R4.util.setContent(e, R4.html`<b>${'<i>'}</b>`);
      assert.eq(e.querySelector('b').textContent, '<i>', 'R4.html escapa a interpolação');
      R4.util.setContent(e, document.createElement('hr'));
      assert.eq(e.children.length, 1);
      assert.eq(e.firstChild.localName, 'hr');
      R4.util.setContent(e, null);
      assert.eq(e.textContent, '');
    });

    test('R4.util.debounce agrupa chamadas e usa os últimos argumentos', async t => {
      const f = t.spy(), d = R4.util.debounce(f, 30);
      d(1); d(2); d(3);
      assert.eq(f.count, 0, 'nada executa de imediato');
      await t.sleep(80);
      assert.eq(f.count, 1, 'uma única execução');
      assert.deepEq(f.lastArgs, [3], 'com os argumentos da última chamada');
      d(4);
      await t.sleep(80);
      assert.eq(f.count, 2, 'nova rodada depois do intervalo');
    });

    test('formatação pt-BR: money, number, bytes', t => {
      assert.eq(nb(R4.util.money(1234.5)), 'R$ 1.234,50');
      assert.eq(nb(R4.util.money(0)), 'R$ 0,00');
      assert.match(nb(R4.util.money(-10)), /-?R\$ ?-?10,00/, 'negativo');
      assert.eq(R4.util.number(1234.567), '1.234,57');
      assert.eq(R4.util.number(5, 0), '5');
      assert.eq(R4.util.number(1234567.891, 1), '1.234.567,9');
      assert.eq(R4.util.bytes(0), '0 B');
      assert.eq(R4.util.bytes(1023), '1023 B');
      assert.eq(R4.util.bytes(1536), '1.5 KB');
      assert.eq(R4.util.bytes(1048576), '1.0 MB');
      assert.eq(R4.util.bytes(5 * 1024 ** 3), '5.0 GB');
    });

    test("R4.util.date: 'AAAA-MM-DD' é data local (não desloca o dia) e ISO com hora funciona", t => {
      assert.eq(R4.util.date('2026-03-05'), '05/03/2026');
      assert.eq(R4.util.date('2026-01-01'), '01/01/2026', 'virada de ano não volta para 31/12');
      assert.eq(R4.util.date('2024-02-29'), '29/02/2024', 'bissexto');
      assert.eq(R4.util.date('2026-12-31'), '31/12/2026');
      assert.eq(R4.util.date('2026-03-05T12:00:00'), '05/03/2026');
      assert.eq(R4.util.date(new Date(2026, 6, 4)), '04/07/2026');
      assert.eq(R4.formats.date('2026-03-05'), '05/03/2026', 'R4.formats usa o mesmo');
      assert.eq(nb(R4.formats.money(10)), 'R$ 10,00');
      assert.eq(R4.formats.bool(true), '✔');
      assert.eq(R4.formats.bool(0), '✖');
      assert.eq(R4.formats.upper('ana'), 'ANA');
    });

    test('R4.util.uid gera ids únicos; R4.util.safeUrl só deixa passar URLs seguras', t => {
      const a = R4.util.uid(), b = R4.util.uid('x');
      assert.notEq(a, b);
      assert.match(b, /^x-\d+$/);
      assert.eq(R4.util.safeUrl('/a?b=1'), '/a?b=1');
      assert.eq(R4.util.safeUrl('https://exemplo.com/x'), 'https://exemplo.com/x');
      assert.eq(R4.util.safeUrl('mailto:a@b.com'), 'mailto:a@b.com');
      assert.eq(R4.util.safeUrl('#ancora'), '#ancora');
      assert.eq(R4.util.safeUrl('javascript:alert(1)'), '');
      assert.eq(R4.util.safeUrl('  JaVa\tScRiPt:alert(1)'), '', 'maiúsculas, espaço e tab não enganam');
      assert.eq(R4.util.safeUrl('data:text/html,<script>x</script>'), '');
      assert.eq(R4.util.safeUrl('vbscript:x'), '');
      assert.eq(R4.util.safeUrl('data:image/png;base64,AAAA', 'img'), 'data:image/png;base64,AAAA', 'data:image só para imagens');
      assert.eq(R4.util.safeUrl('data:image/svg+xml,<svg/>', 'img'), '', 'svg em data: não');
    });

    test('R4.module registra módulos e R4.ready executa a função', t => {
      const api = { x: 1 };
      assert.eq(R4.module('r4tMod', api, { title: 'M' }), api, 'devolve a api');
      t.cleanup(() => { delete R4.modules.r4tMod; });
      assert.eq(R4.modules.r4tMod.meta.title, 'M');
      assert.eq(R4.modules.r4tMod.meta.group, 'Núcleo', 'grupo padrão');
      const f = t.spy();
      R4.ready(f);
      assert.eq(f.count, 1, 'documento já carregado: executa na hora');
      assert.eq(R4.resolve(t.box), t.box);
      assert.eq(R4.resolve('body'), document.body);
    });

    test('componente: show/hide, cls, style e domAttrs (sem on*)', t => {
      const c = t.create({ xtype: 'panel', title: 'a', cls: 'um dois', style: { width: '123px' }, domAttrs: { 'data-ok': '1', onclick: 'x()', 'aria-label': 'rótulo' } });
      assert.ok(c.el.classList.contains('um') && c.el.classList.contains('dois'), 'cls com várias classes');
      assert.eq(c.el.style.width, '123px');
      assert.eq(c.el.getAttribute('data-ok'), '1');
      assert.eq(c.el.getAttribute('aria-label'), 'rótulo');
      assert.eq(c.el.getAttribute('onclick'), null, 'on* recusado em domAttrs');
      c.hide();
      assert.eq(c.el.hidden, true);
      c.show();
      assert.eq(c.el.hidden, false);
      t.logs.clear();
    });
  });
})();
