/* suítes form e select: validação (required/minLength/email/match/pattern ReDoS-safe/validator), CPF/CNPJ, máscaras,
   getValues seguro, envio com fetch simulado (sucesso, 422 por campo, beforesubmit, carregando) e o select */
(() => {
  const { suite, test, assert } = R4Test;
  const digita = (c, v) => { c.input.value = v; c.input.dispatchEvent(new Event('input', { bubbles: true })); };
  const tecla = (alvo, key, extra) => alvo.dispatchEvent(new KeyboardEvent('keydown', Object.assign({ key, bubbles: true, cancelable: true }, extra)));
  const V = () => R4.validation;
  const letra = () => String.fromCharCode(97 + Math.floor(Math.random() * 26));

  suite('form', () => {
    test('validação: required, minLength, maxLength, email e mensagens em português', t => {
      const f = t.create({ xtype: 'textfield', name: 'n', label: 'Nome', required: true, minLength: 3, maxLength: 6 });
      assert.eq(f.validate(), false);
      assert.eq(f.getError(), 'Campo obrigatório.');
      assert.eq(f.errEl.textContent, 'Campo obrigatório.', 'mensagem aparece no campo');
      assert.eq(f.errEl.getAttribute('role'), 'alert');
      assert.eq(f.input.getAttribute('aria-invalid'), 'true');
      assert.ok(f.el.classList.contains('r4-invalid'));
      assert.contains(f.labelEl, '*', 'asterisco de obrigatório no rótulo');
      assert.eq(f.input.getAttribute('aria-required'), 'true');
      f.setValue('ab');
      assert.eq(f.validate(), false);
      assert.eq(f.getError(), 'Use pelo menos 3 caracteres.');
      f.setValue('abcdefg');
      f.input.value = 'abcdefg';
      assert.eq(f.isValid(), false, 'isValid não mexe na tela, mas confere');
      f.setValue('abc');
      assert.eq(f.validate(), true);
      assert.eq(f.getError(), '');
      assert.eq(f.errEl.hidden, true);
      assert.eq(f.input.getAttribute('aria-invalid'), null);
      const e = t.create({ xtype: 'textfield', name: 'e', email: true });
      e.setValue('sem-arroba');
      assert.eq(e.validate(), false);
      assert.eq(e.getError(), 'Informe um e-mail válido.');
      e.setValue('ana.souza+x@dominio.com.br');
      assert.eq(e.validate(), true);
      e.setValue('');
      assert.eq(e.validate(), true, 'vazio e não obrigatório é válido');
    });

    test('validação: messages troca o texto só do campo; validator (função/nome) e evento invalid', t => {
      const inv = t.spy();
      const f = t.create({ xtype: 'textfield', name: 'n', required: true, messages: { required: 'Informe o nome!' }, listeners: { invalid: inv } });
      f.validate();
      assert.eq(f.getError(), 'Informe o nome!');
      assert.eq(inv.count, 1);
      f.validate();
      assert.eq(inv.count, 1, 'não repete o evento para o mesmo erro');
      const v1 = t.create({ xtype: 'textfield', name: 'v', validator: val => val === 'ok' || 'Só aceito "ok"' });
      v1.setValue('xx');
      assert.eq(v1.validate(), false);
      assert.eq(v1.getError(), 'Só aceito "ok"', 'string devolvida vira a mensagem');
      v1.setValue('ok');
      assert.eq(v1.validate(), true);
      const v2 = t.create({ xtype: 'textfield', name: 'v2', validator: () => false });
      v2.setValue('x');
      assert.eq(v2.validate(), false);
      assert.eq(v2.getError(), 'Valor inválido.', 'false → mensagem padrão');
      const v3 = t.create({ xtype: 'textfield', name: 'v3', validator: 'cpf' });
      v3.setValue('111.111.111-11');
      assert.eq(v3.validate(), false);
      assert.eq(v3.getError(), 'CPF inválido.', 'validator por nome');
      v3.setValue('529.982.247-25');
      assert.eq(v3.validate(), true);
      const v4 = t.create({ xtype: 'textfield', name: 'v4', validator: () => { throw new Error('bug no validator'); } });
      v4.setValue('x');
      assert.eq(v4.validate(), false, 'exceção no validator reprova em vez de quebrar');
      assert.eq(t.logs.take('error').length, 1, 'e registra o erro');
      R4.validation.register('r4tpar', v => Number(v) % 2 === 0 || 'Use um número par');
      t.cleanup(() => { delete R4.validation.validators.r4tpar; });
      const v5 = t.create({ xtype: 'textfield', name: 'v5', validator: 'r4tpar' });
      v5.setValue('3');
      assert.eq(v5.validate(), false);
      assert.eq(v5.getError(), 'Use um número par', 'validador registrado com R4.validation.register');
    });

    test('validateOn: blur (padrão) valida ao sair, input valida ao digitar, submit só no envio; depois do erro revalida ao digitar', t => {
      const b = t.create({ xtype: 'textfield', name: 'b', required: true });
      digita(b, 'a'); digita(b, '');
      assert.eq(b.getError(), '', 'blur: digitar não valida ainda');
      b.el.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
      assert.eq(b.getError(), 'Campo obrigatório.', 'ao sair do campo');
      digita(b, 'x');
      assert.eq(b.getError(), '', 'depois do erro, revalida ao digitar e o erro some');
      const i = t.create({ xtype: 'textfield', name: 'i', required: true, validateOn: 'input', minLength: 3 });
      digita(i, 'a');
      assert.eq(i.getError(), 'Use pelo menos 3 caracteres.', 'input: valida na hora');
      const s = t.create({ xtype: 'textfield', name: 's', required: true, validateOn: 'submit' });
      digita(s, 'a'); digita(s, '');
      s.el.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
      assert.eq(s.getError(), '', 'submit: nunca valida sozinho');
    });

    test('pattern: valor inteiro precisa casar; anti-ReDoS ignora (a+)+ e não trava; valor gigante nem roda a regex', t => {
      const f = t.create({ xtype: 'textfield', name: 'cod', pattern: '[0-9]{3}', patternText: 'Três dígitos' });
      f.setValue('12a');
      assert.eq(f.validate(), false);
      assert.eq(f.getError(), 'Três dígitos');
      f.setValue('123');
      assert.eq(f.validate(), true);
      f.setValue('1234');
      assert.eq(f.validate(), false, 'precisa casar o valor inteiro, não um pedaço');
      const l = letra(), ruim = '(' + l + '+)+$';   // único por execução: o aviso sai uma vez por padrão
      const r = t.create({ xtype: 'textfield', name: 'r', pattern: ruim });
      r.setValue(l.repeat(28) + '!');
      const t0 = performance.now();
      r.validate();
      const dt = performance.now() - t0;
      assert.lt(dt, 250, 'padrão catastrófico não trava (' + Math.round(dt) + ' ms)');
      assert.ok(t.logs.take('warn').some(m => /ReDoS/.test(m)), 'aviso de ReDoS no console');
      const g = t.create({ xtype: 'textfield', name: 'g', pattern: '[a-z]+', maxLength: 0, sanitize: false });
      g.setValue('a'.repeat(6000));
      const t1 = performance.now();
      assert.eq(g.validate(), false, 'mais de 5.000 caracteres: recusado sem rodar a regex');
      assert.lt(performance.now() - t1, 250);
      const legit = [['([0-9]{3}\\.){2}[0-9]{3}-[0-9]{2}', '123.456.789-09'], ['(\\+55)?[0-9]{10,11}', '+5511999998888'], ['(ab|cd)+', 'abcd'], ['[A-Za-z ]+', 'Ana Maria']];
      legit.forEach(([p, v]) => { const c = t.create({ xtype: 'textfield', name: 'p', pattern: p }); c.setValue(v); assert.eq(c.validate(), true, 'padrão legítimo ' + p); });
    });

    test('match: confirmar senha compara com o outro campo do form e cita o rótulo', t => {
      const f = t.create({ xtype: 'form', fields: [{ type: 'password', name: 'senha', label: 'Senha' }, { type: 'password', name: 'conf', label: 'Confirmação', match: 'senha' }] });
      f.getField('senha').setValue('Abc12345!');
      f.getField('conf').setValue('Abc1234');
      const c = f.getField('conf');
      assert.eq(c.validate(), false);
      assert.eq(c.getError(), 'Não confere com o campo "Senha".');
      c.setValue('Abc12345!');
      assert.eq(c.validate(), true);
      assert.eq(f.validate(), true);
    });

    test('CPF e CNPJ: dígitos verificadores, com ou sem máscara; rejeita sequências repetidas e tamanhos errados', t => {
      const cpfs = [['529.982.247-25', true], ['52998224725', true], ['123.456.789-09', true], ['111.111.111-11', false], ['000.000.000-00', false],
        ['529.982.247-24', false], ['5299822472', false], ['529.982.247-250', false], ['', false], ['abc.def.ghi-jk', false]];
      cpfs.forEach(([v, ok]) => assert.eq(V().cpf(v), ok, 'cpf ' + JSON.stringify(v)));
      const cnpjs = [['11.222.333/0001-81', true], ['11222333000181', true], ['00.000.000/0001-91', true], ['12.ABC.345/01DE-35', true], ['11.222.333/0001-80', false],
        ['11.111.111/1111-11', false], ['1122233300018', false], ['', false]];
      cnpjs.forEach(([v, ok]) => assert.eq(V().cnpj(v), ok, 'cnpj ' + JSON.stringify(v)));
      assert.eq(V().validators.cpfCnpj('529.982.247-25'), true);
      assert.eq(V().validators.cpfCnpj('11.222.333/0001-81'), true);
      assert.notEq(V().validators.cpfCnpj('123'), true, 'validador cpfCnpj devolve mensagem para inválido');
      assert.eq(V().email('a@b.co'), true);
      assert.eq(V().email('a@b'), false);
      assert.eq(V().email('a b@c.com'), false);
      assert.eq(V().email('a'.repeat(250) + '@x.com'), false, 'mais de 254 caracteres');
    });

    test('maskfield CPF: digita sem pontuação, formata, getValue sem máscara, valida os dígitos; moeda devolve número', t => {
      const c = t.create({ xtype: 'maskfield', name: 'doc', mask: 'cpf', required: true });
      digita(c, '52998224725');
      assert.eq(c.input.value, '529.982.247-25');
      assert.eq(c.getValue(), '52998224725', 'raw: só dígitos');
      assert.eq(c.getMasked(), '529.982.247-25');
      assert.eq(c.validate(), true);
      digita(c, '52998224724');
      assert.eq(c.validate(), false);
      assert.eq(c.getError(), 'CPF inválido.');
      digita(c, 'abc529x982');
      assert.eq(c.input.value, '529.982', 'letras são descartadas');
      const r = t.create({ xtype: 'maskfield', name: 'doc2', mask: 'cpf', raw: false });
      digita(r, '52998224725');
      assert.eq(r.getValue(), '529.982.247-25', 'raw:false devolve o texto formatado');
      const m = t.create({ xtype: 'maskfield', name: 'preco', mask: 'moeda' });
      digita(m, '123456');
      assert.eq(m.getValue(), 1234.56, 'moeda → Number');
      assert.eq(m.input.value.replace(/ /g, ' '), 'R$ 1.234,56');
      const tel = t.create({ xtype: 'maskfield', name: 'tel', mask: 'telefone' });
      digita(tel, '11999998888');
      assert.eq(tel.input.value, '(11) 99999-8888');
      digita(tel, '1199998888');
      assert.eq(tel.input.value, '(11) 9999-8888', 'fixo de 10 dígitos');
      digita(tel, '1199');
      assert.eq(tel.validate(), false);
      assert.eq(tel.getError(), 'Telefone incompleto.');
    });

    test('R4.validation: mask/unmask (cpf, cnpj, telefone, cep, data, cartão, padrão livre) e parseNumber', t => {
      assert.eq(V().mask('52998224725', 'cpf'), '529.982.247-25');
      assert.eq(V().mask('11222333000181', 'cnpj'), '11.222.333/0001-81');
      assert.eq(V().mask('01310100', 'cep'), '01310-100');
      assert.eq(V().mask('25122026', 'data'), '25/12/2026');
      assert.eq(V().mask('1234567890123456', 'cartao'), '1234 5678 9012 3456');
      assert.eq(V().mask('abc123', 'AA-999'), 'AB-123', 'padrão livre: A letra, 9 dígito');
      assert.eq(V().mask('123', 'cpf'), '123', 'parcial não inventa pontuação');
      assert.eq(V().unmask('529.982.247-25', 'cpf'), '52998224725');
      assert.eq(V().unmask('(11) 99999-8888', 'telefone'), '11999998888');
      assert.eq(V().parseNumber('1.234,56'), 1234.56);
      assert.eq(V().parseNumber('10'), 10);
      assert.eq(V().parseNumber('-5,5'), -5.5);
      assert.eq(V().parseNumber(''), null);
      assert.ok(Number.isNaN(V().parseNumber('abc')), 'inválido → NaN');
      assert.ok(Number.isNaN(V().parseNumber('1,5e3')), 'notação científica não vale');
      assert.eq(V().parseNumber('R$ 12,50'), 12.5);
    });

    test('força da senha e passwordfield (mostrar/ocultar, força mínima)', t => {
      assert.eq(V().strength(''), 0);
      assert.eq(V().strength('12345678'), 0, 'senha da lista de fracas');
      assert.eq(V().strength('aaaaaaaa'), 0, 'caractere repetido');
      assert.eq(V().strength('abc'), 0);
      assert.eq(V().strength('Abcdef12'), 3);
      assert.eq(V().strength('Abcdef12!ghij'), 4);
      const p = t.create({ xtype: 'passwordfield', name: 'p', showStrength: true, minStrength: 3 });
      assert.eq(p.input.type, 'password');
      digita(p, 'fraca');
      assert.eq(p.getStrength(), 0);
      assert.eq(p.validate(), false);
      assert.contains(p.getError(), 'Senha fraca');
      digita(p, 'Abcdef12!ghij');
      assert.eq(p.validate(), true);
      p.toggleVisible(true);
      assert.eq(p.input.type, 'text', 'mostrar senha');
      p.toggleVisible(false);
      assert.eq(p.input.type, 'password');
    });

    test('numberfield: min/max, decimais, vírgula pt-BR, stepBy; datefield: min/max e getDate', t => {
      const n = t.create({ xtype: 'numberfield', name: 'n', min: 1, max: 10, decimals: 2 });
      digita(n, '1.234,5');
      assert.eq(n.getValue(), 1234.5, 'vírgula decimal e ponto de milhar');
      assert.eq(n.validate(), false);
      assert.eq(n.getError(), 'O valor máximo é 10.');
      digita(n, '0');
      assert.eq(n.validate(), false);
      assert.eq(n.getError(), 'O valor mínimo é 1.');
      digita(n, '5');
      assert.eq(n.validate(), true);
      n.stepBy(2);
      assert.eq(n.getValue(), 7, 'stepBy soma passos');
      n.stepBy(100);
      assert.eq(n.getValue(), 10, 'respeita o máximo');
      digita(n, 'abc');
      assert.eq(n.validate(), false);
      assert.eq(n.getError(), 'Informe um número válido.');
      const d = t.create({ xtype: 'datefield', name: 'd', min: '2026-01-01', max: '2026-12-31' });
      d.setValue('2025-12-31');
      assert.eq(d.validate(), false);
      assert.contains(d.getError(), 'a partir de');
      d.setValue('2026-06-15');
      assert.eq(d.validate(), true);
      const dt = d.getDate();
      assert.deepEq([dt.getFullYear(), dt.getMonth(), dt.getDate()], [2026, 5, 15], 'getDate é data local (sem deslocar o dia)');
      d.setValue('2027-01-01');
      assert.eq(d.validate(), false);
      assert.contains(d.getError(), 'até');
    });

    test('checkbox, switch e radiogroup: valores, obrigatório e inputValue', t => {
      const c = t.create({ xtype: 'checkbox', name: 'ok', label: 'Aceito', required: true });
      assert.eq(c.getValue(), false);
      assert.eq(c.validate(), false);
      assert.eq(c.getError(), 'Marque esta opção para continuar.');
      c.toggle();
      assert.eq(c.getValue(), true);
      assert.eq(c.validate(), true);
      const c2 = t.create({ xtype: 'checkbox', name: 'k', label: 'K', inputValue: 'sim' });
      assert.eq(c2.getValue(), '');
      c2.setValue('sim');
      assert.eq(c2.getValue(), 'sim', 'inputValue devolve o texto quando marcado');
      const s = t.create({ xtype: 'switch', name: 'sw', value: true });
      assert.eq(s.getValue(), true);
      s.setValue(false);
      assert.eq(s.getValue(), false);
      const r = t.create({ xtype: 'radiogroup', name: 'r', options: [{ value: 'a', text: 'A' }, { value: 'b', text: 'B' }], required: true });
      assert.eq(r.validate(), false);
      assert.eq(r.getError(), 'Selecione uma opção.');
      r.setValue('b');
      assert.eq(r.getValue(), 'b');
      assert.eq(r.el.querySelectorAll('input[type=radio]').length, 2);
      assert.eq(r.validate(), true);
    });

    test('form.getValues: campos desabilitados ficam de fora; name __proto__/constructor ignorado; texto sai limpo', t => {
      const f = t.create({ xtype: 'form', buttons: false, fields: [{ type: 'text', name: 'nome' }, { type: 'text', name: 'oculto', disabled: true, value: 'x' },
        { type: 'text', name: '__proto__', value: '{"pwn":1}' }, { type: 'text', name: 'constructor', value: 'x' }, { type: 'checkbox', name: 'ok', value: true }, { type: 'number', name: 'n', value: 3 }] });
      digita(f.getField('nome'), '  Ana\u0000 ‮Souza ');
      const v = f.getValues();
      assert.deepEq(Object.keys(v).sort(), ['nome', 'ok', 'n'].sort(), 'só as chaves seguras e habilitadas');
      assert.eq(v.nome, 'Ana Souza', 'NUL e bidi removidos, espaços normalizados');
      assert.eq(v.ok, true);
      assert.eq(v.n, 3);
      assert.eq(Object.getPrototypeOf(v), Object.prototype);
      assert.eq({}.pwn, undefined, 'Object.prototype intacto');
      assert.eq(Object.prototype.hasOwnProperty.call(v, '__proto__'), false);
      assert.eq(f.getValues(true).oculto, 'x', 'getValues(true) inclui os desabilitados');
      assert.ok(t.logs.take('warn').some(m => m.includes('chave perigosa')), 'aviso sobre o name perigoso');
      f.setValues({ nome: 'Bia', __proto__: { x: 1 }, inexistente: 5 }, true);
      assert.eq(f.getValues().nome, 'Bia');
      assert.eq(f.isDirty(), false, 'setValues(…, true) vira o valor original');
      digita(f.getField('nome'), 'Outra');
      assert.eq(f.isDirty(), true);
      f.reset();
      assert.eq(f.getValues().nome, 'Bia', 'reset volta ao original');
      assert.eq(f.isDirty(), false);
    });

    test('form.submit sem action: valida, dispara beforesubmit/submit e devolve os valores; inválido não envia', async t => {
      const antes = t.spy(), sub = t.spy(), inv = t.spy();
      const f = t.create({ xtype: 'form', fields: [{ type: 'text', name: 'nome', required: true }, { type: 'email', name: 'mail' }], listeners: { beforesubmit: antes, submit: sub, invalid: inv } });
      assert.eq(await f.submit(), false, 'obrigatório vazio');
      assert.eq(antes.count, 0, 'beforesubmit só depois de validar');
      assert.eq(inv.count, 1);
      assert.deepEq(Object.keys(inv.lastArgs[1]), ['nome'], 'invalid recebe os erros por campo');
      assert.eq(document.activeElement, f.getField('nome').input, 'foca o primeiro inválido');
      digita(f.getField('nome'), 'Ana');
      digita(f.getField('mail'), 'ana@x.com');
      const r = await f.submit();
      assert.eq(r.ok, true);
      assert.eq(r.status, 0, 'sem action: tratamento local');
      assert.deepEq(r.data, { nome: 'Ana', mail: 'ana@x.com' });
      assert.eq(antes.count, 1);
      assert.eq(sub.count, 1);
      assert.deepEq(sub.lastArgs[1], { nome: 'Ana', mail: 'ana@x.com' });
    });

    test('form.submit com action: POST JSON dos valores, evento success, mensagem de sucesso, valores viram o original', async t => {
      const m = t.mockFetch({ '/api/f-ok': { body: { status: 200, retorno: 'salvo', id: 9 } } });
      const ok = t.spy();
      const f = t.create({ xtype: 'form', action: '/api/f-ok', successText: 'Salvo!', fields: [{ type: 'text', name: 'nome', value: 'Ana' }, { type: 'number', name: 'idade', value: 30 }], listeners: { success: ok } });
      digita(f.getField('nome'), 'Ana Maria');
      assert.eq(f.isDirty(), true);
      const r = await f.submit();
      assert.eq(r.ok, true);
      assert.eq(r.status, 200);
      assert.deepEq(r.data, { status: 200, retorno: 'salvo', id: 9 });
      assert.eq(m.calls.length, 1);
      assert.eq(m.calls[0].method, 'POST');
      assert.deepEq(m.calls[0].json, { nome: 'Ana Maria', idade: 30 }, 'corpo = valores do form (JSON em claro)');
      assert.eq(m.calls[0].init.credentials, 'same-origin');
      assert.eq(ok.count, 1);
      assert.eq(f.msgEl.hidden, false);
      assert.eq(f.msgEl.textContent, 'Salvo!');
      assert.eq(f.msgEl.getAttribute('role'), 'status');
      assert.eq(f.isDirty(), false, 'depois de salvar, os valores enviados são o novo original');
      const f2 = t.create({ xtype: 'form', action: '/api/f-ok', resetOnSuccess: true, fields: [{ type: 'text', name: 'nome', value: 'ini' }] });
      digita(f2.getField('nome'), 'mudei');
      await f2.submit();
      assert.eq(f2.getField('nome').getValue(), 'ini', 'resetOnSuccess limpa depois de enviar');
    });

    test('form.submit: cifra o corpo com encrypt, usa PUT/GET conforme method e cabeçalhos extras', async t => {
      const m = t.mockFetch({ '/api/f-enc': { body: { status: 200 } } });
      const f = t.create({ xtype: 'form', action: '/api/f-enc', encrypt: true, headers: { 'X-Teste': '1' }, fields: [{ type: 'text', name: 'a', value: 'segredo' }] });
      await f.submit();
      assert.deepEq(Object.keys(m.calls[0].json).sort(), ['k', 'kid', 's', 'v', 'x', 'z'], 'envelope v2 (chave por sessão)');
      assert.ok(!JSON.stringify(m.calls[0].json).includes('segredo'), 'o valor não vai em claro');
      assert.eq(m.calls[0].init.headers['X-Teste'], '1');
      const g = t.create({ xtype: 'form', action: '/api/f-enc', method: 'GET', fields: [{ type: 'text', name: 'q', value: 'a b&c' }, { type: 'multiselect', name: 'k', options: ['x', 'y'], value: ['x', 'y'] }] });
      await g.submit();
      assert.eq(m.calls[1].method, 'GET');
      assert.eq(m.calls[1].url.searchParams.get('q'), 'a b&c', 'valores vão na URL, codificados');
      assert.eq(m.calls[1].url.searchParams.get('k'), 'x,y');
      assert.eq(m.calls[1].body, undefined);
      const h = t.create({ xtype: 'form', action: '/api/f-enc', method: 'put', fields: [{ type: 'text', name: 'a', value: '1' }] });
      await h.submit();
      assert.eq(m.calls[2].method, 'PUT', 'método em qualquer caixa');
    });

    test('form.submit: 422 com {erros} marca cada campo, mostra a mensagem do servidor como texto e dispara failure', async t => {
      t.mockFetch({ '/api/f-422': { status: 422, body: { status: 422, mensagem: 'Corrija os dados <b>agora</b>', erros: { nome: 'Já existe', email: ['Inválido', 'Muito curto'], sumido: 'sem campo', outro: '<img src=x onerror=window.__r4tpwn=1>' } } } });
      const falha = t.spy();
      const f = t.create({ xtype: 'form', action: '/api/f-422', listeners: { failure: falha }, fields: [{ type: 'text', name: 'nome', value: 'x' }, { type: 'text', name: 'email', value: 'y' }, { type: 'text', name: 'outro', value: 'z' }] });
      const r = await f.submit();
      assert.eq(r.ok, false);
      assert.eq(r.status, 422);
      assert.eq(f.getField('nome').getError(), 'Já existe', 'erro no campo certo');
      assert.eq(f.getField('email').getError(), 'Inválido Muito curto', 'lista de mensagens junta');
      assert.eq(f.getField('nome').errEl.hidden, false);
      assert.eq(f.getField('outro').errEl.querySelector('img'), null, 'mensagem do servidor é texto');
      assert.contains(f.getField('outro').getError(), '<img src=x');
      assert.eq(window.__r4tpwn, undefined);
      assert.contains(f.msgEl, 'Corrija os dados <b>agora</b>', 'mensagem geral como texto');
      assert.contains(f.msgEl, 'sem campo', 'erro sem campo vai para a mensagem geral');
      assert.eq(f.msgEl.querySelector('b'), null);
      assert.eq(f.msgEl.getAttribute('role'), 'alert');
      assert.eq(falha.count, 1);
      assert.eq(f.isBusy(), false);
      assert.eq(document.activeElement, f.getField('nome').input, 'foca o primeiro campo com erro');
    });

    test('form.submit: erro 500, status ≥ 400 no corpo, falha de rede e resposta que não é JSON', async t => {
      t.mockFetch({ '/api/f-500': { status: 500, body: '<html>erro</html>', headers: { 'content-type': 'text/html' } }, '/api/f-st': { status: 200, body: { status: 403, retorno: 'Sem permissão' } },
        '/api/f-rede': new TypeError('Failed to fetch'), '/api/f-txt': { body: 'ok em texto', headers: { 'content-type': 'text/plain' } } });
      const mk = a => t.create({ xtype: 'form', action: a, fields: [{ type: 'text', name: 'a', value: '1' }] });
      const a = mk('/api/f-500');
      assert.eq((await a.submit()).ok, false);
      assert.eq(a.msgEl.textContent, 'Não foi possível enviar. Tente novamente.', 'HTML do servidor não aparece');
      const b = mk('/api/f-st');
      const rb = await b.submit();
      assert.eq(rb.ok, false, 'status ≥ 400 no corpo também é falha');
      assert.eq(b.msgEl.textContent, 'Sem permissão');
      const c = mk('/api/f-rede');
      const rc = await c.submit();
      assert.eq(rc.status, 0);
      assert.eq(c.msgEl.textContent, 'Sem conexão com o servidor.');
      assert.ok(t.logs.take('warn').some(m => m.includes('envio falhou')));
      const d = mk('/api/f-txt');
      assert.eq((await d.submit()).ok, true, '200 sem JSON conta como sucesso');
      const e = t.create({ xtype: 'form', action: 'javascript:alert(1)', fields: [{ type: 'text', name: 'a', value: '1' }] });
      const re = await e.submit();
      assert.eq(re.ok, false, 'action javascript: é recusado');
      assert.eq(re.status, 0);
    });

    test('beforesubmit retornando false cancela o envio (sem requisição e sem submit)', async t => {
      const m = t.mockFetch({ '/api/f-cancel': { body: {} } });
      const sub = t.spy();
      const f = t.create({ xtype: 'form', action: '/api/f-cancel', fields: [{ type: 'text', name: 'a', value: '1' }], listeners: { beforesubmit: () => false, submit: sub } });
      assert.eq(await f.submit(), false);
      assert.eq(m.calls.length, 0, 'nenhuma requisição');
      assert.eq(sub.count, 0);
      assert.eq(f.isBusy(), false);
    });

    test('estado de carregamento: botão Salvar desabilitado com spinner, aria-busy e segundo envio ignorado', async t => {
      const m = t.mockFetch({ '/api/f-lento': { body: { status: 200 }, delay: 200 } });
      const f = t.create({ xtype: 'form', action: '/api/f-lento', fields: [{ type: 'text', name: 'a', value: '1' }] });
      const salvar = f.el.querySelector('[data-r4-submit]');
      assert.ok(salvar, 'botão de envio automático');
      assert.eq(salvar.textContent, 'Salvar');
      const p = f.submit();
      assert.eq(f.isBusy(), true);
      assert.eq(f.el.getAttribute('aria-busy'), 'true');
      assert.eq(salvar.disabled, true, 'botão desabilitado');
      assert.ok(salvar.querySelector('.r4-spinner'), 'spinner no botão');
      assert.eq(await f.submit(), false, 'envio durante o envio é ignorado');
      await p;
      assert.eq(m.calls.length, 1, 'só uma requisição');
      assert.eq(f.isBusy(), false);
      assert.eq(salvar.disabled, false, 'botão volta');
      assert.eq(salvar.querySelector('.r4-spinner'), null);
      assert.eq(f.el.getAttribute('aria-busy'), null);
    });

    test('Enter num campo envia o form (submitOnEnter); submitOnEnter:false não envia; Limpar reinicia', async t => {
      const sub = t.spy();
      const f = t.create({ xtype: 'form', fields: [{ type: 'text', name: 'a', value: 'x' }], listeners: { submit: sub } });
      tecla(f.getField('a').input, 'Enter');
      await t.waitFor(() => sub.count === 1, 1000, 'submit por Enter');
      const g = t.create({ xtype: 'form', submitOnEnter: false, fields: [{ type: 'text', name: 'a', value: 'x' }], listeners: { submit: sub } });
      tecla(g.getField('a').input, 'Enter');
      await t.sleep(50);
      assert.eq(sub.count, 1, 'com submitOnEnter:false nada acontece');
      digita(f.getField('a'), 'mudou');
      [...f.el.querySelectorAll('button')].find(b => b.textContent === 'Limpar').click();
      assert.eq(f.getField('a').getValue(), 'x', 'Limpar volta ao valor original');
    });

    test('guard: texto com cara de SQL/HTML mostra aviso sem registrar o valor; "block" impede o envio', async t => {
      const f = t.create({ xtype: 'form', fields: [{ type: 'text', name: 'q' }, { type: 'textarea', name: 'blk', guard: 'block' }] });
      const q = f.getField('q'), susp = t.spy();
      f.on('suspicious', susp);
      const segredo = "zz' OR '1'='1 segredo-123";
      digita(q, segredo);
      assert.eq(q.guardEl.hidden, false, 'aviso visível no campo');
      assert.contains(q.guardEl, 'SQL');
      assert.eq(susp.count, 1);
      const avisos = t.logs.take('warn').filter(m => m.includes('campo "q"'));
      assert.eq(avisos.length, 1);
      assert.notContains(avisos[0], 'segredo-123', 'o valor nunca vai para o console');
      assert.eq((await f.submit()).ok, true, 'warn não bloqueia');
      digita(q, 'texto normal');
      assert.eq(q.guardEl.hidden, true, 'aviso some quando o texto é normal');
      const b = f.getField('blk');
      digita(b, '<script>alert(1)</script>');
      assert.eq(await f.submit(), false, 'block: não envia');
      assert.contains(b.getError(), 'Conteúdo não permitido');
      digita(b, 'texto comum');
      assert.eq((await f.submit()).ok, true);
    });

    test('limites padrão do texto: 1000 (campo) e 10000 (textarea); maxLength corta e getValue devolve limpo', t => {
      const f = t.create({ xtype: 'textfield', name: 'a' }), ta = t.create({ xtype: 'textarea', name: 'b' });
      assert.eq(f.input.getAttribute('maxlength'), '1000');
      assert.eq(ta.input.getAttribute('maxlength'), '10000');
      f.setValue('a'.repeat(5000));
      assert.eq(f.getValue().length, 1000, 'getValue corta no limite');
      assert.eq(f.validate(), false);
      assert.contains(f.getError(), '1000');
      const s = t.create({ xtype: 'textfield', name: 's' });
      digita(s, 'a​b\u0007c');
      assert.eq(s.getValue(), 'abc', 'zero-width e controles removidos');
      const raw = t.create({ xtype: 'textfield', name: 'r', sanitize: false });
      digita(raw, ' a‮b ');
      assert.eq(raw.getValue(), ' a‮b ', 'sanitize:false devolve cru');
      const pw = t.create({ xtype: 'passwordfield', name: 'pw' });
      digita(pw, ' a b\u0000');
      assert.eq(pw.getValue(), ' a b', 'senha só perde o NUL (espaços preservados)');
    });

    test('destroy do form destrói os campos e deixa o DOM limpo', t => {
      const f = t.create({ xtype: 'form', fields: [{ type: 'text', name: 'a' }, { type: 'select', name: 's', options: ['x'] }, { type: 'row', items: [{ type: 'text', name: 'b' }] }] });
      const ids = f.getFields().map(c => c.id);
      assert.eq(ids.length, 3);
      f.getField('s').open();
      f.destroy();
      assert.ok(ids.every(id => !R4.get(id)), 'campos saíram do registro');
      assert.eq(t.box.children.length, 0, 'nada sobrou no contêiner');
      assert.eq(document.querySelectorAll('.r4-select-pop').length, document.querySelectorAll('.r4t-page .r4-select-pop').length, 'nenhum popup dos campos do teste ficou na página');
    });
  });

  suite('select', () => {
    const OPT = [{ value: 'sp', text: 'São Paulo' }, { value: 'rj', text: 'Rio de Janeiro' }, { value: 'mg', text: 'Minas Gerais' }, { value: 'ba', text: 'Bahia' }];
    const itens = s => [...s.list.querySelectorAll('li[role=option]')].map(li => li.textContent);

    test('opções em vários formatos (value/text, valor/texto, string) e ARIA de combobox/listbox', t => {
      const s = t.create({ xtype: 'select', name: 's', label: 'Estado', options: ['A', { valor: 'b', texto: 'Bê' }, { value: 'c', text: 'Cê' }, { id: 'd', nome: 'Dê' }] });
      assert.eq(s.trigger.getAttribute('role'), 'combobox');
      assert.eq(s.trigger.getAttribute('aria-expanded'), 'false');
      assert.eq(s.list.getAttribute('role'), 'listbox');
      assert.deepEq(s.getOptions().map(o => o.value), ['A', 'b', 'c', 'd']);
      assert.deepEq(s.getOptions().map(o => o.text), ['A', 'Bê', 'Cê', 'Dê']);
      assert.eq(s.display.textContent, 'Selecione...', 'placeholder padrão em português');
      s.open();
      assert.eq(s.trigger.getAttribute('aria-expanded'), 'true');
      assert.eq(s.pop.hidden, false);
      assert.deepEq(itens(s), ['A', 'Bê', 'Cê', 'Dê']);
      assert.eq(s.list.querySelectorAll('[aria-selected]').length, 4);
      s.close();
      assert.eq(s.pop.hidden, true);
      assert.eq(s.trigger.getAttribute('aria-expanded'), 'false');
    });

    test('clique na opção escolhe, fecha o popup e dispara change; getSelected/getText; valor inicial; reset', t => {
      const ch = t.spy();
      const s = t.create({ xtype: 'select', name: 's', options: OPT, value: 'rj', listeners: { change: ch } });
      assert.eq(s.getValue(), 'rj');
      assert.eq(s.getText(), 'Rio de Janeiro');
      assert.eq(s.display.textContent, 'Rio de Janeiro');
      s.trigger.click();
      assert.eq(s.pop.hidden, false, 'clicar abre');
      assert.ok(s.list.querySelector('li.r4-selected').textContent === 'Rio de Janeiro', 'a atual vem marcada');
      s.list.querySelectorAll('li')[3].click();
      assert.eq(s.getValue(), 'ba');
      assert.eq(s.pop.hidden, true, 'escolher fecha');
      assert.eq(ch.count, 1);
      assert.deepEq(ch.lastArgs[1], 'ba');
      assert.eq(s.getSelected().value, 'ba');
      assert.eq(s.getSelected().text, 'Bahia');
      assert.eq(s.isDirty(), true);
      s.reset();
      assert.eq(s.getValue(), 'rj');
      s.setValue('mg');
      assert.eq(ch.count, 1, 'setValue não dispara change');
      assert.eq(s.getText(), 'Minas Gerais');
    });

    test('teclado: setas abrem e movem, Enter escolhe, Esc fecha sem escolher, digitar pula para a opção', t => {
      const s = t.create({ xtype: 'select', name: 's', options: OPT });
      tecla(s.trigger, 'ArrowDown');
      assert.eq(s.pop.hidden, false, 'seta abre');
      assert.eq(s.list.querySelector('.r4-active').textContent, 'São Paulo');
      tecla(s.trigger, 'ArrowDown');
      tecla(s.trigger, 'ArrowDown');
      assert.eq(s.list.querySelector('.r4-active').textContent, 'Minas Gerais');
      assert.eq(s.trigger.getAttribute('aria-activedescendant'), s.list.querySelector('.r4-active').id, 'aria-activedescendant acompanha');
      tecla(s.trigger, 'Enter');
      assert.eq(s.getValue(), 'mg');
      assert.eq(s.pop.hidden, true);
      tecla(s.trigger, 'Enter');
      tecla(s.trigger, 'End');
      assert.eq(s.list.querySelector('.r4-active').textContent, 'Bahia', 'End vai à última');
      tecla(s.trigger, 'Home');
      assert.eq(s.list.querySelector('.r4-active').textContent, 'São Paulo');
      tecla(s.trigger, 'Escape');
      assert.eq(s.pop.hidden, true, 'Esc fecha');
      assert.eq(s.getValue(), 'mg', 'sem mudar o valor');
      tecla(s.trigger, 'r');
      assert.eq(s.getValue(), 'rj', 'digitar "r" escolhe a opção que começa com r');
      tecla(s.trigger, ' ');
      assert.eq(s.pop.hidden, false, 'Espaço abre');
    });

    test('searchable: filtra ignorando acento e maiúsculas, mostra aviso se nada casa, e a busca limpa ao reabrir', t => {
      const s = t.create({ xtype: 'select', name: 's', options: OPT, searchable: true });
      s.open();
      assert.ok(s.search, 'campo de busca dentro do popup');
      s.search.value = 'SAO';
      s.search.dispatchEvent(new Event('input'));
      assert.deepEq(itens(s), ['São Paulo'], '"SAO" encontra "São Paulo"');
      s.search.value = 'zzz';
      s.search.dispatchEvent(new Event('input'));
      assert.deepEq(itens(s), []);
      assert.eq(s.note.hidden, false);
      assert.eq(s.note.textContent, 'Nenhuma opção encontrada.');
      s.search.value = 'a';
      s.search.dispatchEvent(new Event('input'));
      assert.deepEq(itens(s), ['São Paulo', 'Rio de Janeiro', 'Minas Gerais', 'Bahia']);
      s.search.value = 'ri';
      s.search.dispatchEvent(new Event('input'));
      tecla(s.search, 'Enter');
      assert.eq(s.getValue(), 'rj', 'Enter na busca escolhe a opção ativa');
      s.open();
      assert.eq(s.search.value, '', 'busca limpa ao reabrir');
      assert.eq(itens(s).length, 4);
    });

    test('multiple: chips, valor em array, Backspace remove o último, maxItems, clearable e valor "a,b" no atributo', t => {
      const ch = t.spy();
      const s = t.create({ xtype: 'select', name: 's', options: OPT, multiple: true, maxItems: 2, clearable: true, listeners: { change: ch } });
      assert.eq(s.list.getAttribute('aria-multiselectable'), 'true');
      s.open();
      s.list.querySelectorAll('li')[0].click();
      assert.eq(s.pop.hidden, false, 'multiple mantém o popup aberto');
      s.list.querySelectorAll('li')[2].click();
      assert.deepEq(s.getValue(), ['sp', 'mg']);
      assert.deepEq([...s.display.querySelectorAll('.r4-chip > span:first-child')].map(x => x.textContent), ['São Paulo', 'Minas Gerais']);
      s.list.querySelectorAll('li')[1].click();
      assert.deepEq(s.getValue(), ['sp', 'mg'], 'acima do maxItems não entra');
      assert.eq(s.getError(), 'Selecione no máximo 2 opções.');
      tecla(s.trigger, 'Backspace');
      assert.deepEq(s.getValue(), ['sp'], 'Backspace remove o último');
      s.display.querySelector('.r4-chip-x').click();
      assert.deepEq(s.getValue(), [], 'o × do chip remove');
      s.setValue(['sp', 'rj']);
      s.clearBtn.click();
      assert.deepEq(s.getValue(), [], 'botão limpar');
      assert.gt(ch.count, 3);
      t.html('<r4-select id="r4t-ms" name="m" multiple value="sp,ba" options=\'[{"value":"sp","text":"SP"},{"value":"ba","text":"BA"}]\'></r4-select>');
      assert.deepEq(R4.get('r4t-ms').getValue(), ['sp', 'ba'], 'value="a,b" no HTML');
    });

    test('select obrigatório, desabilitado e somente leitura', t => {
      const s = t.create({ xtype: 'select', name: 's', options: OPT, required: true });
      assert.eq(s.validate(), false);
      assert.eq(s.getError(), 'Selecione uma opção.');
      s.setValue('ba');
      assert.eq(s.validate(), true);
      const d = t.create({ xtype: 'select', name: 'd', options: OPT, disabled: true });
      d.trigger.click();
      assert.eq(d.pop.hidden, true, 'desabilitado não abre');
      assert.eq(d.trigger.getAttribute('aria-disabled'), 'true');
      assert.eq(d.trigger.tabIndex, -1);
      const r = t.create({ xtype: 'select', name: 'r', options: OPT, readOnly: true, value: 'sp' });
      r.open();
      assert.eq(r.pop.hidden, true, 'somente leitura não abre');
      tecla(r.trigger, 'r');
      assert.eq(r.getValue(), 'sp');
      const f = t.create({ xtype: 'form', buttons: false, fields: [{ type: 'select', name: 'a', options: OPT, value: 'sp' }, { type: 'select', name: 'b', options: OPT, value: 'sp', disabled: true }] });
      assert.deepEq(f.getValues(), { a: 'sp' }, 'desabilitado fora de getValues');
    });

    test('src: carrega opções por fetch (array, envelope e root), mostra erro e reload', async t => {
      let n = 0;
      const m = t.mockFetch({ '/api/s-lista': { body: [{ id: 1, nome: 'Um' }, { id: 2, nome: 'Dois' }] }, '/api/s-env': { body: { retorno: [{ valor: 'x', texto: 'Xis' }] } },
        '/api/s-root': { body: { planos: [{ value: 'p', text: 'Plano' }] } }, '/api/s-erro': () => (++n === 1 ? { status: 500, body: { retorno: 'x' } } : { body: ['ok'] }) });
      const a = t.create({ xtype: 'select', name: 'a', src: '/api/s-lista' });
      await t.waitFor(() => a.getOptions().length === 2, 2000, 'opções do src');
      assert.deepEq(a.getOptions().map(o => [o.value, o.text]), [['1', 'Um'], ['2', 'Dois']], 'chaves id/nome reconhecidas');
      const b = t.create({ xtype: 'select', name: 'b', src: '/api/s-env' });
      await t.waitFor(() => b.getOptions().length === 1, 2000, 'envelope');
      assert.eq(b.getOptions()[0].text, 'Xis');
      const c = t.create({ xtype: 'select', name: 'c', src: '/api/s-root', root: 'planos' });
      await t.waitFor(() => c.getOptions().length === 1, 2000, 'root');
      const e = t.create({ xtype: 'select', name: 'e', src: '/api/s-erro', listeners: { loaderror: t.spy() } });
      await t.waitFor(() => e._loadFailed, 2000, 'falha de carregamento');
      e.open();
      assert.eq(e.note.textContent, 'Falha ao carregar as opções.');
      await e.reload();
      await t.waitFor(() => e.getOptions().length === 1, 2000, 'recarregou');
      assert.eq(m.count('/api/s-erro'), 2);
    });

    test('opções com HTML hostil aparecem como texto; maxVisible limita e avisa; setOptions troca a lista', t => {
      const XSS = '<img src=x onerror=window.__r4tpwn=1>';
      const s = t.create({ xtype: 'select', name: 's', options: [{ value: '1', text: XSS }], maxVisible: 3 });
      s.open();
      assert.eq(s.list.querySelector('li').textContent, XSS);
      assert.eq(s.list.querySelector('img'), null);
      s.setValue('1');
      assert.eq(s.display.querySelector('img'), null, 'valor exibido também é texto');
      assert.eq(window.__r4tpwn, undefined);
      s.setOptions(Array.from({ length: 10 }, (_, i) => ({ value: 'v' + i, text: 'Opção ' + i })));
      assert.eq(itens(s).length, 3, 'só maxVisible opções desenhadas');
      assert.contains(s.note, 'Mostrando 3 de 10');
      assert.eq(s.getValue(), '1', 'valor continua mesmo fora da lista nova');
    });

    test('destroy do select fecha o popup e tira os ouvintes da página (clicar fora depois não faz nada)', t => {
      const s = t.create({ xtype: 'select', name: 's', options: OPT });
      s.open();
      const pop = s.pop;
      s.destroy();
      assert.notOk(document.body.contains(pop), 'popup removido');
      assert.eq(R4.get(s.id), undefined);
      document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      window.dispatchEvent(new Event('resize'));
      assert.eq(t.logs.take('error').length, 0, 'nenhum erro de ouvinte órfão');
    });
  });
})();
