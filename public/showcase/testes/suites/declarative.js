/* suíte declarative: tags <r4-*>, atributos kebab→camel, avisos de digitação, r4-click / r4-confirm / r4-ignore */
(() => {
  const { suite, test, assert } = R4Test;
  const letras = () => String.fromCharCode(97 + Math.floor(Math.random() * 26), 97 + Math.floor(Math.random() * 26));
  const janelas = () => [...document.querySelectorAll('.r4-window')];
  const achar = (t, xtype) => Object.values(R4.instances).find(c => c.xtype === xtype && c.el && t.box.contains(c.el));
  const botao = (win, txt) => [...win.querySelectorAll('button')].find(b => b.textContent.trim() === txt);

  suite('declarative', () => {
    test('R4.scan monta <r4-panel>: atributos viram config, conteúdo vira html, o id passa para o componente', t => {
      t.html('<r4-panel id="r4t-p1" title="Olá" collapsible>corpo <b>negrito</b></r4-panel>');
      const host = t.box.firstElementChild, p = R4.get('r4t-p1');
      assert.ok(p, 'componente registrado pelo id');
      assert.eq(p.xtype, 'panel');
      assert.eq(p.title, 'Olá');
      assert.eq(p.collapsible, true, 'atributo sem valor = true');
      assert.ok(host.hasAttribute('r4-ready'), 'a tag recebe r4-ready');
      assert.eq(host._r4, p, 'tag guarda o componente em _r4');
      assert.eq(host.id, '', 'id sai da tag e vai para o componente');
      assert.eq(p.el.id, 'r4t-p1');
      assert.eq(p.body.querySelector('b').textContent, 'negrito', 'conteúdo da tag virou o html do corpo');
      assert.ok(host.contains(p.el), 'o componente fica dentro da tag');
    });

    test('atributos kebab-case viram camelCase e são convertidos pelo tipo do padrão (número, booleano, JSON)', t => {
      t.html('<r4-grid id="r4t-g1" page-size="2" striped="false" filter data=\'[{"a":1},{"a":2},{"a":3}]\'></r4-grid>');
      const g = R4.get('r4t-g1');
      assert.eq(g.pageSize, 2, 'page-size → pageSize (número)');
      assert.eq(g.striped, false, 'striped="false" → false');
      assert.eq(g.filter, true, 'atributo sem valor → true');
      assert.deepEq(g.data, [{ a: 1 }, { a: 2 }, { a: 3 }], 'data aceita JSON inline');
      assert.eq(g.getView().length, 3);
      assert.eq(g.el.querySelectorAll('tbody tr[aria-rowindex]').length, 2, 'só 2 linhas na página');
      t.html('<r4-grid id="r4t-g2" page-size="abc" data="isto não é json"></r4-grid>');
      const g2 = R4.get('r4t-g2');
      assert.eq(g2.pageSize, 0, 'número inválido mantém o padrão');
      assert.deepEq(g2.data, [], 'JSON inválido mantém o padrão');
    });

    test('filhos estruturais: <r4-col> (field/header/format) e <r4-button> pelo texto', t => {
      t.html('<r4-grid data=\'[{"n":"Ana","v":1234.5}]\'><r4-col field="n" header="Nome"></r4-col><r4-col field="v" header="Valor" format="money" align="right" width="120"></r4-col></r4-grid><r4-button variant="primary" icon="play">Clique</r4-button>');
      const g = achar(t, 'grid');
      assert.deepEq(g.columns.map(c => c.header), ['Nome', 'Valor']);
      assert.eq(g.columns[1].format, 'money');
      assert.eq(g.columns[1].align, 'right');
      assert.eq(g.columns[1].width, 120);
      assert.deepEq([...g.thead.querySelectorAll('th')].map(th => th.textContent), ['Nome', 'Valor']);
      assert.eq(g.tbody.querySelector('tr[aria-rowindex] td:nth-child(2)').textContent.replace(/ /g, ' '), 'R$ 1.234,50', 'format="money" aplicado');
      const b = achar(t, 'button');
      assert.eq(b.text, 'Clique', 'texto do botão = conteúdo da tag');
      assert.eq(b.variant, 'primary');
      assert.ok(b.el.classList.contains('r4-btn-primary'));
    });

    test('tags aninhadas montam sozinhas (dentro do conteúdo de outra tag)', t => {
      t.html('<r4-panel title="Pai"><r4-panel id="r4t-filho" title="Filho"><r4-badge text="novo" variant="ok"></r4-badge></r4-panel></r4-panel>');
      assert.ok(R4.get('r4t-filho'), 'filho montado');
      assert.eq(t.box.querySelectorAll('.r4-panel').length, 2);
      assert.eq(t.box.querySelector('.r4-bdg').textContent, 'novo');
      assert.eq(t.box.querySelectorAll('[r4-ready]').length, 3, 'as três tags ativadas');
    });

    test('tag desconhecida gera aviso com sugestão ("quis dizer ...?")', t => {
      const tag = 'r4-panel' + letras();   // sempre perto de "panel" (o aviso é dado uma vez por tag)
      t.html('<' + tag + ' title="x"></' + tag + '>');
      const w = t.logs.take('warn').filter(m => m.includes(tag));
      assert.eq(w.length, 1, 'um aviso para a tag');
      assert.contains(w[0], 'tag desconhecida <' + tag + '>');
      assert.contains(w[0], 'quis dizer <r4-panel>?');
      assert.notOk(t.box.firstElementChild.hasAttribute('r4-ready'), 'não é montada');
      t.html('<r4-zzzzzzzz></r4-zzzzzzzz>');
      const w2 = t.logs.take('warn').filter(m => m.includes('r4-zzzzzzzz'));
      assert.eq(w2.length, 1);
      assert.notContains(w2[0], 'quis dizer', 'sem sugestão quando nada se parece');
    });

    test('atributo desconhecido gera aviso com sugestão e o atributo certo continua valendo', t => {
      t.html('<r4-panel id="r4t-attr" titel="Errado" title="Certo"></r4-panel><r4-button text="x" varient="primary"></r4-button>');
      const w = t.logs.take('warn');
      assert.ok(w.some(m => m.includes('<r4-panel>: atributo desconhecido "titel"') && m.includes('quis dizer "title"?')), 'sugere title');
      assert.ok(w.some(m => m.includes('"varient"') && m.includes('quis dizer "variant"?')), 'sugere variant');
      assert.eq(R4.get('r4t-attr').title, 'Certo');
    });

    test('atributos __proto__/constructor/prototype na tag são ignorados com aviso', t => {
      t.html('<r4-panel id="r4t-proto" title="ok" constructor="x" prototype="y" __proto__="z"></r4-panel>');
      const p = R4.get('r4t-proto');
      assert.ok(p instanceof R4.registry.panel.cls);
      assert.eq(p.title, 'ok');
      assert.notEq(p.constructor, 'x');
      assert.ok(t.logs.take('warn').filter(m => m.includes('ignorado')).length >= 2, 'avisos');
    });

    test('r4-click: toast mostra o aviso; várias ações com ";" executam em ordem', async t => {
      t.html('<button id="r4t-c1" r4-click="toast:Olá mundo">a</button><button id="r4t-c2" r4-click="toast:um;toast:dois">b</button>');
      t.box.querySelector('#r4t-c1').click();
      assert.eq([...document.querySelectorAll('.r4-toast')].map(x => x.textContent).join('|'), 'Olá mundo');
      t.box.querySelector('#r4t-c2').click();
      assert.eq([...document.querySelectorAll('.r4-toast')].map(x => x.textContent).join('|'), 'Olá mundo|um|dois');
    });

    test('r4-click: alert abre diálogo com o texto (HTML vira texto) e botão OK fecha', t => {
      t.html('<button id="r4t-a1" r4-click="alert:<img src=x onerror=window.__r4tpwn=1>">a</button>');
      const antes = janelas().length;
      t.box.querySelector('#r4t-a1').click();
      const w = janelas();
      assert.eq(w.length, antes + 1, 'abriu uma janela');
      const j = w.at(-1);
      assert.ok(j.textContent.includes('<img src=x onerror=window.__r4tpwn=1>'), 'o HTML aparece como texto');
      assert.eq(j.querySelector('img'), null, 'nenhum <img> criado');
      assert.eq(window.__r4tpwn, undefined, 'nada executou');
      botao(j, 'OK').click();
      assert.eq(janelas().length, antes, 'OK fecha');
    });

    test('r4-click: goto bloqueia javascript:/data: (com aviso) e aceita #âncora', t => {
      const href = location.href;
      t.cleanup(() => { history.replaceState(null, '', href); });
      t.html('<button id="r4t-g1" r4-click="goto:javascript:window.__r4tpwn=1">a</button><button id="r4t-g2" r4-click="goto:  JaVa&#9;ScRiPt:window.__r4tpwn=1">b</button><button id="r4t-g3" r4-click="goto:data:text/html,x">c</button><a id="r4t-g4" href="#" r4-click="goto:#r4t-ancora">d</a>');
      ['r4t-g1', 'r4t-g2', 'r4t-g3'].forEach(id => t.box.querySelector('#' + id).click());
      assert.eq(window.__r4tpwn, undefined, 'javascript: não executou');
      assert.eq(t.logs.take('warn').filter(m => m.includes('goto bloqueado')).length, 3, 'um aviso por tentativa');
      assert.eq(location.hash, '', 'não navegou');
      t.box.querySelector('#r4t-g4').click();
      assert.eq(location.hash, '#r4t-ancora', 'âncora válida navega');
    });

    test('r4-click: ação desconhecida avisa com sugestão; R4.action registra ação própria', t => {
      t.html('<button id="r4t-x1" r4-click="tosat:x">a</button><button id="r4t-x2" r4-click="r4t-minha:valor 1">b</button>');
      t.box.querySelector('#r4t-x1').click();
      assert.contains(t.logs.take('warn').join('|'), 'ação desconhecida "tosat" — quis dizer "toast"?');
      const f = t.spy();
      R4.action('r4t-minha', f);
      t.cleanup(() => { delete R4.actions['r4t-minha']; });
      t.box.querySelector('#r4t-x2').click();
      assert.eq(f.count, 1);
      assert.eq(f.lastArgs[0], 'valor 1', 'argumento = texto depois do ":"');
      assert.eq(f.lastArgs[1], t.box.querySelector('#r4t-x2'), 'segundo argumento = o elemento');
    });

    test('r4-click: ação que lança erro vira aviso na tela e não derruba as outras ações', t => {
      R4.action('r4t-quebra', () => { throw new Error('deu ruim'); });
      t.cleanup(() => { delete R4.actions['r4t-quebra']; });
      t.html('<button id="r4t-q" r4-click="r4t-quebra:x;toast:seguiu">a</button>');
      t.box.querySelector('#r4t-q').click();
      const toasts = [...document.querySelectorAll('.r4-toast')].map(x => x.textContent);
      assert.ok(toasts.some(x => x.includes('deu ruim')), 'erro mostrado ao usuário');
      assert.ok(toasts.includes('seguiu'), 'a ação seguinte rodou');
      assert.eq(t.logs.take('error').length, 1, 'e foi registrado no console');
    });

    test('r4-click: modal abre <r4-window>, toggle recolhe panel, anim aplica classe, close fecha', t => {
      t.html('<r4-window id="r4t-w" title="Minha janela"><p>conteúdo</p><r4-button r4-click="close">Fechar</r4-button></r4-window><r4-panel id="r4t-pn" title="P">x</r4-panel><button id="r4t-m" r4-click="modal:#r4t-w">abrir</button><button id="r4t-t" r4-click="toggle:#r4t-pn">t</button><button id="r4t-an" r4-click="anim:shake">s</button>');
      const w = R4.get('r4t-w');
      assert.ok(w, 'janela criada, oculta');
      assert.eq(w.closeAction, 'hide', 'janela declarativa só esconde ao fechar');
      t.box.querySelector('#r4t-m').click();
      const aberta = janelas().find(j => j.textContent.includes('Minha janela'));
      assert.ok(aberta, 'janela visível');
      assert.ok(aberta.textContent.includes('conteúdo'));
      botao(aberta, 'Fechar').click();
      assert.notOk(janelas().some(j => j.textContent.includes('Minha janela') && !j.closest('[hidden]')), 'fechou');
      t.box.querySelector('#r4t-t').click();
      assert.ok(R4.get('r4t-pn').el.classList.contains('r4-collapsed'), 'toggle recolheu');
      t.box.querySelector('#r4t-t').click();
      assert.notOk(R4.get('r4t-pn').el.classList.contains('r4-collapsed'), 'toggle expandiu');
      t.box.querySelector('#r4t-an').click();
      assert.ok(t.box.querySelector('#r4t-an').classList.contains('r4-fx-shake'), 'anim:shake');
      t.logs.clear();
    });

    test('r4-click com alvo inexistente mostra erro e não quebra', t => {
      t.html('<button id="r4t-n" r4-click="modal:#nao-existe-r4t">a</button>');
      t.box.querySelector('#r4t-n').click();
      assert.eq(t.logs.take('error').length, 1, 'erro registrado');
      assert.ok([...document.querySelectorAll('.r4-toast')].some(x => x.textContent.includes('alvo não encontrado')), 'toast com o motivo');
    });

    test('r4-confirm: pede confirmação; Cancelar não executa, Sim executa', t => {
      t.html('<button id="r4t-cf" r4-click="toast:confirmado!" r4-confirm="Tem certeza?">x</button>');
      const toasts = () => [...document.querySelectorAll('.r4-toast')].map(x => x.textContent);
      const antes = janelas().length;
      t.box.querySelector('#r4t-cf').click();
      let j = janelas().at(-1);
      assert.eq(janelas().length, antes + 1, 'abriu o diálogo');
      assert.contains(j, 'Tem certeza?');
      assert.notOk(toasts().includes('confirmado!'), 'ainda não executou');
      botao(j, 'Cancelar').click();
      assert.notOk(toasts().includes('confirmado!'), 'Cancelar não executa');
      assert.eq(janelas().length, antes, 'diálogo fechou');
      t.box.querySelector('#r4t-cf').click();
      botao(janelas().at(-1), 'Sim').click();
      assert.ok(toasts().includes('confirmado!'), 'Sim executa');
    });

    test('r4-ignore: dentro dele tags não são montadas e r4-click não executa', t => {
      t.html('<div r4-ignore><r4-panel id="r4t-ign" title="x" html="oi"></r4-panel><button id="r4t-ib" r4-click="toast:NAO-DEVE-APARECER">x</button></div><button id="r4t-ok" r4-click="toast:fora">y</button>');
      assert.eq(R4.get('r4t-ign'), undefined, 'tag ignorada não vira componente');
      assert.eq(t.box.querySelectorAll('[r4-ready]').length, 0);
      t.box.querySelector('#r4t-ib').click();
      assert.notOk([...document.querySelectorAll('.r4-toast')].some(x => x.textContent.includes('NAO-DEVE')), 'ação ignorada');
      t.box.querySelector('#r4t-ok').click();
      assert.ok([...document.querySelectorAll('.r4-toast')].some(x => x.textContent === 'fora'), 'fora do r4-ignore funciona');
    });

    test('botão desabilitado com r4-click não executa a ação', t => {
      t.html('<button id="r4t-d" disabled r4-click="toast:nao">x</button>');
      t.box.querySelector('#r4t-d').click();
      assert.eq(document.querySelectorAll('.r4-toast').length, 0);
    });

    test('elementos inseridos depois são ativados sozinhos (MutationObserver); autoScan=false desliga', async t => {
      const antes = R4.config.autoScan;
      t.cleanup(() => { R4.config.autoScan = antes; });
      t.box.innerHTML = '<r4-badge id="r4t-auto" text="auto"></r4-badge>';
      await t.waitFor(() => R4.get('r4t-auto'), 3000, 'montagem automática (a aba precisa estar visível: usa requestAnimationFrame)');
      assert.eq(R4.get('r4t-auto').text, 'auto');
      await t.sleep(150);   // deixa terminar a varredura que a própria montagem agendou
      R4.config.autoScan = false;
      t.box.innerHTML = '<r4-badge id="r4t-manual" text="manual"></r4-badge>';
      await t.sleep(250);
      assert.eq(R4.get('r4t-manual'), undefined, 'com autoScan=false nada monta sozinho');
      R4.scan(t.box);
      assert.ok(R4.get('r4t-manual'), 'R4.scan manual monta');
    });

    test('R4.suggest sugere o nome mais próximo (distância < 3) e R4.animate aplica a classe', t => {
      assert.eq(R4.suggest('buton', ['grid', 'button', 'panel']), 'button');
      assert.eq(R4.suggest('pnael', ['grid', 'button', 'panel']), 'panel');
      assert.eq(R4.suggest('xyzxyz', ['grid', 'button']), null);
      const e = document.createElement('div');
      t.box.append(e);
      R4.animate(e, 'pulse');
      assert.ok(e.classList.contains('r4-fx-pulse'));
      R4.animate('#nao-existe-nada', 'pulse');
    });
  });
})();
