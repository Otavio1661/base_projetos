/* suíte phonepreview: modo estreito (botão + tela cheia acessível), modo largo, src só mesma origem, allowlist do map,
   envio por postMessage (targetOrigin) e o lado da prévia (R4.preview.listen): origem/fonte, formato, limites, CSS/HTML. */
(() => {
  const { suite, test, assert } = R4Test;
  const SRC = '/showcase/testes/vazio.html';
  const tecla = (el, key, shift) => el.dispatchEvent(new KeyboardEvent('keydown', { key, shiftKey: !!shift, bubbles: true }));
  /** MessageEvent com origem/fonte escolhidas (o jsdom não preenche origin/source no postMessage real). */
  const msg = (W, data, origin, source) => {
    const ev = new W.MessageEvent('message', { data, origin });
    Object.defineProperty(ev, 'source', { value: source });
    W.dispatchEvent(ev);
  };
  const largo = () => typeof matchMedia === 'function' && matchMedia('(min-width: 1px)').matches;

  suite('phonepreview', () => {
    test('tela estreita: só o botão; o iframe só nasce no clique; diálogo com foco preso, Esc fecha e devolve o foco', async t => {
      t.html('<r4-phonepreview id="ppt-a" src="' + SRC + '" map="a" breakpoint="99999"><r4-form><r4-textfield name="a" label="A" value="1"></r4-textfield></r4-form></r4-phonepreview>');
      const p = R4.get('ppt-a');
      assert.eq(p.openBtn.hidden, false); assert.eq(p.aside.hidden, true);
      assert.eq(document.querySelector('iframe.r4-pp-frame'), null, 'nenhum iframe antes do clique');
      assert.eq(p.openBtn.textContent.trim(), 'Visualizar pré-review');
      p.openBtn.focus(); p.openBtn.click();
      const ov = document.querySelector('.r4-pp-overlay');
      assert.ok(ov && p.isOpen());
      assert.eq(ov.getAttribute('role'), 'dialog'); assert.eq(ov.getAttribute('aria-modal'), 'true');
      assert.eq(document.getElementById(ov.getAttribute('aria-labelledby')).textContent, 'Pré-visualização');
      const fr = ov.querySelector('iframe');
      assert.ok(fr, 'iframe criado no clique');
      assert.eq(fr.getAttribute('sandbox'), 'allow-same-origin allow-scripts');
      assert.eq(fr.getAttribute('loading'), 'lazy');
      assert.eq(new URL(fr.src).origin, location.origin);
      assert.ok(document.documentElement.classList.contains('r4-pp-lock'), 'rolagem da página travada');
      const btns = [...ov.querySelectorAll('button')], [g1, g2] = ov.querySelectorAll('.r4-pp-guard');
      assert.eq(document.activeElement, btns[btns.length - 1], 'abre com o foco no Fechar');
      g2.focus();
      assert.eq(document.activeElement, btns[0], 'sair pelo fim (Tab depois do iframe) volta ao primeiro botão');
      g1.focus();
      assert.ok(document.activeElement === fr || document.activeElement === btns[btns.length - 1], 'sair pelo começo (Shift+Tab) vai ao último');
      tecla(ov, 'Escape');
      assert.notOk(p.isOpen());
      assert.eq(document.querySelector('.r4-pp-overlay'), null);
      assert.notOk(document.documentElement.classList.contains('r4-pp-lock'));
      assert.eq(document.activeElement, p.openBtn, 'foco volta ao botão');
    });

    test('tela larga: celular ao lado do form, iframe já carregado (lazy), escala para caber na altura', async t => {
      if (!largo()) t.skip('matchMedia sem suporte real neste ambiente (rode no navegador)');
      t.html('<r4-phonepreview id="ppt-w" src="' + SRC + '" map="a" breakpoint="1"><r4-form><r4-textfield name="a" label="A"></r4-textfield></r4-form></r4-phonepreview>');
      const p = R4.get('ppt-w');
      assert.ok(p.el.classList.contains('r4-pp-wide'));
      assert.eq(p.openBtn.hidden, true); assert.eq(p.aside.hidden, false);
      assert.ok(p.aside.querySelector('iframe.r4-pp-frame'));
      const s = +p.el.style.getPropertyValue('--r4-pp-s');
      assert.ok(s > 0 && s <= 1, 'escala ' + s);
    });

    test('src de outra origem ou esquema perigoso é recusado (sem iframe)', t => {
      for (const src of ['https://evil.example/p.html', 'javascript:alert(1)', 'data:text/html,<b>x</b>', '//evil.example/x']) {
        t.html('<r4-phonepreview id="ppt-o" src="' + src.replace(/"/g, '&quot;') + '" map="a" breakpoint="99999"></r4-phonepreview>');
        R4.get('ppt-o').open();
        const ov = document.querySelector('.r4-pp-overlay');
        assert.eq(ov.querySelector('iframe'), null, 'recusado: ' + src);
        assert.contains(ov, 'mesma origem');
        R4.get('ppt-o').close();
      }
      assert.ok(t.logs.take('warn').some(m => m.includes('src recusado')));
    });

    test('map é uma allowlist: só os campos listados, renomeados; valores empacotados com limites', async t => {
      t.html('<r4-form id="ppt-f"><r4-textfield name="titulo" label="T" value="Olá"></r4-textfield><r4-textfield name="senha" label="S" value="segredo"></r4-textfield></r4-form>' +
        '<r4-phonepreview id="ppt-m" src="' + SRC + '" for="#ppt-f" map="titulo:t, inexistente, __proto__:x, a:constructor, bad key" breakpoint="99999"></r4-phonepreview>');
      await t.sleep(30);
      const p = R4.get('ppt-m'), pk = p.payload();
      assert.eq(pk.v, 1); assert.eq(pk.t, 'estado');
      assert.deepEq(Object.keys(pk.d).sort(), ['inexistente', 't']);
      assert.eq(pk.d.t, 'Olá'); assert.eq(pk.d.inexistente, null);
      assert.ok(!JSON.stringify(pk).includes('segredo'), 'campo fora do map nunca vai');
      assert.ok(t.logs.take('warn').filter(m => m.includes('item de map inválido')).length >= 3);
    });

    test('envio: postMessage com targetOrigin = location.origin a cada mudança do form (uma vez por quadro)', async t => {
      t.html('<r4-phonepreview id="ppt-s" src="' + SRC + '" map="a,lista" breakpoint="99999"><r4-form><r4-textfield name="a" label="A" value="x"></r4-textfield>' +
        '<r4-repeater name="lista" label="L" value=\'[{"n":"1"}]\'><r4-item-template><r4-textfield name="n" label="N"></r4-textfield></r4-item-template></r4-repeater></r4-form></r4-phonepreview>');
      const p = R4.get('ppt-s');
      p.open();
      const fr = document.querySelector('.r4-pp-overlay iframe');
      await t.waitFor(() => fr.contentWindow && fr.contentDocument && fr.contentDocument.readyState === 'complete', 3000, 'iframe');
      const pm = t.spy();
      fr.contentWindow.postMessage = pm;
      p.send();
      assert.eq(pm.count, 1);
      assert.eq(pm.lastArgs[1], location.origin, 'targetOrigin restrito');
      assert.deepEq(pm.lastArgs[0], { v: 1, t: 'estado', d: { a: 'x', lista: [{ n: '1' }] } });
      const inp = p.el.querySelector('input');
      for (let i = 0; i < 10; i++) { inp.value = 'y' + i; inp.dispatchEvent(new Event('input', { bubbles: true })); }
      await t.sleep(60);
      assert.eq(pm.count, 2, 'um envio para 10 digitações');
      assert.eq(pm.lastArgs[0].d.a, 'y9');
      p.close();
    });

    test('R4.preview.listen (na página de prévia): aplica só o autorizado, só da janela-mãe e da mesma origem', async t => {
      const { W, D } = await R4Test.iframeVazio(t.box);
      await R4Test.carregarLib(D, ['preview']);
      D.body.innerHTML = '<h1 id="t">antes</h1><p id="bio">bio</p><div id="alvo"></div>';
      const L = W.R4.preview.listen({
        text: { titulo: '#t' }, show: { mostrar: '#bio' },
        var: { cor: '--cor', raio: { name: '--raio', unit: 'px', target: '#alvo' } },
        class: { estilo: { target: 'body', values: { a: 'topo-a', b: 'topo-b' } } }
      });
      t.cleanup(() => L.stop());
      const ok = d => msg(W, { v: 1, t: 'estado', d }, location.origin, window);
      ok({ titulo: '<img src=x onerror="parent.__r4pv=1">', mostrar: false, cor: '#ABC', raio: 12, estilo: 'b' });
      assert.eq(D.getElementById('t').textContent, '<img src=x onerror="parent.__r4pv=1">', 'texto literal');
      assert.eq(D.querySelector('img'), null);
      assert.ok(D.getElementById('bio').hidden);
      assert.eq(D.documentElement.style.getPropertyValue('--cor'), '#aabbcc');
      assert.eq(D.getElementById('alvo').style.getPropertyValue('--raio'), '12px');
      assert.ok(D.body.classList.contains('topo-b'));
      ok({ estilo: 'a' });
      assert.ok(D.body.classList.contains('topo-a') && !D.body.classList.contains('topo-b'), 'troca de classe dentro da lista');
      ok({ estilo: 'evil class', cor: 'red;background:url(//x)', naoautorizado: 'x' });
      assert.notOk(D.body.classList.contains('evil'), 'classe fora da lista');
      assert.eq(D.body.className.trim(), '', 'valor fora do mapa desliga as classes da lista');
      assert.eq(D.documentElement.style.getPropertyValue('--cor'), '', 'CSS injection recusada');
      // origem e fonte erradas
      msg(W, { v: 1, t: 'estado', d: { titulo: 'outra origem' } }, 'https://evil.example', window);
      msg(W, { v: 1, t: 'estado', d: { titulo: 'origem vazia' } }, '', window);
      const outro = await R4Test.iframeVazio(t.box);
      msg(W, { v: 1, t: 'estado', d: { titulo: 'outra janela' } }, location.origin, outro.W);
      msg(W, { v: 1, t: 'estado', d: { titulo: 'ela mesma' } }, location.origin, W);
      assert.eq(D.getElementById('t').textContent, '<img src=x onerror="parent.__r4pv=1">', 'nenhuma dessas foi aceita');
      // formato e limites
      for (const ruim of [{ v: 2, t: 'estado', d: { titulo: 'v2' } }, { v: 1, t: 'outro', d: { titulo: 'tipo' } }, { v: 1, t: 'estado', d: 'texto' },
        { v: 1, t: 'estado', d: { titulo: 'x'.repeat(70000) } }, { v: 1, t: 'estado', d: Object.fromEntries(Array.from({ length: 150 }, (_, i) => ['k' + i, i]).concat([['titulo', 'chaves']])) },
        '{"v":1}', null, [1, 2]]) msg(W, ruim, location.origin, window);
      assert.eq(D.getElementById('t').textContent, '<img src=x onerror="parent.__r4pv=1">', 'formatos inválidos ignorados');
      msg(W, JSON.parse('{"v":1,"t":"estado","d":{"__proto__":{"r4pp":1},"titulo":"proto ok"}}'), location.origin, window);
      assert.eq(D.getElementById('t').textContent, 'proto ok');
      assert.eq(({}).r4pp, undefined); assert.eq(new W.Object().r4pp, undefined);
      assert.eq(window.__r4pv, undefined);
      assert.deepEq(L.apply({ titulo: ['a', { x: 'b', y: 'c' }] }), ['titulo']);
      assert.eq(D.getElementById('t').textContent, 'a\nb · c', 'lista vira linhas');
    });

    test('ponta a ponta no navegador: o form muda e a página de prévia real recebe', async t => {
      if (/jsdom/i.test(navigator.userAgent)) t.skip('o jsdom não preenche origin/source do postMessage (rode no navegador)');
      t.html('<r4-phonepreview id="ppt-e" src="/showcase/preview-demo.html" map="titulo,cor" breakpoint="99999"><r4-form><r4-textfield name="titulo" label="T" value="Ponta a ponta"></r4-textfield><r4-colorfield name="cor" label="C" value="#123456"></r4-colorfield></r4-form></r4-phonepreview>');
      const p = R4.get('ppt-e');
      p.open();
      const fr = document.querySelector('.r4-pp-overlay iframe');
      await t.waitFor(() => fr.contentDocument && fr.contentDocument.getElementById('titulo') && fr.contentDocument.getElementById('titulo').textContent === 'Ponta a ponta', 4000, 'prévia recebeu');
      assert.eq(fr.contentDocument.documentElement.style.getPropertyValue('--cor'), '#123456');
      p.close();
    });

    test('destroy remove ouvintes de window e o diálogo aberto', async t => {
      let p;
      const vivos = await R4Test.leaks(async () => {
        t.html('<r4-phonepreview id="ppt-d" src="' + SRC + '" map="a" breakpoint="99999"><r4-form><r4-textfield name="a" label="A"></r4-textfield></r4-form></r4-phonepreview>');
        p = R4.get('ppt-d');
        await t.sleep(20);
        p.open();
        p.destroy();
      });
      assert.deepEq(vivos, [], 'ouvintes que sobraram: ' + vivos.join(', '));
      assert.eq(document.querySelector('.r4-pp-overlay'), null);
      assert.eq(R4.get('ppt-d'), undefined);
    });
  });
})();
