/* suíte net: R4.crypto (AES-GCM) e R4.http.request com fetch simulado (mockFetch) */
(() => {
  const { suite, test, assert } = R4Test;
  const comChave = (t, k = 'chave-de-teste-' + Math.random().toString(36).slice(2)) => {
    const antes = R4.config.cryptoKey;
    R4.config.cryptoKey = k;
    t.cleanup(() => { R4.config.cryptoKey = antes; });
    return k;
  };
  const unica = () => 'https://origem-' + Math.random().toString(36).slice(2, 10) + '.exemplo.test';

  suite('net', () => {
    test('crypto: encrypt → decrypt volta o valor original (objeto, array, texto, número, unicode)', async t => {
      comChave(t);
      const casos = [{ a: 1, b: [1, 2, { c: 'x' }], d: null }, [1, 'dois', true], 'texto simples', 42, 'ação — ✓ 日本語 😀', { vazio: {} }];
      for (const v of casos) {
        const pack = await R4.crypto.encrypt(v);
        assert.deepEq(await R4.crypto.decrypt(pack), v, 'ida e volta de ' + JSON.stringify(v).slice(0, 30));
      }
    });

    test('crypto: o pacote é {x,y,z} em base64, com salt de 16 e IV de 12 bytes novos a cada chamada', async t => {
      comChave(t);
      const a = await R4.crypto.encrypt({ n: 1 }), b = await R4.crypto.encrypt({ n: 1 });
      assert.deepEq(Object.keys(a).sort(), ['x', 'y', 'z']);
      assert.eq(atob(a.y).length, 16, 'salt de 16 bytes');
      assert.eq(atob(a.z).length, 12, 'IV de 12 bytes');
      assert.gt(atob(a.x).length, 16, 'dados + tag GCM');
      assert.notEq(a.y, b.y, 'salt diferente');
      assert.notEq(a.z, b.z, 'IV diferente');
      assert.notEq(a.x, b.x, 'mesmo texto claro, cifra diferente');
      assert.notContains(a.x, '"n"', 'o conteúdo não aparece em claro');
    });

    test('crypto: pacote adulterado, incompleto ou com chave errada devolve null (e registra console.error)', async t => {
      comChave(t, 'chave-A');
      const pack = await R4.crypto.encrypt({ segredo: 123 });
      const troca = s => (s[0] === 'A' ? 'B' : 'A') + s.slice(1);
      assert.eq(await R4.crypto.decrypt({ ...pack, x: troca(pack.x) }), null, 'dados adulterados (tag GCM)');
      assert.eq(await R4.crypto.decrypt({ ...pack, y: btoa('0123456789abcdef') }), null, 'salt trocado');
      assert.eq(await R4.crypto.decrypt({ ...pack, z: btoa('curto') }), null, 'IV de tamanho errado');
      assert.eq(await R4.crypto.decrypt({ x: pack.x, y: pack.y }), null, 'pacote incompleto');
      assert.eq(await R4.crypto.decrypt(null), null, 'null');
      assert.eq(await R4.crypto.decrypt('texto'), null, 'não é objeto');
      assert.eq(await R4.crypto.decrypt({ x: 1, y: 2, z: 3 }), null, 'tipos errados');
      assert.eq(await R4.crypto.decrypt({ x: '***', y: '***', z: '***' }), null, 'base64 inválido');
      R4.config.cryptoKey = 'chave-B';
      assert.eq(await R4.crypto.decrypt(pack), null, 'chave diferente não decifra');
      assert.eq(t.logs.take('error').length, 9, 'cada falha registra um console.error');
    });

    test('crypto: chave vazia fora de localhost é recusada (falha segura); com chave funciona', async t => {
      // location.hostname de um iframe about:blank é "" (≠ localhost): carrega core+net lá dentro
      const f = document.createElement('iframe');
      f.style.display = 'none';
      t.box.append(f);
      const W = f.contentWindow, D = f.contentDocument;
      ['TextEncoder', 'TextDecoder'].forEach(k => { if (!W[k]) W[k] = window[k]; });   // só ambientes sem suporte (jsdom)
      if (!W.crypto || !W.crypto.subtle) Object.defineProperty(W, 'crypto', { value: window.crypto, configurable: true });
      const carrega = src => new Promise((ok, no) => { const s = D.createElement('script'); s.src = location.origin + src; s.onload = ok; s.onerror = () => no(new Error('não carregou ' + src)); D.head.append(s); });
      await carrega('/libr4/core.js'); await carrega('/libr4/net.js');
      assert.ok(W.R4 && W.R4.crypto, 'lib carregada no iframe');
      assert.notEq(W.location.hostname, '127.0.0.1', 'o iframe não é localhost');
      assert.eq(W.R4.config.cryptoKey, null);
      await assert.rejects(W.R4.crypto.encrypt({ a: 1 }), /chave de criptografia vazia/, 'sem chave: recusa cifrar');
      W.R4.config.cryptoKey = 'chave-do-iframe';
      const p = await W.R4.crypto.encrypt({ a: 1 });
      assert.deepEq(await W.R4.crypto.decrypt(p), { a: 1 }, 'com chave: funciona');
      f.remove();
    });

    test('http.get: devolve o JSON, usa GET sem corpo, credentials same-origin e cabeçalho JSON', async t => {
      const m = t.mockFetch({ '/api/lista': { body: [{ id: 1 }, { id: 2 }] } });
      const r = await R4.http.get('/api/lista?x=1');
      assert.deepEq(r, [{ id: 1 }, { id: 2 }]);
      assert.eq(m.calls.length, 1);
      const c = m.calls[0];
      assert.eq(c.method, 'GET');
      assert.eq(c.body, undefined, 'GET não manda corpo');
      assert.eq(c.init.credentials, 'same-origin', 'cookies só para a própria origem');
      assert.eq(c.init.headers['Content-Type'], 'application/json');
      assert.eq(c.url.searchParams.get('x'), '1');
    });

    test('http.post: corpo cifrado por padrão ({x,y,z} que decifra para os dados); encrypt:false manda em claro', async t => {
      comChave(t);
      const m = t.mockFetch({ '/api/salvar': { body: { status: 200, retorno: 'ok' } } });
      const dados = { nome: 'Ana', itens: [1, 2] };
      assert.deepEq(await R4.http.post('/api/salvar', dados), { status: 200, retorno: 'ok' });
      const pack = m.calls[0].json;
      assert.deepEq(Object.keys(pack).sort(), ['x', 'y', 'z'], 'corpo cifrado');
      assert.deepEq(await R4.crypto.decrypt(pack), dados, 'o servidor decifraria para os dados originais');
      await R4.http.post('/api/salvar', dados, { encrypt: false, headers: { 'X-Teste': 'sim' } });
      assert.deepEq(m.calls[1].json, dados, 'em claro');
      assert.eq(m.calls[1].init.headers['X-Teste'], 'sim', 'cabeçalhos extras');
      assert.eq(m.calls[1].init.headers['Content-Type'], 'application/json', 'sem perder o Content-Type');
      assert.eq(m.calls[1].method, 'POST');
      await R4.http.request('/api/salvar', { method: 'PUT', data: { a: 1 }, encrypt: false });
      assert.eq(m.calls[2].method, 'PUT');
    });

    test('http: 422 com corpo — err.status e err.data.erros ficam disponíveis; mensagem vem de "retorno"', async t => {
      t.mockFetch({
        '/api/validar': { status: 422, body: { status: 422, retorno: 'Dados inválidos', erros: { nome: 'Obrigatório', email: 'Inválido' } } },
        '/api/sem-retorno': { status: 422, body: { erros: { a: 'x' } } }
      });
      const e = await assert.rejects(R4.http.post('/api/validar', { a: 1 }, { encrypt: false }), 'Dados inválidos');
      assert.eq(e.status, 422);
      assert.deepEq(e.data.erros, { nome: 'Obrigatório', email: 'Inválido' });
      const e2 = await assert.rejects(R4.http.get('/api/sem-retorno'));
      assert.eq(e2.status, 422);
      assert.eq(e2.message, R4.t('r4.http.status', { status: 422 }), 'sem "retorno": mensagem padrão no idioma atual');
      assert.eq(e2.data.erros.a, 'x');
    });

    test('http: 500 com HTML, 404 vazio e mensagem gigante não derrubam com erro obscuro', async t => {
      t.mockFetch({
        '/api/html': { status: 500, body: '<html><body>Erro interno</body></html>', headers: { 'content-type': 'text/html' } },
        '/api/vazio': { status: 404 },
        '/api/grande': { status: 400, body: { retorno: 'x'.repeat(1000) } }
      });
      const a = await assert.rejects(R4.http.get('/api/html'));
      assert.eq(a.status, 500);
      assert.eq(a.data, null, 'corpo não JSON: data nula');
      assert.notContains(a.message, '<html>', 'HTML do servidor não vira mensagem');
      const b = await assert.rejects(R4.http.get('/api/vazio'));
      assert.eq(b.status, 404);
      assert.eq(b.data, null);
      const c = await assert.rejects(R4.http.get('/api/grande'));
      assert.eq(c.message.length, 300, 'mensagem limitada a 300 caracteres');
    });

    test('http: resposta 200 que não é JSON é erro claro; corpo vazio vira null', async t => {
      t.mockFetch({ '/api/texto': { body: 'olá, isto não é JSON', headers: { 'content-type': 'text/plain' } }, '/api/nada': { status: 204 }, '/api/json-lixo': { body: '{"a":' } });
      await assert.rejects(R4.http.get('/api/texto'), R4.t('r4.grid.badJson'));
      await assert.rejects(R4.http.get('/api/json-lixo'), /JSON/);
      assert.eq(await R4.http.get('/api/nada'), null, '204/corpo vazio');
    });

    test('http: falha de rede (fetch rejeita) propaga o erro original', async t => {
      t.mockFetch({ '/api/cai': new TypeError('Failed to fetch') });
      const e = await assert.rejects(R4.http.get('/api/cai'), /Failed to fetch/);
      assert.ok(e instanceof TypeError);
    });

    test('http: javascript:, data:, vbscript:, file: e URL vazia são recusados sem chamar o fetch', async t => {
      const m = t.mockFetch({});
      const ruins = ['javascript:alert(1)', ' JaVa\tScRiPt:alert(1)', 'data:application/json,[1]', 'vbscript:x', 'file:///etc/passwd', 'blob:http://x/1'];
      for (const u of ruins) await assert.rejects(R4.http.get(u), /esquema de URL recusado/, u);
      await assert.rejects(R4.http.get('   '), /URL vazia/);
      await assert.rejects(R4.http.post('javascript:x', { a: 1 }, { encrypt: false }), /recusado/);
      assert.eq(m.calls.length, 0, 'nenhuma requisição foi feita');
      assert.throws(() => R4.http.check('javascript:1'), /recusado/);
      assert.eq(R4.http.check('/ok?x=1'), '/ok?x=1');
      assert.eq(R4.http.check('https://exemplo.com/a'), 'https://exemplo.com/a');
    });

    test('http: outra origem gera aviso uma vez por origem; allowedOrigins silencia; strictOrigins bloqueia', async t => {
      const m = t.mockFetch({ '/api/x': { body: { ok: 1 } } });
      const estrito = R4.config.strictOrigins, permitidas = R4.config.allowedOrigins;
      t.cleanup(() => { R4.config.strictOrigins = estrito; R4.config.allowedOrigins = permitidas; });
      const o1 = unica();
      await R4.http.get(o1 + '/api/x');
      const w1 = t.logs.take('warn');
      assert.eq(w1.length, 1, 'um aviso');
      assert.contains(w1[0], o1, 'cita a origem');
      assert.contains(w1[0], 'outra origem');
      await R4.http.get(o1 + '/api/x');
      assert.eq(t.logs.take('warn').length, 0, 'não repete para a mesma origem');
      assert.eq(m.calls.at(-1).init.credentials, 'same-origin', 'cookies não vão para outra origem');
      const o2 = unica();
      R4.config.allowedOrigins = [o2];
      await R4.http.get(o2 + '/api/x');
      assert.eq(t.logs.take('warn').length, 0, 'origem liberada não avisa');
      const o3 = unica(), n = m.calls.length;
      R4.config.strictOrigins = true;
      await assert.rejects(R4.http.get(o3 + '/api/x'), /origem não permitida/);
      assert.eq(m.calls.length, n, 'strictOrigins: nem chega a chamar o fetch');
      await R4.http.get('/api/x');
      assert.eq(m.calls.length, n + 1, 'mesma origem continua liberada');
    });
  });
})();
