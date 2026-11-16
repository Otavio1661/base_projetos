/**
 * ============================================
 * libr4 / net.js  —  R4 dev
 * ============================================
 * R4.crypto  AES-GCM 256 (chave via PBKDF2-SHA-256, 100 mil iterações, salt de 16 bytes e
 *            IV de 12 bytes aleatórios a cada mensagem) — mesmo formato {x,y,z} do backend
 *            (src/Utils/Decryption.php).
 * R4.http    requisições JSON com corpo criptografado.
 *
 * A chave vem de R4.config.cryptoKey ou, se vazia, de window.BASE_CRIPTOGRAFIA
 * (injetada pelo public/index.php em TODA página).
 *
 * O QUE ESTA CRIPTOGRAFIA É (e o que não é): a chave está no JavaScript que o navegador recebe,
 * então qualquer pessoa que abre a página (ou um atacante com XSS) a tem. Ela dificulta a leitura
 * passiva do tráfego/logs e ofusca o corpo das requisições, mas NÃO é segredo contra o usuário nem
 * substitui HTTPS, autenticação, autorização e validação no servidor. Ver docs/SEGURANCA.md.
 *
 * Política de URLs (R4.http.check, usada também por grid e form):
 *  - só http(s) e relativas; javascript:, data:, vbscript:, file: etc. são recusadas;
 *  - outra origem: aviso no console (uma vez por origem), a menos que esteja em
 *    R4.config.allowedOrigins; com R4.config.strictOrigins = true a requisição é recusada;
 *  - credentials: 'same-origin' (cookies só vão para a própria origem).
 * ============================================
 */
