/**
 * ============================================
 * libr4 / net.js  —  R4 dev
 * ============================================
 * R4.crypto  criptografia v2: NENHUM segredo no navegador.
 *            O servidor publica só a chave PÚBLICA P-256. De onde a lib a lê (a PRIMEIRA fonte presente vale;
 *            se estiver malformada a lib RECUSA — não cai para a próxima, para não mascarar adulteração):
 *              1. R4.config.serverKey               (configuração explícita)
 *              2. window.R4_SERVER_KEY              (compatibilidade: script inline antigo)
 *              3. <meta name="r4-server-key" content='{"v":2,"pub":"...","kid":"..."}'>  (sem script inline: CSP estrita)
 *              4. GET /r4/chave                     (R4.config.serverKeyUrl)
 *            A cada sessão de página a lib gera um par ECDH
 *            efêmero (WebCrypto, só em memória — nunca em storage), faz ECDH + HKDF-SHA256 (salt de
 *            16 bytes por sessão, info "R4v2 req") e cifra cada mensagem com AES-256-GCM e IV
 *            aleatório de 12 bytes. Envelope: {v:2, kid, k, s, z, x} (base64url).
 *            AAD = "R4v2|MÉTODO|/caminho": o pacote só vale para aquele endpoint e método.
 *            Texto claro = {t: epoch s, n: nonce, d: dados} (o servidor recusa t fora da janela).
 *            Resposta cifrada opcional ({v:2, z, x}, info "R4v2 res", AAD "R4v2|res|/caminho").
 *            Servidor: core/Security/Crypto.php.
 * R4.http    requisições JSON com corpo cifrado (padrão) e resposta cifrada opcional.
 *
 * LIMITES (docs/SEGURANCA.md, seção 5): sem HTTPS, um atacante ATIVO no caminho pode trocar a chave
 * pública entregue com a página e ler tudo; XSS na página lê os dados antes de cifrar; replay dentro
 * da janela só é eliminado com cache de nonces no servidor (APCu). HTTPS continua obrigatório.
 *
 * Política de URLs (R4.http.check, usada também por grid e form):
 *  - só http(s) e relativas; javascript:, data:, vbscript:, file: etc. são recusadas;
 *  - página em https → destino http:// (conteúdo misto) é recusado (exceto localhost);
 *  - outra origem: aviso no console (uma vez por origem), a menos que esteja em
 *    R4.config.allowedOrigins; com R4.config.strictOrigins = true a requisição é recusada;
 *  - credentials: 'same-origin' (cookies só vão para a própria origem).
 * ============================================
 */
