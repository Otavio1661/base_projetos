/* suíte reactive: estado do form (R4.state), r4-bind / r4-show-if / r4-enable-if, mini-parser de expressões,
   form carregado por src, ações salvar/recarregar e segurança (XSS, URL, CSS, expressão maliciosa, limites). */
(() => {
  const { suite, test, assert } = R4Test;
  const quadro = t => t.sleep(50);   // uma passada do requestAnimationFrame (com folga)
  const digitar = (inp, v) => { inp.value = v; inp.dispatchEvent(new Event('input', { bubbles: true })); };
  const inputDe = (f, name) => f.getField(name).input;
  const avisos = (t, re) => t.logs.take('warn').filter(m => re.test(m));

  suite('reactive', () => {
    test('r4-bind texto/attr/var/classe acompanham a digitação (uma passada por quadro)', async t => {
      t.html(`<r4-form id="rxt-a"><r4-textfield name="nome" label="Nome" value="Ana"></r4-textfield><r4-textfield name="cor" label="Cor" value="#ABC"></r4-textfield>
        <p id="rxt-p" r4-bind="texto:nome|Sem nome; attr:title:nome; var:--rx-c:cor; classe:vip:nome=Bia"></p><i id="rxt-n" r4-bind="texto:#nome"></i></r4-form>`);
      const f = R4.get('rxt-a'), p = document.getElementById('rxt-p');
      assert.eq(p.textContent, 'Ana', 'aplica já ao montar');
      await quadro(t);
      assert.eq(p.getAttribute('title'), 'Ana');
      assert.eq(p.style.getPropertyValue('--rx-c'), '#aabbcc', '#rgb normalizado');
      assert.notOk(p.classList.contains('vip'));
      digitar(inputDe(f, 'nome'), 'Bia');
      assert.eq(p.textContent, 'Ana', 'ainda não: atualização em lote no próximo quadro');
      await quadro(t);
      assert.eq(p.textContent, 'Bia');
      assert.ok(p.classList.contains('vip'), 'classe ligada pela expressão');
      assert.eq(document.getElementById('rxt-n').textContent, '3', '#campo = quantidade');
      digitar(inputDe(f, 'nome'), '');
      await quadro(t);
      assert.eq(p.textContent, 'Sem nome', 'vazio usa a reserva');
      assert.eq(p.getAttribute('title'), null, 'atributo vazio é removido');
    });

    test('muitas digitações no mesmo quadro → uma única atualização e um único evento change', async t => {
      t.html('<r4-form id="rxt-b"><r4-textfield name="a" label="A"></r4-textfield><b id="rxt-b1" r4-bind="texto:a"></b><b id="rxt-b2" r4-bind="texto:outro|x"></b><r4-textfield name="outro" label="O"></r4-textfield></r4-form>');
      await quadro(t);
      const st = R4.state('#rxt-b'), ev = t.spy();
      st.on('change', ev);
      let escritas = 0;
      const mo = new MutationObserver(m => { escritas += m.length; });
      mo.observe(document.getElementById('rxt-b1'), { childList: true, characterData: true, subtree: true });
      mo.observe(document.getElementById('rxt-b2'), { childList: true, characterData: true, subtree: true });
      const inp = inputDe(R4.get('rxt-b'), 'a');
      for (let i = 0; i < 40; i++) digitar(inp, 'v' + i);
      await quadro(t);
      mo.disconnect();
      assert.eq(document.getElementById('rxt-b1').textContent, 'v39');
      assert.eq(ev.count, 1, '1 evento change para 40 digitações');
      assert.deepEq(ev.lastArgs[1], ['a'], 'só o campo que mudou');
      assert.eq(document.getElementById('rxt-b2').textContent, 'x', 'quem não depende de "a" nem foi tocado');
      assert.ok(escritas <= 2, 'no máximo uma troca de texto (' + escritas + ')');
    });

    test('r4-show-if e r4-enable-if: radiogroup, checkbox, botão r4 e botão nativo', async t => {
      t.html(`<r4-form id="rxt-c"><r4-radiogroup name="tipo" label="Tipo" value="pf"><r4-option value="pf">PF</r4-option><r4-option value="pj">PJ</r4-option></r4-radiogroup>
        <div id="rxt-pj" r4-show-if="tipo=pj">CNPJ</div><r4-checkbox name="aceite">Aceito</r4-checkbox>
        <r4-button id="rxt-env" r4-enable-if="aceite">Enviar</r4-button><button id="rxt-nat" type="button" r4-enable-if="aceite && tipo in pf,pj">x</button></r4-form>`);
      await quadro(t);
      const f = R4.get('rxt-c'), pj = document.getElementById('rxt-pj'), b = R4.get('rxt-env');
      assert.ok(pj.hidden, 'oculto com tipo=pf');
      assert.ok(b.disabled && b.el.disabled, 'botão r4 desabilitado (setDisabled)');
      assert.ok(document.getElementById('rxt-nat').disabled);
      f.getField('tipo').el.querySelectorAll('input')[1].click();
      f.getField('aceite').el.querySelector('input').click();
      await quadro(t);
      assert.notOk(pj.hidden, 'aparece com tipo=pj');
      assert.notOk(b.disabled, 'habilita com o aceite');
      assert.notOk(document.getElementById('rxt-nat').disabled);
    });

    test('expressões: gramática completa (sem eval)', t => {
      const v = { plano: 'pro', qtd: 12, preco: '10,5', itens: [1, 2, 3], nome: '', tags: ['a', 'b'], ativo: true, zero: 0 };
      const E = e => R4.reactive.evaluate(e, v);
      assert.ok(E('plano')); assert.notOk(E('nome')); assert.ok(E('!nome')); assert.notOk(E('zero'));
      assert.ok(E('plano=pro')); assert.ok(E('plano == pro')); assert.ok(E('plano!=free'));
      assert.ok(E('qtd>10')); assert.ok(E('qtd>=12')); assert.notOk(E('qtd<12')); assert.ok(E('qtd<=12'));
      assert.ok(E('preco>10'), 'número com vírgula');
      assert.ok(E('plano in free,pro')); assert.notOk(E('plano in free,basic'));
      assert.ok(E('tags=b'), 'lista: contém'); assert.ok(E('#itens=3')); assert.ok(E('itens>2'), 'lista em > usa a quantidade');
      assert.ok(E('ativo=true')); assert.ok(E('(plano=free || qtd>10) && !nome'));
      assert.ok(E("plano='pro'")); assert.ok(E('nome=""'));
      assert.notOk(E('inexistente')); assert.ok(E('!inexistente'));
      assert.deepEq(R4.reactive.compile('a=1 && (b || !c)').deps.sort(), ['a', 'b', 'c'], 'dependências');
    });

    test('expressão inválida/maliciosa → falso + UM aviso com sugestão; nunca lança nem executa', t => {
      window.__r4rx = 0;
      t.cleanup(() => { delete window.__r4rx; });
      const ruins = ['alert(1)', 'a and b', 'constructor.constructor("window.__r4rx=1")()', '__proto__', 'a = (1', '((((((((((a))))))))))', 'a > texto', 'x'.repeat(301), "a='sem fim", '&& a', 'a ||'];
      ruins.forEach(e => assert.eq(R4.reactive.evaluate(e, { a: 1, b: 1, x: 1 }), false, 'falso: ' + e.slice(0, 30)));
      assert.eq(window.__r4rx, 0, 'nada foi executado');
      const w1 = avisos(t, /expressão inválida/);
      assert.ok(w1.length >= ruins.length - 1, 'avisos (' + w1.length + ')');
      assert.ok(w1.some(m => m.includes('use && no lugar de "and"')), 'sugere &&');
      assert.ok(w1.some(m => m.includes('chamadas de função')), 'explica que não há funções');
      R4.reactive.evaluate('alert(1)', {});
      assert.eq(avisos(t, /expressão inválida/).length, 0, 'aviso único por expressão');
    });

    test('segurança: valores com HTML/URL/CSS maliciosos nunca viram markup, URL perigosa ou CSS livre', async t => {
      t.html(`<r4-form id="rxt-s"><r4-textfield name="v" label="V" sanitize="false" guard="off"></r4-textfield>
        <div id="rxt-s1" r4-bind="texto:v; attr:href:v; attr:src:v; var:--x:v; attr:title:v"></div><a id="rxt-s2" r4-bind="attr:href:v">l</a><img id="rxt-s3" alt="" r4-bind="attr:src:v"></r4-form>`);
      const f = R4.get('rxt-s'), d1 = document.getElementById('rxt-s1'), a = document.getElementById('rxt-s2'), img = document.getElementById('rxt-s3');
      digitar(inputDe(f, 'v'), '<img src=x onerror="window.__r4x=1"><script>window.__r4x=2</script>');
      await quadro(t);
      assert.eq(d1.querySelector('img,script'), null, 'nenhum elemento criado');
      assert.contains(d1.textContent, '<img src=x', 'texto literal');
      assert.eq(window.__r4x, undefined);
      for (const u of ['javascript:alert(1)', 'JaVa\tScRiPt:alert(1)', 'data:text/html,<b>x</b>', 'vbscript:x']) {
        digitar(inputDe(f, 'v'), u);
        await quadro(t);
        assert.eq(a.getAttribute('href'), null, 'href recusado: ' + u);
        assert.eq(img.getAttribute('src'), null, 'src recusado: ' + u);
      }
      digitar(inputDe(f, 'v'), 'https://exemplo.com/a.png');
      await quadro(t);
      assert.eq(a.getAttribute('href'), 'https://exemplo.com/a.png', 'URL boa passa');
      for (const css of ['red;background:url(//evil)', 'expression(alert(1))', 'url(javascript:x)', '1px}body{display:none', 'var(--y)', '#12345g']) {
        digitar(inputDe(f, 'v'), css);
        await quadro(t);
        assert.eq(d1.style.getPropertyValue('--x'), '', 'CSS recusado: ' + css);
      }
      digitar(inputDe(f, 'v'), '12px');
      await quadro(t);
      assert.eq(d1.style.getPropertyValue('--x'), '12px');
      t.logs.take('warn');
    });

    test('r4-bind recusa atributos fora da allowlist e tipos/campos inválidos (com aviso)', async t => {
      t.html('<r4-form id="rxt-al"><r4-textfield name="v" label="V" value="x"></r4-textfield><p id="rxt-al1" r4-bind="attr:onclick:v; attr:style:v; attr:srcdoc:v; txt:v; var:color:v; classe:a b:v; texto:__proto__"></p></r4-form>');
      await quadro(t);
      const p = document.getElementById('rxt-al1');
      assert.eq(p.getAttribute('onclick'), null); assert.eq(p.getAttribute('style'), null); assert.eq(p.getAttribute('srcdoc'), null);
      const w = avisos(t, /r4-bind=/);
      assert.ok(w.some(m => m.includes('"onclick" não permitido')), 'onclick');
      assert.ok(w.some(m => m.includes('tipo desconhecido "txt"') && m.includes('texto')), 'sugestão para txt');
      assert.ok(w.some(m => m.includes('variável CSS inválida')));
      assert.ok(w.some(m => m.includes('classe inválido')));
      assert.ok(w.some(m => m.includes('campo inválido')), '__proto__ como campo');
    });

    test('avisos de digitação: campo inexistente (com sugestão) e atributo parecido (r4-show-iff)', async t => {
      t.html('<r4-form id="rxt-w"><r4-textfield name="email" label="E-mail"></r4-textfield><p r4-bind="texto:emial"></p><p r4-show-iff="email"></p></r4-form>');
      await quadro(t);
      const w = t.logs.take('warn');
      assert.ok(w.some(m => m.includes('campo "emial" não existe') && m.includes('"email"')), 'campo inexistente: ' + w.join(' | '));
      assert.ok(w.some(m => m.includes('atributo desconhecido "r4-show-iff"') && m.includes('r4-show-if')), 'atributo parecido');
    });

    test('r4-scope liga elementos fora do form (inclusive se o form aparecer depois) e R4.scan ativa conteúdo novo', async t => {
      t.html('<p id="rxt-o" r4-scope="#rxt-late" r4-bind="texto:x|esperando"></p>');
      assert.eq(document.getElementById('rxt-o').textContent, '', 'sem form ainda');
      const div = document.createElement('div');
      div.innerHTML = '<r4-form id="rxt-late"><r4-textfield name="x" label="X" value="chegou"></r4-textfield></r4-form>';
      t.box.append(div); R4.scan(div);
      await quadro(t);
      assert.eq(document.getElementById('rxt-o').textContent, 'chegou');
      const extra = document.createElement('span');
      extra.setAttribute('r4-scope', '#rxt-late'); extra.setAttribute('r4-bind', 'texto:x');
      t.box.append(extra); R4.scan(t.box);
      assert.eq(extra.textContent, 'chegou', 'conteúdo inserido depois');
      t.html('<p r4-show-if="x">fora de form</p>');
      assert.ok(t.logs.take('warn').some(m => m.includes('fora de um <r4-form>')));
    });

    test('R4.state: get/set/values/on; destruir o form desliga tudo (sem bindings órfãos)', async t => {
      const antes = R4.reactive.stats().bindings;
      t.html('<r4-form id="rxt-st"><r4-textfield name="a" label="A" value="1"></r4-textfield><r4-select name="s" label="S" options=\'["x","y"]\'></r4-select><b r4-bind="texto:a"></b><i r4-show-if="s=y">y</i></r4-form>');
      const st = R4.state('#rxt-st');
      assert.ok(st && st === R4.state(R4.get('rxt-st')), 'mesmo estado por id ou componente');
      assert.eq(st.get('a'), '1');
      const ch = t.spy(); st.on('change', ch);
      st.set('s', 'y');
      assert.eq(st.get('s'), 'y', 'get lê na hora');
      await quadro(t);
      assert.notOk(t.box.querySelector('i').hidden);
      assert.eq(R4.reactive.stats().bindings, antes + 2);
      st.set('nao_existe', 1);
      assert.ok(t.logs.take('warn').some(m => m.includes('"nao_existe" não existe')));
      R4.get('rxt-st').destroy();
      assert.eq(R4.reactive.stats().bindings, antes, 'bindings liberados');
      assert.eq(R4.state('#rxt-st'), null);
      t.logs.take('warn');
    });

    test('r4-ignore: nada é ativado lá dentro', async t => {
      t.html('<r4-form id="rxt-ig"><r4-textfield name="a" label="A" value="ok"></r4-textfield><div r4-ignore><b id="rxt-ig1" r4-bind="texto:a">original</b><i id="rxt-ig2" r4-show-if="!a">x</i></div></r4-form>');
      await quadro(t);
      assert.eq(document.getElementById('rxt-ig1').textContent, 'original');
      assert.notOk(document.getElementById('rxt-ig2').hidden);
    });

    test('limite de bindings por página e por atributo', async t => {
      const L = R4.reactive.limits, old = L.bindings;
      t.cleanup(() => { L.bindings = old; });
      L.bindings = R4.reactive.stats().bindings + 2;
      t.html('<r4-form><r4-textfield name="a" label="A" value="1"></r4-textfield><b r4-bind="texto:a"></b><b r4-bind="texto:a"></b><b id="rxt-l3" r4-bind="texto:a">fora</b></r4-form>');
      await quadro(t);
      assert.eq(document.getElementById('rxt-l3').textContent, 'fora', 'além do limite: ignorado');
      assert.ok(t.logs.take('warn').some(m => m.includes('limite de')));
      L.bindings = old;
      t.html('<r4-form><r4-textfield name="a" label="A" value="1"></r4-textfield><b r4-bind="' + Array(25).fill('texto:a').join(';') + '"></b></r4-form>');
      assert.ok(t.logs.take('warn').some(m => m.includes('bindings demais')));
    });

    test('<r4-form src>: carrega ({retorno}, {data}, objeto puro, root), dispara load e vira o "original"', async t => {
      t.mockFetch({
        '/api/rx-a': { body: { status: 200, retorno: { nome: 'Ana', cor: '#00ff00', __proto__x: 1 } } },
        '/api/rx-b': { body: { data: { nome: 'Bia' } } },
        '/api/rx-c': { body: { nome: 'Caio' } },
        '/api/rx-d': { body: { dados: { perfil: { nome: 'Duda' } } } }
      });
      const load = t.spy();
      t.html('<r4-form id="rxt-src" src="/api/rx-a"><r4-textfield name="nome" label="Nome"></r4-textfield><b r4-bind="texto:nome"></b></r4-form>');
      R4.get('rxt-src').on('load', load);
      await t.waitFor(() => load.count, 2000, 'load');
      const f = R4.get('rxt-src');
      assert.eq(f.getValues().nome, 'Ana');
      assert.notOk(f.isDirty(), 'valores carregados viram o original');
      assert.deepEq(load.lastArgs[1], { nome: 'Ana', cor: '#00ff00', __proto__x: 1 });
      await quadro(t);
      assert.eq(t.box.querySelector('b').textContent, 'Ana', 'bindings acompanham o load');
      for (const [url, root, nome] of [['/api/rx-b', '', 'Bia'], ['/api/rx-c', '', 'Caio'], ['/api/rx-d', 'dados.perfil', 'Duda']]) {
        t.html('<r4-form id="rxt-src2" src="' + url + '"' + (root ? ' root="' + root + '"' : '') + '><r4-textfield name="nome" label="Nome"></r4-textfield></r4-form>');
        await t.waitFor(() => R4.get('rxt-src2').getValues().nome === nome, 2000, nome);
      }
    });

    test('<r4-form src> com erro: mensagem + "Tentar de novo", loaderror, R4.notify; recarregar:#id busca de novo', async t => {
      let n = 0;
      t.mockFetch({ '/api/rx-err': () => (++n === 1 ? { status: 500, body: { status: 500, retorno: '<b>falhou</b>' } } : { body: { retorno: { nome: 'Voltou' } } }) });
      const le = t.spy();
      t.html('<r4-form id="rxt-e" src="/api/rx-err"><r4-textfield name="nome" label="Nome" value="atual"></r4-textfield></r4-form><button id="rxt-rl" r4-click="recarregar:#rxt-e">r</button>');
      const f = R4.get('rxt-e'); f.on('loaderror', le);
      await t.waitFor(() => le.count, 2000, 'loaderror');
      assert.eq(f.msgEl.hidden, false);
      assert.contains(f.msgEl, 'Falha ao carregar');
      assert.eq(f.msgEl.querySelector('b'), null, 'mensagem do servidor como texto');
      assert.ok(f.msgEl.querySelector('.r4-form-retry'), 'botão Tentar de novo');
      assert.eq(f.getValues().nome, 'atual', 'valores atuais ficam');
      assert.ok(document.querySelector('.r4-ntf'), 'notify de erro');
      document.getElementById('rxt-rl').click();
      await t.waitFor(() => f.getValues().nome === 'Voltou', 2000, 'recarregar');
      assert.eq(f.msgEl.hidden, true);
    });

    test('envio: encrypt informa método + caminho; 422 {erros} vai para os campos; salvar:#id; notify ok/erro (notify="false" desliga)', async t => {
      const enc = t.spy(async (d, o) => ({ x: 'a', y: 'b', z: 'c', _o: o }));
      const real = R4.crypto.encrypt; R4.crypto.encrypt = enc; t.cleanup(() => { R4.crypto.encrypt = real; });
      const m = t.mockFetch({ 'PUT /api/rx-s': { status: 422, body: { status: 422, retorno: 'Dados inválidos', erros: { nome: 'Nome já usado' } } }, 'POST /api/rx-ok': { body: { status: 200 } } });
      t.html('<r4-form id="rxt-sv" action="/api/rx-s" method="put" encrypt><r4-textfield name="nome" label="Nome" value="Ana"></r4-textfield></r4-form><button id="rxt-sb" r4-click="salvar:#rxt-sv">s</button>');
      const f = R4.get('rxt-sv'), fail = t.spy(); f.on('failure', fail);
      document.getElementById('rxt-sb').click();
      await t.waitFor(() => fail.count, 2000, 'failure');
      assert.deepEq(enc.lastArgs[1], { metodo: 'PUT', caminho: '/api/rx-s' }, 'AAD = método + caminho');
      assert.eq(m.calls[0].json.x, 'a', 'corpo cifrado');
      assert.eq(f.getField('nome').getError(), 'Nome já usado');
      assert.ok([...document.querySelectorAll('.r4-ntf')].some(n => n.textContent.includes('Dados inválidos')), 'notify de erro');
      R4.notify.closeAll();
      t.html('<r4-form id="rxt-ok" action="/api/rx-ok" notify="false"><r4-textfield name="nome" label="Nome" value="Ana"></r4-textfield></r4-form>');
      await R4.get('rxt-ok').submit();
      assert.eq(document.querySelector('.r4-ntf'), null, 'notify="false"');
      t.html('<r4-form id="rxt-ok2" action="/api/rx-ok"><r4-textfield name="nome" label="Nome" value="Ana"></r4-textfield></r4-form>');
      await R4.get('rxt-ok2').submit();
      assert.ok(document.querySelector('.r4-ntf'), 'notify de sucesso (padrão ligado)');
    });

    test('autosave-ms: envia rascunho depois de parar de digitar (só se mudou e é válido)', async t => {
      const m = t.mockFetch({ 'POST /api/rx-draft': { body: { status: 200 } } });
      t.html('<r4-form id="rxt-as" autosave-ms="60" autosave-url="/api/rx-draft" action="/api/nao"><r4-textfield name="a" label="A" required></r4-textfield></r4-form>');
      const f = R4.get('rxt-as'), as = t.spy(); f.on('autosave', as);
      const inp = inputDe(f, 'a');
      digitar(inp, 'x'); await t.sleep(20); digitar(inp, 'xy');
      await t.waitFor(() => as.count, 1500, 'autosave');
      assert.eq(m.count('/api/rx-draft'), 1, 'um envio só (debounce)');
      assert.deepEq(m.calls[0].json, { a: 'xy' });
      assert.notOk(f.isDirty(), 'rascunho salvo vira o original');
      digitar(inp, '');
      await t.sleep(150);
      assert.eq(m.count('/api/rx-draft'), 1, 'inválido não envia');
    });

    test('<r4-filedrop name src upload-url>: campo do form (imagem atual, envio automático, valor = URL, remover, required)', async t => {
      const m = t.mockFetch({ 'POST /api/rx-up': { body: { status: 200, retorno: { url: '/img/nova.png' } } } });
      t.html('<r4-form id="rxt-fd"><r4-filedrop name="foto" label="Foto" src="/img/atual.png" accept="image/png" upload-url="/api/rx-up" required></r4-filedrop><b id="rxt-fdb" r4-bind="texto:foto|sem foto"></b></r4-form>');
      const f = R4.get('rxt-fd'), fd = f.getField('foto');
      assert.ok(fd, 'filedrop com name é campo do form');
      assert.deepEq(f.getValues(), { foto: '/img/atual.png' });
      assert.eq(fd.curImg.getAttribute('src'), '/img/atual.png', 'miniatura da imagem atual');
      assert.eq(fd.labelEl.textContent, 'Foto');
      const ch = t.spy(); f.on('change', ch);
      const png = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52])], 'nova.png', { type: 'image/png' });
      await fd.add([png]);
      await t.waitFor(() => fd.getValue() === '/img/nova.png', 2000, 'upload');
      assert.eq(m.count('/api/rx-up'), 1, 'enviou sozinho (multipart)');
      assert.ok(m.calls[0].body instanceof FormData);
      assert.eq(ch.count, 1, 'change do form');
      await t.sleep(50);
      assert.eq(document.getElementById('rxt-fdb').textContent, '/img/nova.png');
      assert.ok(f.isDirty());
      fd.removeImage();
      assert.eq(fd.getValue(), ''); assert.ok(fd.curEl.hidden);
      assert.notOk(f.validate(), 'required sem imagem');
      assert.eq(fd.getError(), 'Campo obrigatório.');
      f.reset();
      assert.eq(fd.getValue(), '/img/atual.png');
      fd.setValue('javascript:alert(1)');
      assert.ok(fd.curEl.hidden, 'URL perigosa não vira miniatura');
      t.html('<r4-filedrop accept=".csv"></r4-filedrop>');
      assert.eq(t.box.querySelector('.r4-fd-current'), null, 'sem name/src/label: filedrop igual ao de antes');
    });

    test('campo inválido numa aba escondida: a aba é ativada antes do foco', async t => {
      t.html('<r4-form id="rxt-tab"><r4-tabpanel><r4-tab title="A"><r4-textfield name="a" label="A"></r4-textfield></r4-tab><r4-tab title="B"><r4-textfield name="b" label="B" required></r4-textfield></r4-tab></r4-tabpanel></r4-form>');
      const f = R4.get('rxt-tab'), b = f.getField('b');
      assert.ok(b.el.closest('[hidden]'), 'começa escondido');
      assert.notOk(f.validate());
      assert.eq(b.el.closest('[hidden]'), null, 'aba B ativada');
      assert.eq(document.activeElement, b.input);
    });
  });
})();
