/* suíte support: R4.support (detecção de recursos), degradação elegante (sem IntersectionObserver, ResizeObserver, requestIdleCallback,
   structuredClone, crypto.subtle), leitura da chave pública do servidor por 4 caminhos (config, window.R4_SERVER_KEY, <meta name="r4-server-key">,
   GET /r4/chave) com chave malformada/maliciosa recusada, boot.js (anti-flash sem script inline) e varredura estática de CSP estrita
   (nenhum <script> inline nem on*= nas páginas). Recursos são removidos/simulados só durante o teste e restaurados no cleanup. */
(() => {
  const { suite, test, assert } = R4Test;

  /* ---------- ajudantes ---------- */
  /** Troca window[nome] por `valor` (undefined = "recurso ausente") até o fim do teste; restaura o descritor original (ou apaga). */
  const trocar = (t, nome, valor) => {
    const antigo = Object.getOwnPropertyDescriptor(window, nome);
    Object.defineProperty(window, nome, { value: valor, writable: true, configurable: true });
    t.cleanup(() => { if (antigo) Object.defineProperty(window, nome, antigo); else delete window[nome]; });
  };
  const b64u = buf => {
    const a = new Uint8Array(buf); let s = '';
    for (const x of a) s += String.fromCharCode(x);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  };
  const kidDe = async raw => [...new Uint8Array(await crypto.subtle.digest('SHA-256', raw))].slice(0, 4).map(b => b.toString(16).padStart(2, '0')).join('');
  const chaveReal = async () => (await fetch('/r4/chave')).json();
  /** par ECDH P-256 de um "atacante": chave pública válida, mas que NÃO é a do servidor */
  const chaveDeAtacante = async () => {
    const par = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
    const raw = await crypto.subtle.exportKey('raw', par.publicKey);
    return { pub: b64u(raw), kid: await kidDe(raw) };
  };

  /**
   * Um "mundo" novo: iframe about:blank com core + support + net (estado limpo de R4.crypto). `antes(W, D)` roda ANTES de carregar a lib
   * (para remover recursos). Devolve { W, D, avisos (console.warn do iframe), buscas (chamadas ao fetch do iframe) }.
   */
  async function mundo(t, { antes, scripts = ['core', 'support', 'net'] } = {}) {
    const f = document.createElement('iframe');
    f.style.display = 'none';
    t.box.append(f);
    const W = f.contentWindow, D = f.contentDocument;
    ['TextEncoder', 'TextDecoder'].forEach(k => { if (!W[k]) W[k] = window[k]; });              // só ambientes sem suporte (jsdom)
    if (!W.crypto || !W.crypto.subtle) Object.defineProperty(W, 'crypto', { value: window.crypto, configurable: true });
    const buscas = [], avisos = [];
    const fetchReal = window.fetch.bind(window);
    W.fetch = (u, o) => { buscas.push(String(u)); return fetchReal(u, o); };
    W.console.warn = (...a) => { avisos.push(a.join(' ')); };
    if (antes) antes(W, D);
    for (const s of scripts) {
      await new Promise((ok, no) => {
        const el = D.createElement('script');
        el.src = location.origin + '/libr4/' + s + '.js';
        el.onload = ok; el.onerror = () => no(new Error('não carregou ' + s));
        D.head.append(el);
      });
    }
    return { W, D, avisos, buscas, f };
  }
  const meta = (D, conteudo, nome = 'r4-server-key') => { const m = D.createElement('meta'); m.name = nome; m.setAttribute('content', conteudo); D.head.append(m); return m; };

  suite('support', () => {
    /* ======== R4.support ======== */
    test('R4.support: módulo registrado em Núcleo, com a API documentada', t => {
      assert.ok(R4.support && R4.modules.support && R4.modules.support.meta.group === 'Núcleo', 'registrado');
      ['report', 'has', 'probe', 'avisar', 'motivoCripto'].forEach(f => assert.eq(typeof R4.support[f], 'function', f));
      assert.gt(R4.modules.support.meta.props.length, 4, 'documentado');
    });

    test('report(): formato {ok, faltando[], opcionais[], detalhes[]} coerente com o ambiente e serializável', t => {
      const r = R4.support.report();
      assert.eq(typeof r.ok, 'boolean');
      assert.ok(Array.isArray(r.faltando) && Array.isArray(r.opcionais) && Array.isArray(r.detalhes));
      assert.eq(r.ok, r.faltando.length === 0, 'ok = nada obrigatório falta');
      const nomes = r.detalhes.map(d => d.nome);
      ['crypto.subtle', 'ECDH P-256', 'HKDF', 'AES-GCM', 'TextEncoder', 'fetch', 'AbortController', 'IntersectionObserver', 'ResizeObserver', 'CSS color-mix',
        'structuredClone', 'DecompressionStream', 'localStorage', 'matchMedia', 'requestIdleCallback', 'adoptedStyleSheets'].forEach(n => assert.ok(nomes.includes(n), 'detecta ' + n));
      assert.eq(new Set(nomes).size, nomes.length, 'sem nomes repetidos');
      assert.deepEq(r.faltando, r.detalhes.filter(d => d.obrigatorio && !d.ok).map(d => d.nome), 'faltando = obrigatórios ausentes');
      assert.deepEq(r.opcionais, r.detalhes.filter(d => !d.obrigatorio && !d.ok).map(d => d.nome), 'opcionais = opcionais ausentes');
      r.detalhes.forEach(d => { if (!d.ok) assert.gt(d.efeito.length, 10, 'diz o que acontece sem ' + d.nome); });
      assert.ok(r.detalhes.filter(d => d.obrigatorio).length === 6, 'seis obrigatórios (crypto.subtle, ECDH, HKDF, AES-GCM, TextEncoder, fetch)');
      assert.deepEq(JSON.parse(JSON.stringify(r)), r, 'serializável (sem funções/ciclos)');
      // confere contra detecção independente
      const indep = { 'crypto.subtle': !!(window.crypto && window.crypto.subtle), fetch: typeof window.fetch === 'function', TextEncoder: typeof window.TextEncoder === 'function',
        IntersectionObserver: typeof window.IntersectionObserver === 'function', ResizeObserver: typeof window.ResizeObserver === 'function',
        structuredClone: typeof window.structuredClone === 'function', matchMedia: typeof window.matchMedia === 'function',
        requestIdleCallback: typeof window.requestIdleCallback === 'function', DecompressionStream: typeof window.DecompressionStream === 'function' };
      Object.keys(indep).forEach(n => assert.eq(R4.support.has(n), indep[n], 'has(' + n + ')'));
      assert.eq(R4.support.has('intersectionobserver'), indep.IntersectionObserver, 'nome sem diferenciar maiúsculas');
      assert.eq(R4.support.has('color-mix'), R4.support.has('CSS color-mix'), 'apelido color-mix');
      assert.eq(R4.support.has('recurso-que-nao-existe'), false, 'nome desconhecido → false (sem lançar)');
      assert.eq(R4.support.has(undefined), false);
      assert.eq(typeof r.contexto.protocolo, 'string');
    });

    test('report() nunca lança, mesmo com o ambiente hostil (getters que lançam, objetos nulos)', t => {
      const bomba = { get() { throw new Error('boom'); }, configurable: true };
      ['crypto', 'localStorage', 'isSecureContext'].forEach(n => {
        const antigo = Object.getOwnPropertyDescriptor(window, n);
        Object.defineProperty(window, n, bomba);
        t.cleanup(() => { if (antigo) Object.defineProperty(window, n, antigo); else delete window[n]; });
      });
      trocar(t, 'CSS', null); trocar(t, 'matchMedia', null); trocar(t, 'fetch', 'não é função');
      let r;
      assert.throws(() => { void window.crypto; }, /boom/, 'o ambiente de fato lança');
      r = R4.support.report();
      ['crypto.subtle', 'fetch'].forEach(n => assert.ok(r.faltando.includes(n), n + ' consta como faltando'));
      ['localStorage', 'matchMedia', 'CSS color-mix'].forEach(n => assert.ok(r.opcionais.includes(n), n + ' consta como opcional ausente'));
      assert.eq(r.ok, false);
      assert.eq(typeof R4.support.motivoCripto(), 'string', 'motivoCripto também não lança');
      assert.eq(R4.support.has('crypto.subtle'), false);
      assert.ok(R4.support.avisar().faltando.includes('fetch'), 'avisar() devolve o relatório e não lança');
      t.logs.take('warn');
    });

    test('probe(): testa de verdade ECDH P-256, HKDF e AES-GCM e nunca rejeita (nem sem crypto.subtle)', async t => {
      const r = await R4.support.probe();
      assert.eq(r.verificado, true, 'relatório marcado como verificado');
      if (window.crypto && window.crypto.subtle) assert.deepEq(['ECDH P-256', 'HKDF', 'AES-GCM'].filter(n => !R4.support.has(n)), [], 'algoritmos confirmados por operação real');
      const m = await mundo(t, { antes: W => Object.defineProperty(W, 'crypto', { value: { getRandomValues: a => a }, configurable: true }), scripts: ['core', 'support'] });
      const r2 = await m.W.R4.support.probe();
      assert.eq(r2.ok, false, 'sem subtle: não ok');
      assert.deepEq(['crypto.subtle', 'ECDH P-256', 'HKDF', 'AES-GCM'].filter(n => !r2.faltando.includes(n)), [], 'os quatro de criptografia constam como faltando');
    });

    test('motivoCripto(): distingue contexto inseguro de navegador sem WebCrypto; null quando tudo indica que funciona', async t => {
      if (window.crypto && window.crypto.subtle) assert.eq(R4.support.motivoCripto(), null, 'com crypto.subtle: sem motivo');
      trocar(t, 'crypto', { getRandomValues: a => a });
      trocar(t, 'isSecureContext', true);
      assert.match(R4.support.motivoCripto(), /não oferece a WebCrypto/, 'navegador sem WebCrypto');
      trocar(t, 'isSecureContext', false);
      assert.match(R4.support.motivoCripto(), /HTTPS ou em localhost/, 'contexto inseguro');
    });

    test('aviso ÚNICO no console quando falta algo obrigatório (e nenhum quando está tudo bem)', async t => {
      const sem = await mundo(t, { antes: W => Object.defineProperty(W, 'crypto', { value: { getRandomValues: a => a }, configurable: true }) });
      assert.eq(sem.avisos.length, 1, 'um aviso ao carregar');
      assert.match(sem.avisos[0], /não tem recursos necessários.*crypto\.subtle/, 'diz o que falta');
      await assert.rejects(sem.W.R4.crypto.encrypt({ a: 1 }, { metodo: 'POST', caminho: '/x' }), /criptografia indisponível/);
      sem.W.R4.support.avisar(); sem.W.R4.support.avisar();
      assert.eq(sem.avisos.length, 1, 'continua um só, mesmo depois de tentar cifrar e de pedir o aviso de novo');
      const mudo = await mundo(t, { antes: W => { Object.defineProperty(W, 'crypto', { value: { getRandomValues: a => a }, configurable: true }); } , scripts: ['core'] });
      mudo.W.R4.config.avisoSuporte = false;
      await new Promise((ok, no) => { const s = mudo.D.createElement('script'); s.src = location.origin + '/libr4/support.js'; s.onload = ok; s.onerror = no; mudo.D.head.append(s); });
      assert.eq(mudo.avisos.length, 0, 'R4.config.avisoSuporte = false silencia');
      const bom = await mundo(t);
      assert.eq(bom.avisos.length, 0, 'ambiente completo: nenhum aviso');
    });

    /* ======== degradação ======== */
    test('R4.crypto sem crypto.subtle: erro claro em pt-BR, nada quebra e o resto da lib (R4.http sem cifra, componentes) segue', async t => {
      trocar(t, 'crypto', { getRandomValues: a => a });
      t.cleanup(() => { R4.crypto.novaSessao(); });
      await R4.crypto.novaSessao();
      const e = await assert.rejects(R4.crypto.encrypt({ a: 1 }, { metodo: 'POST', caminho: '/x' }), /criptografia indisponível/, 'encrypt recusa');
      assert.ok(e.r4crypto === true, 'erro marcado como de criptografia');
      assert.match(e.message, /WebCrypto|crypto\.subtle/, 'diz o que falta');
      t.logs.take('warn');
      assert.eq(await R4.crypto.decrypt({ v: 2, z: 'AAAAAAAAAAAAAAAA', x: 'AAAA' }), null, 'decrypt devolve null (sem lançar)');
      assert.eq(t.logs.take('error').length, 1, 'e registra o motivo com console.error');
      assert.eq(await R4.crypto.sessao(), null, 'e não ficou sessão pela metade');
      const m = t.mockFetch({ '/api/a': { body: { ok: 1 } }, '/api/b': { body: { ok: 2 } } });
      await assert.rejects(R4.http.request('/api/a', { method: 'POST', data: { x: 1 } }), /criptografia indisponível/, 'R4.http cifrada recusa com a mesma mensagem');
      assert.eq(m.calls.length, 0, 'nada foi enviado em claro por engano');
      assert.deepEq(await R4.http.request('/api/b', { method: 'POST', data: { x: 1 }, encrypt: false }), { ok: 2 }, 'R4.http com encrypt:false continua funcionando');
      const p = t.create({ xtype: 'panel', title: 'continua montando', html: 'ok' });
      assert.contains(p.el, 'continua montando', 'componentes não dependem de crypto');
      t.logs.take('warn');
    });

    test('sem requestIdleCallback: R4.store cai para setTimeout e a varredura roda', async t => {
      trocar(t, 'requestIdleCallback', undefined);
      assert.eq(R4.support.has('requestIdleCallback'), false);
      const T0 = Date.now(), m = new Map();
      const area = { get length() { return m.size; }, key: i => [...m.keys()][i] ?? null, getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: k => { m.delete(k); } };
      m.set('r4:velho', JSON.stringify({ v: 1, d: 1, e: T0 - 5000, a: T0 - 9000, b: 10 }));
      m.set('r4:novo', JSON.stringify({ v: 1, d: 2, e: T0 + 3600000, a: T0, b: 10 }));
      const s = R4.store.create({ area });
      await t.waitFor(() => !m.has('r4:velho'), 2000, 'a varredura (via setTimeout)');
      assert.ok(m.has('r4:novo'), 'o que vale continua');
      assert.eq(s.get('novo'), 2);
      s.set('x', { a: 1 }, { now: true });
      assert.ok(m.has('r4:x'), 'gravação funciona');
    });

    test('sem structuredClone: a config padrão é copiada em profundidade (instâncias não compartilham arrays/objetos)', t => {
      trocar(t, 'structuredClone', undefined);
      assert.eq(R4.support.has('structuredClone'), false);
      R4.define('r4tSup', { config: { lista: [1, { n: 2 }], obj: { a: { b: 1 } }, fn: null }, build() { return R4.util.el('div', { class: 'r4t-sup' }); } }, { hidden: true });
      t.cleanup(() => { delete R4.registry.r4tSup; });
      const a = t.create({ xtype: 'r4tSup' }), b = t.create({ xtype: 'r4tSup' });
      assert.notEq(a.lista, b.lista, 'arrays distintos');
      assert.notEq(a.lista[1], b.lista[1], 'objetos dentro do array distintos');
      assert.notEq(a.obj.a, b.obj.a, 'objetos aninhados distintos');
      a.lista.push(3); a.obj.a.b = 9;
      assert.deepEq(b.lista, [1, { n: 2 }], 'mexer numa não muda a outra');
      assert.eq(b.obj.a.b, 1);
      const comFuncao = () => 1;
      R4.define('r4tSup2', { config: { cb: comFuncao, lista: [1] }, build() { return R4.util.el('div'); } }, { hidden: true });
      t.cleanup(() => { delete R4.registry.r4tSup2; });
      const c = t.create({ xtype: 'r4tSup2' });
      assert.eq(c.cb, comFuncao, 'funções ficam por referência');
      const hostil = JSON.parse('{"__proto__":{"pw":1},"ok":1}');
      R4.define('r4tSup3', { config: hostil, build() { return R4.util.el('div'); } }, { hidden: true });
      t.cleanup(() => { delete R4.registry.r4tSup3; });
      t.create({ xtype: 'r4tSup3' });
      assert.eq({}.pw, undefined, 'a cópia ignora __proto__');
    });

    test('sem ResizeObserver: grid e gráfico montam e funcionam (sem ajuste ao tamanho do contêiner)', async t => {
      trocar(t, 'ResizeObserver', undefined);
      assert.eq(R4.support.has('ResizeObserver'), false);
      const g = t.create({ xtype: 'grid', data: [{ a: 1, b: 'x' }, { a: 2, b: 'y' }], columns: ['a', 'b'] });
      assert.eq(g.getData().length, 2, 'grid monta');
      assert.ok(!g._ro, 'sem observador criado');
      g.destroy();
      const c = t.create({ xtype: 'chart', type: 'bar', data: [{ mes: 'jan', v: 3 }, { mes: 'fev', v: 5 }], x: 'mes', y: ['v'] });
      assert.ok(c.el.querySelector('svg'), 'gráfico desenha');
      await t.sleep(30);
      c.destroy();
    });

    test('sem IntersectionObserver (lib carregada nesse ambiente): r4-anim anima direto, sem esperar entrar na tela', async t => {
      const m = await mundo(t, { antes: W => { delete W.IntersectionObserver; }, scripts: ['core', 'support', 'store', 'net', 'components', 'declarative'] });
      assert.eq(m.W.R4.support.has('IntersectionObserver'), false, 'o iframe não tem IntersectionObserver');
      const alvo = m.D.createElement('div');
      alvo.setAttribute('r4-anim', 'fade');
      m.D.body.append(alvo);
      m.W.R4.scan(m.D.body);
      assert.ok(alvo.classList.contains('r4-in'), 'recebeu r4-in na hora');
      assert.ok(alvo.hasAttribute('r4-anim-ready'), 'marcado como pronto');
    });

    test('CSS: o libr4.css tem o bloco @supports not (color-mix) com cores sólidas para as misturas', async t => {
      const css = await (await fetch('/libr4/libr4.css')).text();
      assert.match(css, /@supports not \(color: color-mix\(in srgb, red, blue\)\)/, 'bloco de fallback presente');
      const bloco = css.slice(css.indexOf('@supports not (color: color-mix'));
      ['.r4-striped', '.r4-lmask', '.r4-bdg', '.r4-al', '.r4-strength', '.r4-grid-mask', '.r4-guard', '.r4-sk-bar'].forEach(s => assert.contains(bloco, s, 'fallback de ' + s));
      assert.eq((bloco.match(/color-mix[(]/g) || []).length, 1, 'o fallback só cita color-mix na condição do @supports');
    });

    /* ======== chave pública do servidor ======== */
    test('chave: lida de R4.config.serverKey, window.R4_SERVER_KEY, <meta name="r4-server-key"> ou GET /r4/chave — nessa ordem — e cifra de verdade', async t => {
      const K = await chaveReal();
      // 1) config
      let m = await mundo(t);
      m.W.R4.config.serverKey = K; m.W.R4_SERVER_KEY = { v: 2, pub: 'x', kid: 'y' }; meta(m.D, 'lixo');
      assert.deepEq(await m.W.R4.crypto.chaveServidor(), { kid: K.kid, fonte: 'config' }, 'config vence tudo');
      // 2) global
      m = await mundo(t);
      m.W.R4_SERVER_KEY = K; meta(m.D, 'isto não é JSON');
      assert.deepEq(await m.W.R4.crypto.chaveServidor(), { kid: K.kid, fonte: 'global' }, 'window.R4_SERVER_KEY vence a meta (a meta nem é lida)');
      assert.eq(m.buscas.length, 0, 'sem rede');
      // 3) meta
      m = await mundo(t);
      meta(m.D, JSON.stringify(K));
      assert.deepEq(await m.W.R4.crypto.chaveServidor(), { kid: K.kid, fonte: 'meta' }, '<meta name="r4-server-key">');
      assert.eq(m.buscas.length, 0, 'sem rede');
      const pacote = await m.W.R4.crypto.encrypt({ ola: 'meta' }, { metodo: 'POST', caminho: '/vitrine/api/echo' });
      assert.eq(pacote.kid, K.kid, 'o pacote usa o kid da chave da meta');
      assert.deepEq(await m.W.R4.crypto.decrypt(pacote), { ola: 'meta' }, 'ida e volta na própria sessão');
      // 4) endpoint
      m = await mundo(t);
      m.W.R4.config.serverKeyUrl = location.origin + '/r4/chave';   // o iframe é about:blank: URL absoluta
      assert.deepEq(await m.W.R4.crypto.chaveServidor(), { kid: K.kid, fonte: 'endpoint' }, 'GET /r4/chave');
      assert.eq(m.buscas.length, 1, 'uma busca');
      assert.contains(m.buscas[0], '/r4/chave');
      await m.W.R4.crypto.chaveServidor();
      assert.eq(m.buscas.length, 1, 'a chave fica em cache');
      // meta de outra página: só vale a PRIMEIRA <meta> (a do <head>); uma segunda, de lixo, é ignorada
      m = await mundo(t);
      meta(m.D, JSON.stringify(K)); meta(m.D, '{"v":2,"pub":"<script>","kid":"zzzzzzzz"}');
      assert.eq((await m.W.R4.crypto.chaveServidor()).fonte, 'meta', 'primeira meta vence');
    });

    test('chave: o que está na página (meta/global) combina com GET /r4/chave e não traz nenhum segredo', async t => {
      const K = await chaveReal();
      assert.deepEq(Object.keys(K).sort(), ['kid', 'pub', 'v']);
      const m = document.querySelector('meta[name="r4-server-key"]');
      const g = window.R4_SERVER_KEY;
      if (!m && !g) t.skip('esta página não embute a chave (usa só GET /r4/chave)');
      if (m) assert.deepEq(JSON.parse(m.getAttribute('content')), K, '<meta name="r4-server-key"> = /r4/chave');
      if (g) assert.deepEq(g, K, 'window.R4_SERVER_KEY = /r4/chave');
      assert.eq((await R4.crypto.chaveServidor()).kid, K.kid, 'a lib desta página usa a mesma chave');
      assert.ok(['config', 'global', 'meta', 'endpoint'].includes((await R4.crypto.chaveServidor()).fonte));
    });

    test('chave MALFORMADA ou MALICIOSA na meta é recusada (falha fechada: nunca cai para o endpoint) com mensagem clara', async t => {
      const K = await chaveReal(), A = await chaveDeAtacante();
      const m = await mundo(t);
      let atual = null;
      const poe = c => { if (atual) atual.remove(); atual = meta(m.D, c); };
      const recusa = async (conteudo, esperado, rotulo) => {
        poe(conteudo);
        const e = await assert.rejects(m.W.R4.crypto.chaveServidor(), esperado, rotulo);
        assert.ok(e.r4crypto === true, rotulo + ': erro de criptografia');
        await assert.rejects(m.W.R4.crypto.encrypt({ a: 1 }, { metodo: 'POST', caminho: '/x' }), esperado, rotulo + ' (encrypt também recusa)');
      };
      await recusa('', /sem conteúdo/, 'vazia');
      await recusa('isto { não é json', /não é JSON válido/, 'não é JSON');
      await recusa('null', /ausente ou inválida/, 'JSON null (não pode ser tratado como "sem meta")');
      await recusa('[]', /ausente ou inválida/, 'array');
      await recusa('"texto"', /ausente ou inválida/, 'texto');
      await recusa(JSON.stringify({ v: 1, pub: K.pub, kid: K.kid }), /ausente ou inválida/, 'versão errada');
      await recusa(JSON.stringify({ pub: K.pub, kid: K.kid }), /ausente ou inválida/, 'sem versão');
      await recusa(JSON.stringify({ v: 2, pub: K.pub }), /ausente ou inválida/, 'sem kid');
      await recusa(JSON.stringify({ v: 2, pub: K.pub, kid: 'ZZZZZZZZ' }), /ausente ou inválida/, 'kid fora do formato');
      await recusa(JSON.stringify({ v: 2, pub: K.pub, kid: K.kid + '0' }), /ausente ou inválida/, 'kid comprido');
      await recusa(JSON.stringify({ v: 2, pub: '<img src=x onerror=alert(1)>', kid: K.kid }), /ausente ou inválida/, 'pub com HTML');
      await recusa(JSON.stringify({ v: 2, pub: K.pub.slice(1), kid: K.kid }), /ausente ou inválida/, 'pub curta');
      await recusa(JSON.stringify({ v: 2, pub: K.pub + 'AA', kid: K.kid }), /ausente ou inválida/, 'pub comprida');
      await recusa(JSON.stringify({ v: 2, pub: { x: 1 }, kid: K.kid }), /ausente ou inválida/, 'pub objeto');
      await recusa(JSON.stringify({ v: '2', pub: K.pub, kid: K.kid }), /ausente ou inválida/, 'v como texto');
      await recusa(JSON.stringify({ v: 2, pub: K.pub, kid: K.kid, extra: 'x'.repeat(600) }), /grande demais/, 'conteúdo gigante');
      await recusa(JSON.stringify({ v: 2, pub: A.pub, kid: K.kid }), /kid não confere/, 'chave de OUTRO par com o kid do servidor (troca de chave)');
      // 65 bytes que começam com 0x04 mas não são um ponto da curva; o kid bate com o hash, então só a importação P-256 pega
      const lixo = new Uint8Array(65); lixo[0] = 4; lixo.fill(7, 1);
      await recusa(JSON.stringify({ v: 2, pub: b64u(lixo), kid: await kidDe(lixo) }), /não é um ponto P-256 válido/, 'ponto fora da curva');
      const semPrefixo = new Uint8Array(65); semPrefixo.fill(5);
      await recusa(JSON.stringify({ v: 2, pub: b64u(semPrefixo), kid: await kidDe(semPrefixo) }), /chave pública do servidor inválida/, 'sem o prefixo 0x04');
      assert.eq(m.buscas.length, 0, 'em NENHUM caso a lib trocou a chave inválida pelo que viria da rede');
      // a primeira meta é a autoridade: lixo na frente de uma boa também recusa (não "pula" para a segunda)
      atual.remove();
      meta(m.D, 'lixo'); meta(m.D, JSON.stringify(K));
      await assert.rejects(m.W.R4.crypto.chaveServidor(), /não é JSON válido/, 'lixo primeiro, boa depois: recusa');
      // o mesmo vale para window.R4_SERVER_KEY e R4.config.serverKey
      const g = await mundo(t);
      g.W.R4_SERVER_KEY = { v: 2, pub: A.pub, kid: K.kid };
      await assert.rejects(g.W.R4.crypto.chaveServidor(), /kid não confere/, 'global adulterada');
      g.W.R4.config.serverKey = { v: 2, pub: 'AAAA', kid: '00000000' };
      await assert.rejects(g.W.R4.crypto.chaveServidor(), /ausente ou inválida/, 'config adulterada');
      assert.eq(g.buscas.length, 0, 'também sem cair para a rede');
    });

    test('chave: chaves do JSON como "__proto__" não poluem nada, e só v/pub/kid são usados; chave válida com extras funciona', async t => {
      const K = await chaveReal();
      const m = await mundo(t);
      meta(m.D, '{"__proto__":{"polui":1},"v":2,"pub":"' + K.pub + '","kid":"' + K.kid + '","constructor":{"x":1}}');
      assert.deepEq(await m.W.R4.crypto.chaveServidor(), { kid: K.kid, fonte: 'meta' });
      assert.eq(m.W.Object.prototype.polui, undefined, 'Object.prototype intacto (iframe)');
      assert.eq({}.polui, undefined, 'Object.prototype intacto (página)');
    });

    test('rotação: novaSessao(true) ignora a meta e busca a chave em GET /r4/chave', async t => {
      const K = await chaveReal();
      const m = await mundo(t);
      m.W.R4.config.serverKeyUrl = location.origin + '/r4/chave';
      meta(m.D, JSON.stringify(K));
      assert.eq((await m.W.R4.crypto.chaveServidor()).fonte, 'meta');
      await m.W.R4.crypto.novaSessao(true);
      assert.eq(m.buscas.length, 1, 'foi à rede');
      assert.eq((await m.W.R4.crypto.chaveServidor()).fonte, 'endpoint', 'agora a chave em uso veio do endpoint');
    });

    /* ======== boot.js (anti-flash sem script inline) ======== */
    test('boot.js: aplica r4-dark só com tema salvo VÁLIDO (r4:theme revalidado ou chave antiga r4-theme); lixo é ignorado sem erro', async t => {
      const f = document.createElement('iframe');
      f.style.display = 'none';
      t.box.append(f);
      const W = f.contentWindow, D = f.contentDocument;
      const erros = [];
      W.addEventListener('error', e => erros.push(e.message));
      let guardado = {}, mql = false, estoura = false;
      Object.defineProperty(W, 'localStorage', { configurable: true, get() { if (estoura) throw new Error('bloqueado'); return { getItem: k => (k in guardado ? guardado[k] : null) }; } });
      W.matchMedia = () => ({ matches: mql });
      let n = 0;
      const roda = async (itens, { auto = false, bloqueado = false } = {}) => {
        guardado = itens; mql = auto; estoura = bloqueado;
        D.documentElement.classList.remove('r4-dark');
        await new Promise((ok, no) => { const s = D.createElement('script'); s.src = location.origin + '/showcase/boot.js?n=' + (++n); s.onload = ok; s.onerror = () => no(new Error('boot.js não carregou')); D.head.append(s); });
        return D.documentElement.classList.contains('r4-dark');
      };
      const viva = Date.now() + 86400000, venc = Date.now() - 1000;
      const env = (d, e = viva, v = 1) => JSON.stringify({ v, d, e });
      assert.eq(await roda({ 'r4:theme': env({ mode: 'dark' }) }), true, 'escuro salvo');
      assert.eq(await roda({ 'r4:theme': env({ mode: 'light' }) }), false, 'claro salvo');
      assert.eq(await roda({ 'r4:theme': env({ mode: 'auto' }) }, { auto: true }), true, 'auto + sistema escuro');
      assert.eq(await roda({ 'r4:theme': env({ mode: 'auto' }) }, { auto: false }), false, 'auto + sistema claro');
      assert.eq(await roda({ 'r4:theme': env({ mode: 'dark' }, venc) }), false, 'expirado');
      assert.eq(await roda({ 'r4:theme': env({ mode: 'dark' }, viva, 2) }), false, 'versão desconhecida');
      assert.eq(await roda({ 'r4:theme': env('dark') }), false, 'd não é objeto');
      assert.eq(await roda({ 'r4:theme': env({ mode: 'dark' }, 'amanhã') }), false, 'validade que não é número');
      assert.eq(await roda({ 'r4:theme': env({ mode: ['dark'] }) }), false, 'mode que não é texto');
      assert.eq(await roda({ 'r4-theme': JSON.stringify({ mode: 'dark' }) }), true, 'chave antiga r4-theme');
      assert.eq(await roda({ 'r4:theme': env({ mode: 'light' }), 'r4-theme': JSON.stringify({ mode: 'dark' }) }), false, 'r4:theme válido tem prioridade sobre a antiga');
      assert.eq(await roda({ 'r4:theme': 'não é json {' }), false, 'JSON inválido');
      assert.eq(await roda({ 'r4:theme': 'x'.repeat(9000) }), false, 'valor gigante');
      assert.eq(await roda({ 'r4:theme': '[1,2]', 'r4-theme': 'null' }), false, 'array/null');
      assert.eq(await roda({}), false, 'nada salvo');
      assert.eq(await roda({ 'r4:theme': env({ mode: 'dark' }) }, { bloqueado: true }), false, 'armazenamento bloqueado');
      assert.deepEq(erros, [], 'nenhum erro lançado em nenhum caso');
    });

    /* ======== CSP estrita: varredura estática das páginas ======== */
    test('CSP estrita: /vitrine, /vitrine/testes e / não têm <script> inline, on*=, javascript: nem style de script; boot.js é o 1º script do <head>', async t => {
      for (const url of ['/vitrine', '/vitrine/testes', '/']) {
        const r = await fetch(url);
        assert.eq(r.status, 200, url + ' responde');
        const html = await r.text();
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const inline = [...doc.querySelectorAll('script')].filter(s => !s.hasAttribute('src'));
        assert.eq(inline.length, 0, url + ': nenhum <script> sem src (' + inline.map(s => s.textContent.slice(0, 40)).join(' | ') + ')');
        const comOn = [...doc.querySelectorAll('*')].filter(n => [...n.attributes].some(a => /^on/i.test(a.name)));
        assert.eq(comOn.length, 0, url + ': nenhum atributo on*=');
        assert.eq(doc.querySelectorAll('[href^="javascript:" i],[src^="javascript:" i],[action^="javascript:" i],[formaction^="javascript:" i]').length, 0, url + ': nenhuma URL javascript:');
        assert.eq(doc.querySelectorAll('script[src^="data:" i],script[src^="http:" i],script[src^="https:" i],script[src^="//"]').length, 0, url + ': só scripts da própria origem');
        assert.ok(!/<script(?![^>]*\bsrc=)/i.test(html), url + ': nem no texto bruto');
        assert.ok(!/javascript:/i.test(html), url + ': sem "javascript:" no texto');
        const primeiro = doc.head.querySelector('script');
        if (url !== '/') {
          assert.ok(primeiro && /\/showcase\/boot\.js/.test(primeiro.getAttribute('src')), url + ': boot.js (anti-flash) é o primeiro script do <head>');
          assert.ok(!primeiro.hasAttribute('defer') && !primeiro.hasAttribute('async'), url + ': boot.js é síncrono');
        }
        const m = doc.querySelector('meta[name="r4-server-key"]');
        if (m) { const k = JSON.parse(m.getAttribute('content')); assert.deepEq(Object.keys(k).sort(), ['kid', 'pub', 'v'], url + ': meta da chave pública'); }
        if (url === '/vitrine') {
          const v = doc.querySelector('meta[name="r4-vitrine"]');
          assert.ok(v, 'meta r4-vitrine existe');
          const o = JSON.parse(v.getAttribute('content'));
          assert.eq(typeof o.api, 'boolean'); assert.eq(typeof o.publica, 'boolean');
        }
      }
    });
  });
})();