(function (R4) {
  'use strict';

  // TextEncoder/Decoder criados só no uso: navegador sem eles não derruba o carregamento da lib (a criptografia é que recusa)
  let _enc = null, _dec = null;
  const enc = { encode: s => (_enc || (_enc = new TextEncoder())).encode(s) };
  const dec = { decode: b => (_dec || (_dec = new TextDecoder())).decode(b) };
  /** Texto do motivo de a criptografia não funcionar (R4.support, se carregado). */
  const motivoCripto = () => (R4.support && R4.support.motivoCripto && R4.support.motivoCripto()) || null;
  const subtle = () => {
    if (!window.crypto || !window.crypto.subtle) {
      if (R4.support && R4.support.avisar) R4.support.avisar();
      throw erro('criptografia indisponível: ' + (motivoCripto() || 'WebCrypto ausente (o navegador só libera crypto.subtle em HTTPS ou localhost).'));
    }
    if (typeof TextEncoder !== 'function' || typeof TextDecoder !== 'function') throw erro('TextEncoder/TextDecoder indisponíveis neste navegador (veja docs/NAVEGADORES.md).');
    return window.crypto.subtle;
  };
  const warn = m => console.warn('[R4] ' + m);
  const avisados = new Set();
  const avisarUmaVez = (chave, m) => { if (!avisados.has(chave)) { avisados.add(chave); warn(m); } };
  /** Erro de criptografia em português, sem detalhes internos. */
  function erro(msg) { const e = new Error('R4.crypto: ' + msg); e.r4crypto = true; return e; }

  /* ---------- base64url ---------- */
  const b64u = buf => {
    const a = buf instanceof Uint8Array ? buf : new Uint8Array(buf); let s = '';
    for (let i = 0; i < a.length; i += 0x8000) s += String.fromCharCode.apply(null, a.subarray(i, i + 0x8000));
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  };
  /** base64url estrito (sem "=", forma canônica) com tamanho opcional; lança erro se inválido. */
  const deb64u = (s, tam) => {
    if (typeof s !== 'string' || !s || s.length % 4 === 1 || !/^[A-Za-z0-9_-]+$/.test(s)) throw erro('pacote com base64url inválido.');
    const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - s.length % 4) % 4));
    const a = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
    if (b64u(a) !== s || (tam != null && a.length !== tam)) throw erro('pacote com tamanho/forma inválidos.');
    return a;
  };
  const hex = buf => Array.from(new Uint8Array(buf), b => b.toString(16).padStart(2, '0')).join('');

  /* ---------- transporte (HTTPS) ---------- */
  const semColchete = h => String(h || '').toLowerCase().replace(/^\[|\]$/g, '');
  /** localhost / loopback */
  const hostLocal = h => { h = semColchete(h); return h === 'localhost' || h.endsWith('.localhost') || h === '::1' || /^127\./.test(h); };
  /** localhost ou rede privada (onde HTTP é aceitável em desenvolvimento) */
  const hostPrivado = h => {
    h = semColchete(h);
    return hostLocal(h) || /^10\./.test(h) || /^192\.168\./.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h) || /^169\.254\./.test(h)
      || /^f[cd][0-9a-f]{2}:/.test(h) || /^fe80:/.test(h) || h.endsWith('.local') || h.endsWith('.internal') || h.endsWith('.test');
  };
  /**
   * Página em HTTP fora de localhost/rede privada: aviso (uma vez). Com R4.config.exigirHttps = true
   * (explícito) recusa: sem HTTPS um atacante ativo troca a chave pública e lê tudo.
   */
  function conferirTransporte(onde) {
    if (location.protocol !== 'http:' || hostPrivado(location.hostname)) return;
    if (R4.config.exigirHttps === true) throw new Error('R4.' + onde + ': a página está em HTTP e R4.config.exigirHttps = true. Sirva o site por HTTPS.');
    avisarUmaVez('http', 'a página está em HTTP fora de localhost/rede privada: sem HTTPS um atacante no caminho pode trocar a chave pública do servidor e ler os dados. Use HTTPS em produção (R4.config.exigirHttps = true recusa enviar).');
  }

  /* ---------- chave pública do servidor ---------- */
  let chaveP = null;     // Promise<{kid, chave: CryptoKey}>
  let sessaoP = null;    // Promise<{kid, k, s, req: CryptoKey, res: CryptoKey}>
  const recentes = new Map();   // z (IV do pedido) → {metodo, caminho, n}; usado por decrypt e pela resposta
  const MAX_RECENTES = 100;
  let relogio = 0;              // diferença (ms) entre o relógio do servidor e o daqui (aprendida do cabeçalho Date)

  /** Formato (barato, síncrono): {v:2, pub: 87 caracteres base64url (ponto P-256 de 65 bytes), kid: 8 hex}. Devolve uma CÓPIA só com esses 3 campos. */
  function normalizarChave(info, onde) {
    if (!info || typeof info !== 'object' || Array.isArray(info) || info.v !== 2 || typeof info.pub !== 'string' || typeof info.kid !== 'string'
      || !/^[A-Za-z0-9_-]{87}$/.test(info.pub) || !/^[0-9a-f]{8}$/.test(info.kid)) {
      throw erro('chave pública do servidor ausente ou inválida' + (onde ? ' (' + onde + ')' : '') + ' — esperado {v:2, pub, kid}.');
    }
    return { v: 2, pub: info.pub, kid: info.kid };
  }

  /** <meta name="r4-server-key" content="{...}">: só a PRIMEIRA (a do <head>); conteúdo limitado, JSON em try/catch. undefined se não existe (JSON null NÃO é "não existe": é meta inválida). */
  function chaveDaMeta() {
    let m = null;
    try { m = document.querySelector('meta[name="r4-server-key"]'); } catch (e) { m = null; }
    if (!m) return undefined;
    const txt = m.getAttribute('content');
    if (typeof txt !== 'string' || !txt.trim()) throw erro('<meta name="r4-server-key"> sem conteúdo.');
    if (txt.length > 512) throw erro('<meta name="r4-server-key"> grande demais para ser uma chave pública.');
    let o;
    try { o = JSON.parse(txt); } catch (e) { throw erro('o conteúdo de <meta name="r4-server-key"> não é JSON válido.'); }
    return o;
  }

  /** Primeira fonte presente (sem rede): config → global → meta. Devolve {info, fonte} ou null. Malformada → lança (não cai para a próxima). */
  function chaveEmbutida() {
    if (R4.config.serverKey) return { info: R4.config.serverKey, fonte: 'config' };
    if (window.R4_SERVER_KEY) return { info: window.R4_SERVER_KEY, fonte: 'global' };
    const m = chaveDaMeta();
    return m === undefined ? null : { info: m, fonte: 'meta' };
  }

  /**
   * O ponto (04 | x | y, 65 bytes) está na curva P-256 (y² = x³ − 3x + b mod p) e com x, y < p?
   * Chrome e Firefox recusam um ponto fora da curva em importKey; o WebKit (Safari) ACEITA e até deriva
   * o segredo (invalid-curve), por isso a conferência é feita aqui, igual em todos os navegadores.
   * Sem BigInt (navegador muito antigo) devolve true e fica só a validação do próprio navegador.
   */
  function pontoNaCurva(raw) {
    if (typeof BigInt !== 'function') return true;
    const n = a => BigInt('0x' + hex(a));
    const P = (1n << 256n) - (1n << 224n) + (1n << 192n) + (1n << 96n) - 1n;
    const B = 0x5ac635d8aa3a93e7b3ebbd55769886bc651d06b0cc53b0f63bce3c3e27d2604bn;
    const x = n(raw.subarray(1, 33)), y = n(raw.subarray(33, 65));
    if (x >= P || y >= P) return false;
    return (y * y) % P === (((x * x % P) * x) - 3n * x + B + 3n * P) % P;
  }

  async function importarChave(info, onde) {
    info = normalizarChave(info, onde);
    let raw;
    try { raw = deb64u(info.pub, 65); } catch (e) { throw erro('chave pública do servidor inválida.'); }
    if (raw[0] !== 4) throw erro('chave pública do servidor inválida.');
    if (hex(await subtle().digest('SHA-256', raw)).slice(0, 8) !== info.kid) throw erro('kid não confere com a chave pública do servidor.');
    if (!pontoNaCurva(raw)) throw erro('chave pública do servidor não é um ponto P-256 válido.');
    let chave;
    try { chave = await subtle().importKey('raw', raw, { name: 'ECDH', namedCurve: 'P-256' }, false, []); }
    catch (e) { throw erro('chave pública do servidor não é um ponto P-256 válido.'); }
    return { kid: info.kid, chave };
  }

  /**
   * Chave pública: R4.config.serverKey > window.R4_SERVER_KEY > <meta name="r4-server-key"> > GET R4.config.serverKeyUrl ('/r4/chave').
   * buscar = true (rotação de chave) pula as fontes embutidas e vai direto ao endpoint.
   */
  function obterChave(buscar) {
    if (!chaveP) {
      chaveP = (async () => {
        const emb = buscar ? null : chaveEmbutida();
        let info = emb && emb.info, fonte = emb ? emb.fonte : 'endpoint';
        if (!emb) {
          if (typeof fetch !== 'function') throw erro('este navegador não tem fetch para obter a chave pública do servidor (veja docs/NAVEGADORES.md).');
          const url = check(R4.config.serverKeyUrl || '/r4/chave');
          let r;
          try { r = await fetch(url, { method: 'GET', credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' } }); }
          catch (e) { throw erro('não foi possível obter a chave pública do servidor (rede).'); }
          if (!r.ok) throw erro('não foi possível obter a chave pública do servidor (HTTP ' + r.status + ').');
          try { info = JSON.parse(await r.text()); } catch (e) { throw erro('a chave pública do servidor não veio em JSON.'); }
        }
        const ch = await importarChave(info, fonte === 'meta' ? '<meta name="r4-server-key">' : fonte === 'global' ? 'window.R4_SERVER_KEY' : fonte === 'config' ? 'R4.config.serverKey' : 'GET /r4/chave');
        ch.fonte = fonte;
        return ch;
      })();
      chaveP.catch(() => { chaveP = null; });
    }
    return chaveP;
  }

  /** Sessão da página: par ECDH efêmero (só memória) + salt → chaves AES de pedido e de resposta. */
  function obterSessao() {
    if (!sessaoP) {
      sessaoP = (async () => {
        if (R4.config.cryptoKey || window.BASE_CRIPTOGRAFIA) avisarUmaVez('legado', 'R4.config.cryptoKey / window.BASE_CRIPTOGRAFIA foram removidos (a criptografia v2 não usa segredo no navegador) e são ignorados.');
        const S = subtle();   // falha primeiro (mensagem clara) se o navegador não tem criptografia
        const srv = await obterChave(false);
        const par = await S.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']);
        const seg = await S.deriveBits({ name: 'ECDH', public: srv.chave }, par.privateKey, 256);
        const hk = await S.importKey('raw', seg, 'HKDF', false, ['deriveKey']);
        const salt = window.crypto.getRandomValues(new Uint8Array(16));
        const derivar = info => S.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt, info: enc.encode(info) }, hk, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
        const pub = new Uint8Array(await S.exportKey('raw', par.publicKey));
        return { kid: srv.kid, k: b64u(pub), s: b64u(salt), req: await derivar('R4v2 req'), res: await derivar('R4v2 res') };
      })();
      sessaoP.catch(() => { sessaoP = null; });
    }
    return sessaoP;
  }
  const sessaoAtual = async () => { if (!sessaoP) return null; try { return await sessaoP; } catch (e) { return null; } };

  const aadPedido = (metodo, caminho) => enc.encode('R4v2|' + metodo + '|' + caminho);
  const aadResposta = caminho => enc.encode('R4v2|res|' + caminho);
  /** Caminho exatamente como o fetch vai mandar (pathname da URL resolvida). */
  const caminhoDe = c => {
    c = String(c);
    try { return new URL(c, location.href).pathname; }
    catch (e) {   // página sem base válida (ex.: about:blank): só aceita caminho absoluto
      if (c[0] === '/' && c[1] !== '/') return c.split(/[?#]/)[0];
      throw erro('caminho inválido para o AAD: ' + c.slice(0, 60));
    }
  };
  const lembrar = (z, info) => {
    recentes.set(z, info);
    if (recentes.size > MAX_RECENTES) recentes.delete(recentes.keys().next().value);
  };
  const nonceConhecido = n => { for (const r of recentes.values()) if (r.n === n) return r; return null; };
  const ehResposta = p => !!p && typeof p === 'object' && !Array.isArray(p) && p.v === 2 && typeof p.z === 'string' && typeof p.x === 'string' && Object.keys(p).length === 3;

  /** Decifra uma RESPOSTA do servidor; lança erro se inválida. Confere que responde a um pedido desta sessão. */
  async function abrirResposta(pacote, caminho, nonce) {
    const s = await sessaoAtual();
    if (!s) throw erro('não há sessão de criptografia nesta página (nada foi cifrado ainda).');
    if (!ehResposta(pacote)) throw erro('resposta cifrada em formato inválido.');
    const iv = deb64u(pacote.z, 12), x = deb64u(pacote.x);
    if (x.length < 17) throw erro('resposta cifrada curta demais.');
    const cands = caminho ? [caminhoDe(caminho)] : [...new Set([...recentes.values()].reverse().map(r => r.caminho))];
    let claro = null;
    for (const c of cands) {
      try { claro = await subtle().decrypt({ name: 'AES-GCM', iv, additionalData: aadResposta(c), tagLength: 128 }, s.res, x); break; }
      catch (e) { /* tenta o próximo caminho */ }
    }
    if (!claro) throw erro('resposta adulterada, de outra rota ou de outra sessão.');
    let o;
    try { o = JSON.parse(dec.decode(claro)); } catch (e) { throw erro('resposta cifrada com conteúdo inválido.'); }
    if (!o || typeof o.n !== 'string' || !('d' in o) || (nonce ? o.n !== nonce : !nonceConhecido(o.n))) throw erro('a resposta não corresponde ao pedido enviado.');
    return o.d;
  }

  R4.module('crypto', {
    /**
     * Cifra qualquer valor JSON para o SERVIDOR → {v:2, kid, k, s, z, x}.
     * {metodo, caminho} formam o AAD (o servidor só aceita no mesmo método + endpoint). R4.http preenche sozinho.
     */
    async encrypt(dados, opcoes = {}) {
      conferirTransporte('crypto');
      if (dados === undefined) throw erro('nada para cifrar (undefined).');
      let { metodo, caminho } = opcoes || {};
      if (!metodo || !caminho) avisarUmaVez('aad', 'R4.crypto.encrypt sem {metodo, caminho}: usando POST + caminho desta página como AAD. O servidor recusa o pacote se o destino for outro — prefira R4.http.request, que preenche isso sozinho.');
      metodo = String(metodo || 'POST').toUpperCase();
      caminho = caminhoDe(caminho || location.pathname);
      const s = await obterSessao();
      const n = b64u(window.crypto.getRandomValues(new Uint8Array(16)));
      const iv = window.crypto.getRandomValues(new Uint8Array(12));
      const claro = enc.encode(JSON.stringify({ t: Math.floor((Date.now() + relogio) / 1000), n, d: dados }));
      const x = await subtle().encrypt({ name: 'AES-GCM', iv, additionalData: aadPedido(metodo, caminho), tagLength: 128 }, s.req, claro);
      const env = { v: 2, kid: s.kid, k: s.k, s: s.s, z: b64u(iv), x: b64u(x) };
      lembrar(env.z, { metodo, caminho, n });
      return env;
    },
    /**
     * Decifra uma RESPOSTA cifrada do servidor ({v:2, z, x}) — ou um pedido cifrado por esta mesma
     * sessão ({v:2, kid, k, s, z, x}). Devolve os dados, ou null (com console.error) se inválido/adulterado.
     * opcoes: {caminho} (resposta: rota do pedido; padrão = rotas recentes), {metodo, caminho} (pedido).
     */
    async decrypt(pacote, opcoes = {}) {
      try {
        if (!pacote || typeof pacote !== 'object' || pacote.v !== 2 || typeof pacote.z !== 'string' || typeof pacote.x !== 'string') throw erro('pacote incompleto ou de versão desconhecida.');
        if (!('k' in pacote)) return await abrirResposta(pacote, opcoes && opcoes.caminho, opcoes && opcoes.nonce);
        const s = await sessaoAtual();
        if (!s || pacote.k !== s.k || pacote.s !== s.s || pacote.kid !== s.kid) throw erro('o pacote não pertence a esta sessão.');
        const iv = deb64u(pacote.z, 12), x = deb64u(pacote.x);
        const r = recentes.get(pacote.z) || {};
        const metodo = String((opcoes && opcoes.metodo) || r.metodo || 'POST').toUpperCase();
        const caminho = caminhoDe((opcoes && opcoes.caminho) || r.caminho || location.pathname);
        let claro;
        try { claro = await subtle().decrypt({ name: 'AES-GCM', iv, additionalData: aadPedido(metodo, caminho), tagLength: 128 }, s.req, x); }
        catch (e) { throw erro('pacote adulterado ou de outra rota/método.'); }
        return JSON.parse(dec.decode(claro)).d;
      } catch (e) {
        console.error('[R4.crypto] falha ao descriptografar:', e && e.message ? e.message : e);
        return null;
      }
    },
    /** Informações públicas da sessão atual: {kid, k} (null se nada foi cifrado ainda). */
    async sessao() { const s = await sessaoAtual(); return s ? { kid: s.kid, k: s.k } : null; },
    /** Descarta a sessão (novo par efêmero no próximo envio). buscarChave = true também busca a chave em /r4/chave. */
    novaSessao(buscarChave = false) {
      sessaoP = null; recentes.clear();
      if (buscarChave) { chaveP = null; return obterChave(true).then(() => true); }
      return Promise.resolve(true);
    },
    /** A chave pública em uso: {kid, fonte} (fonte: 'config' | 'global' | 'meta' | 'endpoint'). */
    async chaveServidor() { const c = await obterChave(false); return { kid: c.kid, fonte: c.fonte }; }
  }, {
    title: 'R4.crypto', group: 'Núcleo',
    description: 'Criptografia v2: nenhum segredo vai para o navegador. A página recebe só a chave PÚBLICA P-256 do servidor (<meta name="r4-server-key">, window.R4_SERVER_KEY ou GET /r4/chave — a primeira presente vale, e uma chave malformada é recusada, não substituída); a cada sessão de página a lib gera um par ECDH efêmero (só em memória), deriva com HKDF-SHA256 uma chave AES-256-GCM e cifra cada mensagem com IV novo. O AAD amarra o pacote ao método + caminho do endpoint, e o servidor recusa pacotes fora da janela de tempo (5 min). Limites: não substitui HTTPS (sem TLS um atacante ativo troca a chave pública), não protege contra XSS e replay dentro da janela só some com cache de nonces no servidor.',
    props: [
      { name: 'encrypt(dados, {metodo, caminho})', type: 'Promise<{v,kid,k,s,z,x}>', desc: 'Cifra para o servidor. metodo + caminho formam o AAD (R4.http preenche sozinho). Sem eles: POST + caminho da página, com aviso.' },
      { name: 'decrypt(pacote, {caminho})', type: 'Promise<any|null>', desc: 'Decifra uma resposta cifrada da sessão ({v,z,x}) ou um pedido desta sessão. null se inválido/adulterado/de outra rota.' },
      { name: 'sessao()', type: 'Promise<{kid,k}|null>', desc: 'Dados públicos da sessão atual.' },
      { name: 'novaSessao(buscarChave)', type: 'Promise', desc: 'Descarta o par efêmero; buscarChave = true relê a chave em /r4/chave (rotação).' },
      { name: 'chaveServidor()', type: 'Promise<{kid, fonte}>', desc: 'A chave pública em uso e de onde veio: config, global (window.R4_SERVER_KEY), meta (<meta name="r4-server-key">) ou endpoint (GET /r4/chave).' },
      { name: 'R4.config.serverKey / serverKeyUrl', type: 'object / string', default: 'meta r4-server-key / window.R4_SERVER_KEY / "/r4/chave"', desc: 'De onde vem a chave pública {v:2, pub, kid}. Ordem: serverKey, window.R4_SERVER_KEY, <meta name="r4-server-key" content="{&quot;v&quot;:2,...}"> (permite CSP sem script inline), GET serverKeyUrl.' },
      { name: 'R4.config.exigirHttps', type: 'boolean', default: 'true em página https', desc: 'true numa página http (fora de localhost/rede privada) → recusa cifrar/enviar. Sem definir: só aviso no console.' }
    ]
  });

  /* ---------- política de URLs ---------- */
  const warnedOrigins = new Set();
  /**
   * Confere uma URL de requisição: devolve a URL (como veio) ou lança erro.
   * Recusa esquemas que não sejam http(s) e conteúdo misto (página https → http://);
   * outra origem → aviso (ou erro com strictOrigins).
   */
  function check(url) {
    const raw = String(url ?? '').trim(), t = raw.replace(/[\u0000- \u007f-\u009f]/g, '');
    if (!t) throw new Error('R4.http: URL vazia');
    if (/^[a-z][a-z0-9+.-]*:/i.test(t) && !/^https?:/i.test(t)) throw new Error('R4.http: esquema de URL recusado (' + t.slice(0, 20) + '…). Use http(s) ou caminho relativo.');
    let u;
    try { u = new URL(raw, location.href); } catch (e) { throw new Error('R4.http: URL inválida'); }
    if (location.protocol === 'https:' && u.protocol === 'http:' && !hostLocal(u.hostname)) {
      throw new Error('R4.http: conteúdo misto recusado — a página está em HTTPS e o destino é http:// (' + u.origin + '). Use https://.');
    }
    if (u.origin !== location.origin) {
      const allow = [].concat(R4.config.allowedOrigins || []).map(String);
      if (!allow.includes(u.origin)) {
        if (R4.config.strictOrigins) throw new Error('R4.http: origem não permitida (' + u.origin + '). Adicione em R4.config.allowedOrigins.');
        if (!warnedOrigins.has(u.origin)) { warnedOrigins.add(u.origin); warn('requisição para outra origem: ' + u.origin + ' — confira se é esperado (R4.config.allowedOrigins silencia; R4.config.strictOrigins = true bloqueia).'); }
      }
    }
    return raw;
  }

  /** Aprende a diferença de relógio pelo cabeçalho Date (só se for grande: evita pacote "expirado" com relógio errado). */
  function aprenderRelogio(res) {
    try {
      const d = res && res.headers && typeof res.headers.get === 'function' ? Date.parse(res.headers.get('date') || '') : NaN;
      if (Number.isFinite(d)) { const dif = d - Date.now(); relogio = Math.abs(dif) > 30000 ? dif : 0; }
    } catch (e) { /* sem Date: mantém */ }
  }

  R4.module('http', {
    /**
     * R4.http.request(url, { method, data, encrypt, headers, credentials, cifrarResposta })
     * encrypt (padrão true) envia o corpo no envelope v2 (AAD = método + caminho da URL).
     * cifrarResposta (padrão false) pede a resposta cifrada (X-R4-Res: 1) e a decifra; se o servidor
     * responder em claro, a promessa é rejeitada (falha fechada).
     */
    async request(url, { method = 'POST', data = null, encrypt = true, headers = {}, credentials = 'same-origin', cifrarResposta = false } = {}) {
      url = check(url);
      if (typeof fetch !== 'function') throw new Error('R4.http: este navegador não tem fetch (veja docs/NAVEGADORES.md).');
      method = String(method || 'GET').toUpperCase();
      const alvo = new URL(url, location.href);
      const comCorpo = data != null && method !== 'GET' && method !== 'HEAD';
      if (cifrarResposta && !(comCorpo && encrypt)) throw new Error('R4.http: cifrarResposta exige corpo cifrado (POST/PUT/PATCH/DELETE com data e encrypt: true).');
      if (comCorpo && encrypt) conferirTransporte('http');

      const enviar = async () => {
        let body, n = null;
        if (comCorpo) {
          if (encrypt) {
            const env = await R4.crypto.encrypt(data, { metodo: method, caminho: alvo.pathname });
            n = recentes.get(env.z).n;
            body = JSON.stringify(env);
          } else body = JSON.stringify(data);
        }
        const h = { 'Content-Type': 'application/json', ...headers };
        if (cifrarResposta) h['X-R4-Res'] = '1';
        const res = await fetch(url, { method, credentials, headers: h, body });
        aprenderRelogio(res);
        // lê o corpo como texto e tenta JSON (resposta vazia/HTML não derruba com SyntaxError obscuro)
        const text = await res.text();
        let parsed = null;
        try { parsed = text ? JSON.parse(text) : null; } catch (e) { /* não era JSON */ }
        return { res, text, parsed, n };
      };

      let r = await enviar();
      // chave do servidor trocada (rotação) ou relógio fora da janela: tenta de novo UMA vez
      const cod = r.parsed && r.res.status === 400 && typeof r.parsed === 'object' ? r.parsed.codigo : null;
      if (comCorpo && encrypt && (cod === 'R4_CHAVE' || cod === 'R4_TEMPO')) {
        if (cod === 'R4_CHAVE') await R4.crypto.novaSessao(true);
        r = await enviar();
      }
      let { res, text, parsed } = r;
      if (cifrarResposta && ehResposta(parsed)) {
        try { parsed = await abrirResposta(parsed, alvo.pathname, r.n); }
        catch (e) { const er = new Error('R4.http: resposta cifrada inválida (' + e.message.replace(/^R4\.crypto: /, '') + ')'); er.status = res.status; throw er; }
      } else if (cifrarResposta && res.ok) {
        const er = new Error('R4.http: o servidor não cifrou a resposta (cifrarResposta: true) — nada foi aceito.');
        er.status = res.status; throw er;
      }
      if (!res.ok) {
        const err = new Error(((parsed && typeof parsed.retorno === 'string' && parsed.retorno) || (R4.t ? R4.t('r4.http.status', { status: res.status }) : 'Erro HTTP ' + res.status)).slice(0, 300));
        err.status = res.status; err.data = parsed;     // o corpo (ex.: {erros:{...}}) fica em err.data
        throw err;
      }
      if (parsed === null && text && !cifrarResposta) throw new Error(R4.t ? R4.t('r4.grid.badJson') : 'A resposta não é JSON válido');
      return parsed;
    },
    get: (url, opts) => R4.http.request(url, { ...opts, method: 'GET' }),
    post: (url, data, opts) => R4.http.request(url, { ...opts, method: 'POST', data }),
    check
  }, {
    title: 'R4.http', group: 'Núcleo',
    description: 'Requisições JSON. Por padrão o corpo vai cifrado (criptografia v2, AAD = método + caminho); encrypt:false envia em claro. cifrarResposta:true pede a resposta cifrada e recusa resposta em claro. Só http(s)/relativas (javascript:, data: etc. são recusadas); página https não envia para http:// (conteúdo misto); outra origem gera aviso no console (R4.config.strictOrigins = true bloqueia; R4.config.allowedOrigins = ["https://api.exemplo.com"] libera). Cookies só para a própria origem (credentials "same-origin").',
    props: [
      { name: 'request(url, {method, data, encrypt, headers, credentials, cifrarResposta})', type: 'Promise<json>', desc: 'Chamada genérica. credentials padrão "same-origin". Se o servidor disser que a chave mudou (R4_CHAVE) ou que o relógio está fora (R4_TEMPO), tenta de novo uma vez.' },
      { name: 'get(url)', type: 'Promise<json>', desc: 'GET sem corpo.' },
      { name: 'post(url, data, {cifrarResposta})', type: 'Promise<json>', desc: 'POST com corpo cifrado; cifrarResposta: true → resposta cifrada e decifrada aqui.' },
      { name: 'check(url)', type: 'string', desc: 'Aplica a política de URLs (usada por grid, form, select, stat...). Lança erro se recusada.' },
      { name: 'R4.config.strictOrigins / allowedOrigins', type: 'boolean / string[]', default: 'false / []', desc: 'Bloqueia requisições para outras origens / origens liberadas.' }
    ]
  });
  // o módulo expõe a API em R4.crypto / R4.http
  R4.crypto = R4.modules.crypto.api;
  R4.http = R4.modules.http.api;
})(window.R4);
