/* suíte net: R4.crypto (criptografia v2: ECDH P-256 + AES-GCM, AAD) e R4.http.request com fetch simulado (mockFetch) */
(() => {
  const { suite, test, assert } = R4Test;
  const unica = () => 'https://origem-' + Math.random().toString(36).slice(2, 10) + '.exemplo.test';
  const b64uLen = s => atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - s.length % 4) % 4)).length;
  const ECO = '/vitrine/api/echo', ECO_CIF = '/vitrine/api/echo-cifrado';
  /** envia um corpo já pronto direto (sem R4.http) e devolve {status, json} */
  const cru = async (url, corpo, headers = {}) => {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: typeof corpo === 'string' ? corpo : JSON.stringify(corpo) });
    let json = null; try { json = JSON.parse(await r.text()); } catch (e) { /* não JSON */ }
    return { status: r.status, json };
  };

  suite('net', () => {
    test('crypto: a página tem só a chave PÚBLICA do servidor ({v:2, pub de 65 bytes, kid}) e nenhum segredo', async t => {
      const k = window.R4_SERVER_KEY;
      assert.ok(k && typeof k === 'object', 'window.R4_SERVER_KEY injetada pelo index.php');
      assert.deepEq(Object.keys(k).sort(), ['kid', 'pub', 'v']);
      assert.eq(k.v, 2);
      assert.eq(b64uLen(k.pub), 65, 'ponto P-256 não comprimido');
      assert.ok(/^[0-9a-f]{8}$/.test(k.kid), 'kid = 8 hex');
      assert.eq(window.BASE_CRIPTOGRAFIA, undefined, 'BASE_CRIPTOGRAFIA não existe mais na página');
      const r = await fetch('/r4/chave');
      assert.deepEq(await r.json(), k, 'GET /r4/chave devolve o mesmo JSON');
      assert.contains(r.headers.get('cache-control') || '', 'no-cache');
    });

    test('crypto: envelope {v,kid,k,s,z,x}; mesma sessão (k, s) e IV novo a cada mensagem; nada em claro', async t => {
      const a = await R4.crypto.encrypt({ n: 1 }, { metodo: 'POST', caminho: '/api/a' });
      const b = await R4.crypto.encrypt({ n: 1 }, { metodo: 'POST', caminho: '/api/a' });
      assert.deepEq(Object.keys(a).sort(), ['k', 'kid', 's', 'v', 'x', 'z']);
      assert.eq(a.v, 2);
      assert.eq(a.kid, window.R4_SERVER_KEY.kid, 'kid da chave do servidor');
      assert.eq(b64uLen(a.k), 65, 'chave pública efêmera do cliente (65 bytes)');
      assert.eq(b64uLen(a.s), 16, 'salt de 16 bytes');
      assert.eq(b64uLen(a.z), 12, 'IV de 12 bytes');
      assert.gt(b64uLen(a.x), 16, 'dados + tag GCM');
      assert.eq(a.k, b.k, 'mesma sessão de página: mesmo par efêmero');
      assert.eq(a.s, b.s, 'mesmo salt na sessão');
      assert.notEq(a.z, b.z, 'IV diferente a cada mensagem');
      assert.notEq(a.x, b.x, 'mesmo texto claro, cifra diferente');
      assert.ok([a.k, a.s, a.z, a.x].every(v => /^[A-Za-z0-9_-]+$/.test(v)), 'base64url sem "="');
      assert.notContains(JSON.stringify(a), '"n"', 'o conteúdo não aparece em claro');
    });

    test('crypto: o próprio pedido decifra na sessão (objeto, array, texto, número, unicode)', async t => {
      const casos = [{ a: 1, b: [1, 2, { c: 'x' }], d: null }, [1, 'dois', true], 'texto simples', 42, 'ação — ✓ 日本語 😀', { vazio: {} }];
      for (const v of casos) {
        const pack = await R4.crypto.encrypt(v, { metodo: 'PUT', caminho: '/api/x' });
        assert.deepEq(await R4.crypto.decrypt(pack), v, 'ida e volta de ' + JSON.stringify(v).slice(0, 30));
      }
    });

    test('crypto: AAD — pacote adulterado, de outra rota/método, incompleto ou de outra sessão devolve null (console.error)', async t => {
      const pack = await R4.crypto.encrypt({ segredo: 123 }, { metodo: 'POST', caminho: '/api/pagar' });
      const troca = s => (s[0] === 'A' ? 'B' : 'A') + s.slice(1);
      assert.eq(await R4.crypto.decrypt({ ...pack, x: troca(pack.x) }), null, 'dados adulterados (tag GCM)');
      assert.eq(await R4.crypto.decrypt(pack, { caminho: '/api/outra' }), null, 'outra rota (AAD)');
      assert.eq(await R4.crypto.decrypt(pack, { metodo: 'DELETE' }), null, 'outro método (AAD)');
      assert.eq(await R4.crypto.decrypt({ ...pack, z: 'curto' }), null, 'IV de tamanho errado');
      assert.eq(await R4.crypto.decrypt({ ...pack, k: troca(pack.k) }), null, 'chave de outra sessão');
      assert.eq(await R4.crypto.decrypt({ x: pack.x, y: 'a', z: pack.z }), null, 'formato antigo {x,y,z}');
      assert.eq(await R4.crypto.decrypt(null), null, 'null');
      assert.eq(await R4.crypto.decrypt('texto'), null, 'não é objeto');
      assert.eq(await R4.crypto.decrypt({ v: 2, z: '***', x: '***' }), null, 'base64url inválido');
      assert.eq(t.logs.take('error').length, 9, 'cada falha registra um console.error');
    });

    test('crypto: sem chave pública válida recusa cifrar (mensagem clara); com a chave do servidor funciona', async t => {
      // iframe about:blank com core + net: configura a chave à mão
      const f = document.createElement('iframe');
      f.style.display = 'none';
      t.box.append(f);
      const W = f.contentWindow, D = f.contentDocument;
      ['TextEncoder', 'TextDecoder'].forEach(k => { if (!W[k]) W[k] = window[k]; });   // só ambientes sem suporte (jsdom)
      if (!W.crypto || !W.crypto.subtle) Object.defineProperty(W, 'crypto', { value: window.crypto, configurable: true });
      const carrega = src => new Promise((ok, no) => { const s = D.createElement('script'); s.src = location.origin + src; s.onload = ok; s.onerror = () => no(new Error('não carregou ' + src)); D.head.append(s); });
      await carrega('/libr4/core.js'); await carrega('/libr4/net.js');
      assert.ok(W.R4 && W.R4.crypto, 'lib carregada no iframe');
      W.R4.config.serverKey = { v: 2, pub: 'AAAA', kid: '00000000' };
      await assert.rejects(W.R4.crypto.encrypt({ a: 1 }, { metodo: 'POST', caminho: '/x' }), /chave pública do servidor/, 'pub inválida');
      W.R4.config.serverKey = { ...window.R4_SERVER_KEY, kid: 'ffffffff' };
      await assert.rejects(W.R4.crypto.encrypt({ a: 1 }, { metodo: 'POST', caminho: '/x' }), /kid não confere/, 'kid que não é o da chave');
      W.R4.config.serverKey = { v: 1, pub: window.R4_SERVER_KEY.pub, kid: window.R4_SERVER_KEY.kid };
      await assert.rejects(W.R4.crypto.encrypt({ a: 1 }, { metodo: 'POST', caminho: '/x' }), /chave pública/, 'versão errada');
      W.R4.config.serverKey = window.R4_SERVER_KEY;
      const p = await W.R4.crypto.encrypt({ a: 1 }, { metodo: 'POST', caminho: '/x' });
      assert.deepEq(await W.R4.crypto.decrypt(p), { a: 1 }, 'com a chave do servidor: funciona');
      f.remove();
    });

    test('crypto: encrypt sem {metodo, caminho} avisa uma vez e usa POST + caminho da página', async t => {
      const pack = await R4.crypto.encrypt({ a: 1 });
      const w = t.logs.take('warn');
      assert.ok(w.length <= 1, 'no máximo um aviso (uma vez por página)');
      assert.deepEq(await R4.crypto.decrypt(pack, { metodo: 'POST', caminho: location.pathname }), { a: 1 });
    });

    test('servidor: R4.http → PHP → R4.http com pedido e resposta cifrados (ida e volta real)', async t => {
      const dados = { nome: 'Ana — ação ✓', itens: [1, 2, { a: null }] };
      const r = await R4.http.post(ECO_CIF, dados, { cifrarResposta: true });
      assert.eq(r.status, 200);
      assert.eq(r.retorno.cifrado, true, 'o servidor recebeu o envelope v2');
      assert.eq(r.retorno.respostaCifrada, true, 'e respondeu cifrado');
      assert.deepEq(r.retorno.recebido, dados);
      const r2 = await R4.http.post(ECO, { x: 1 });
      assert.eq(r2.retorno.cifrado, true, '/echo: corpo cifrado por padrão');
      const r3 = await R4.http.post(ECO, { x: 1 }, { encrypt: false });
      assert.eq(r3.retorno.cifrado, false, 'encrypt:false manda em claro');
    });

    test('servidor: pacote em outra rota, adulterado, formato antigo ou com kid errado → 400 JSON limpo', async t => {
      const pack = await R4.crypto.encrypt({ a: 1 }, { metodo: 'POST', caminho: ECO });
      const ok = await cru(ECO, pack);
      assert.eq(ok.status, 200, 'na rota certa passa');
      const outra = await cru('/vitrine/api/cadastro', pack);
      assert.eq(outra.status, 400, 'mesmo pacote em outra rota (AAD)');
      assert.contains(outra.json.retorno, 'inválido');
      const x = pack.x[0] === 'A' ? 'B' + pack.x.slice(1) : 'A' + pack.x.slice(1);
      assert.eq((await cru(ECO, { ...pack, x })).status, 400, 'adulterado');
      assert.eq((await cru(ECO, { x: 'YQ', y: 'Yg', z: 'Yw' })).status, 400, 'v1 {x,y,z} não é mais aceito');
      const kid = await cru(ECO, { ...pack, kid: '00000000' });
      assert.eq(kid.status, 400, 'kid desconhecido');
      assert.eq(kid.json.codigo, 'R4_CHAVE', 'código para o cliente se recuperar');
      assert.notContains(JSON.stringify([outra.json, kid.json]), '.php', 'sem caminho do servidor');
    });

    test('http: cifrarResposta recusa resposta em claro (falha fechada) e exige corpo cifrado', async t => {
      t.mockFetch({ '/api/claro': { body: { status: 200, retorno: 'em claro' } } });
      await assert.rejects(R4.http.post('/api/claro', { a: 1 }, { cifrarResposta: true }), /não cifrou a resposta/);
      await assert.rejects(R4.http.get('/api/claro', { cifrarResposta: true }), /cifrarResposta exige corpo cifrado/);
      await assert.rejects(R4.http.post('/api/claro', { a: 1 }, { cifrarResposta: true, encrypt: false }), /cifrarResposta exige/);
    });

    test('http: R4_CHAVE (chave do servidor mudou) → busca /r4/chave, nova sessão e tenta de novo UMA vez', async t => {
      let n = 0;
      const m = t.mockFetch({
        'POST /api/rot': () => (++n === 1 ? { status: 400, body: { status: 400, retorno: 'Pacote de criptografia inválido ou expirado.', codigo: 'R4_CHAVE' } } : { body: { status: 200, retorno: 'ok' } }),
        'GET /r4/chave': { body: window.R4_SERVER_KEY },
        'POST /api/sempre': { status: 400, body: { status: 400, retorno: 'x', codigo: 'R4_CHAVE' } }
      });
      const k1 = (await R4.crypto.sessao() || {}).k;
      assert.deepEq(await R4.http.post('/api/rot', { a: 1 }), { status: 200, retorno: 'ok' });
      assert.eq(m.calls.filter(c => c.path === '/api/rot').length, 2, 'duas tentativas');
      assert.eq(m.calls.filter(c => c.path === '/r4/chave').length, 1, 'chave buscada de novo');
      assert.notEq(m.calls[2].json.k, k1, 'nova sessão (novo par efêmero)');
      const e = await assert.rejects(R4.http.post('/api/sempre', { a: 1 }));
      assert.eq(e.status, 400);
      assert.eq(m.calls.filter(c => c.path === '/api/sempre').length, 2, 'só UMA nova tentativa');
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

    test('http.post: corpo cifrado por padrão (envelope v2 com AAD do método + caminho); encrypt:false manda em claro', async t => {
      const m = t.mockFetch({ '/api/salvar': { body: { status: 200, retorno: 'ok' } } });
      const dados = { nome: 'Ana', itens: [1, 2] };
      assert.deepEq(await R4.http.post('/api/salvar?id=3', dados), { status: 200, retorno: 'ok' });
      const pack = m.calls[0].json;
      assert.deepEq(Object.keys(pack).sort(), ['k', 'kid', 's', 'v', 'x', 'z'], 'corpo cifrado');
      assert.deepEq(await R4.crypto.decrypt(pack, { metodo: 'POST', caminho: '/api/salvar' }), dados, 'AAD = POST + /api/salvar (sem query)');
      assert.eq(await R4.crypto.decrypt(pack, { metodo: 'PUT', caminho: '/api/salvar' }), null, 'outro método não abre');
      t.logs.take('error');
      await R4.http.post('/api/salvar', dados, { encrypt: false, headers: { 'X-Teste': 'sim' } });
      assert.deepEq(m.calls[1].json, dados, 'em claro');
      assert.eq(m.calls[1].init.headers['X-Teste'], 'sim', 'cabeçalhos extras');
      assert.eq(m.calls[1].init.headers['Content-Type'], 'application/json', 'sem perder o Content-Type');
      assert.eq(m.calls[1].method, 'POST');
      await R4.http.request('/api/salvar', { method: 'PUT', data: { a: 1 } });
      assert.eq(m.calls[2].method, 'PUT');
      assert.deepEq(await R4.crypto.decrypt(m.calls[2].json, { metodo: 'PUT', caminho: '/api/salvar' }), { a: 1 }, 'PUT cifrado com AAD de PUT');
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