(function (R4) {
  'use strict';

  const enc = new TextEncoder(), dec = new TextDecoder();
  const ITER = 100000;
  const warn = m => console.warn('[R4] ' + m);

  // base64 seguro para buffers grandes (evita estourar a pilha com spread)
  const toB64 = buf => {
    const a = new Uint8Array(buf); let s = '';
    for (let i = 0; i < a.length; i += 0x8000) s += String.fromCharCode.apply(null, a.subarray(i, i + 0x8000));
    return btoa(s);
  };
  const fromB64 = b => Uint8Array.from(atob(String(b)), c => c.charCodeAt(0));

  /** Ambiente de desenvolvimento local (onde chave vazia é tolerada, com aviso). */
  const isLocal = () => {
    const h = String(location.hostname || '').toLowerCase();
    return location.protocol === 'file:' || h === 'localhost' || h.endsWith('.localhost') || h === '::1' || h === '[::1]' || /^127\./.test(h);
  };
  let warnedKey = false;
  /** Chave atual. Vazia: fora de localhost lança erro (falha segura); em localhost só avisa uma vez. */
  const secret = () => {
    const k = R4.config.cryptoKey || window.BASE_CRIPTOGRAFIA || '';
    if (k) return String(k);
    if (!isLocal()) throw new Error('R4.crypto: chave de criptografia vazia (BASE_CRIPTOGRAFIA). Defina uma chave real no .env — fora de localhost a lib se recusa a cifrar com chave vazia.');
    if (!warnedKey) { warnedKey = true; warn('R4.crypto: chave de criptografia vazia (BASE_CRIPTOGRAFIA) — tolerado só em localhost. Em produção defina uma chave real no .env.'); }
    return '';
  };

  async function deriveKey(salt, usage) {
    const material = await crypto.subtle.importKey('raw', enc.encode(secret()), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations: ITER, hash: 'SHA-256' },
      material, { name: 'AES-GCM', length: 256 }, false, [usage]);
  }

  R4.module('crypto', {
    /** Criptografa qualquer valor JSON → { x: dados, y: salt, z: iv } (base64). Salt e IV novos a cada chamada. */
    async encrypt(data) {
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const key = await deriveKey(salt, 'encrypt');
      const out = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(data)));
      return { x: toB64(out), y: toB64(salt), z: toB64(iv) };
    },
    /** Inverso de encrypt. Retorna null se o pacote for inválido/adulterado (a tag GCM é conferida). */
    async decrypt(pack) {
      try {
        if (!pack || typeof pack.x !== 'string' || typeof pack.y !== 'string' || typeof pack.z !== 'string') throw new Error('Pacote de criptografia incompleto');
        const iv = fromB64(pack.z);
        if (iv.length !== 12) throw new Error('IV inválido');
        const key = await deriveKey(fromB64(pack.y), 'decrypt');
        const out = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, fromB64(pack.x));
        return JSON.parse(dec.decode(out));
      } catch (e) {
        console.error('[R4.crypto] falha ao descriptografar:', e && e.message ? e.message : e);
        return null;
      }
    }
  }, {
    title: 'R4.crypto', group: 'Núcleo',
    description: 'Criptografia AES-GCM 256 com chave derivada por PBKDF2-SHA-256 (100 mil iterações, salt e IV aleatórios por mensagem). Formato compatível com o backend PHP. ATENÇÃO: a chave (BASE_CRIPTOGRAFIA) é entregue ao navegador em toda página, então isto protege contra leitura passiva do tráfego/logs e ofusca o corpo — NÃO é segredo contra quem abre a página e não substitui HTTPS nem validação no servidor. Com chave vazia, fora de localhost a lib se recusa a cifrar.',
    props: [
      { name: 'encrypt(data)', type: 'Promise<{x,y,z}>', desc: 'x = dados + tag GCM, y = salt (16 bytes), z = iv (12 bytes), todos em base64.' },
      { name: 'decrypt({x,y,z})', type: 'Promise<any|null>', desc: 'Devolve o valor original, ou null se inválido/adulterado.' },
      { name: 'R4.config.cryptoKey', type: 'string', desc: 'Substitui window.BASE_CRIPTOGRAFIA. Vazia fora de localhost → erro (falha segura).' }
    ]
  });

  /* ---------- política de URLs ---------- */
  const warnedOrigins = new Set();
  /**
   * Confere uma URL de requisição: devolve a URL (como veio) ou lança erro.
   * Recusa esquemas que não sejam http(s); outra origem → aviso (ou erro com strictOrigins).
   */
  function check(url) {
    const raw = String(url ?? '').trim(), t = raw.replace(/[\u0000- \u007f-\u009f]/g, '');
    if (!t) throw new Error('R4.http: URL vazia');
    if (/^[a-z][a-z0-9+.-]*:/i.test(t) && !/^https?:/i.test(t)) throw new Error('R4.http: esquema de URL recusado (' + t.slice(0, 20) + '…). Use http(s) ou caminho relativo.');
    let u;
    try { u = new URL(raw, location.href); } catch (e) { throw new Error('R4.http: URL inválida'); }
    if (u.origin !== location.origin) {
      const allow = [].concat(R4.config.allowedOrigins || []).map(String);
      if (!allow.includes(u.origin)) {
        if (R4.config.strictOrigins) throw new Error('R4.http: origem não permitida (' + u.origin + '). Adicione em R4.config.allowedOrigins.');
        if (!warnedOrigins.has(u.origin)) { warnedOrigins.add(u.origin); warn('requisição para outra origem: ' + u.origin + ' — confira se é esperado (R4.config.allowedOrigins silencia; R4.config.strictOrigins = true bloqueia).'); }
      }
    }
    return raw;
  }

  R4.module('http', {
    /**
     * R4.http.request(url, { method, data, encrypt, headers, credentials })
     * encrypt (padrão true) envia o corpo como {x,y,z}.
     */
    async request(url, { method = 'POST', data = null, encrypt = true, headers = {}, credentials = 'same-origin' } = {}) {
      url = check(url);
      const body = data == null || method === 'GET' ? undefined
        : JSON.stringify(encrypt ? await R4.crypto.encrypt(data) : data);
      const res = await fetch(url, { method, credentials, headers: { 'Content-Type': 'application/json', ...headers }, body });
      // lê o corpo como texto e tenta JSON (resposta vazia/HTML não derruba com SyntaxError obscuro)
      const text = await res.text();
      let parsed = null;
      try { parsed = text ? JSON.parse(text) : null; } catch (e) { /* não era JSON */ }
      if (!res.ok) {
        const err = new Error(((parsed && typeof parsed.retorno === 'string' && parsed.retorno) || (R4.t ? R4.t('r4.http.status', { status: res.status }) : 'Erro HTTP ' + res.status)).slice(0, 300));
        err.status = res.status; err.data = parsed;     // o corpo (ex.: {erros:{...}}) fica em err.data
        throw err;
      }
      if (parsed === null && text) throw new Error(R4.t ? R4.t('r4.grid.badJson') : 'A resposta não é JSON válido');
      return parsed;
    },
    get: (url, opts) => R4.http.request(url, { ...opts, method: 'GET' }),
    post: (url, data, opts) => R4.http.request(url, { ...opts, method: 'POST', data }),
    check
  }, {
    title: 'R4.http', group: 'Núcleo',
    description: 'Requisições JSON. Por padrão o corpo vai criptografado com R4.crypto; use encrypt:false para enviar em claro. Só http(s)/relativas (javascript:, data: etc. são recusadas); outra origem gera aviso no console (R4.config.strictOrigins = true bloqueia; R4.config.allowedOrigins = ["https://api.exemplo.com"] libera). Cookies só para a própria origem (credentials "same-origin").',
    props: [
      { name: 'request(url, {method, data, encrypt, headers, credentials})', type: 'Promise<json>', desc: 'Chamada genérica. credentials padrão "same-origin".' },
      { name: 'get(url)', type: 'Promise<json>', desc: 'GET sem corpo.' },
      { name: 'post(url, data)', type: 'Promise<json>', desc: 'POST com corpo criptografado.' },
      { name: 'check(url)', type: 'string', desc: 'Aplica a política de URLs (usada por grid, form, select, stat...). Lança erro se recusada.' },
      { name: 'R4.config.strictOrigins / allowedOrigins', type: 'boolean / string[]', default: 'false / []', desc: 'Bloqueia requisições para outras origens / origens liberadas.' }
    ]
  });
  // o módulo expõe a API em R4.crypto / R4.http
  R4.crypto = R4.modules.crypto.api;
  R4.http = R4.modules.http.api;
})(window.R4);
