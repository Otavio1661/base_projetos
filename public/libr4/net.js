/**
 * ============================================
 * libr4 / net.js  —  R4 dev
 * ============================================
 * R4.crypto  AES-GCM 256 (chave via PBKDF2) — mesmo formato {x,y,z} do backend
 *            (src/Utils/Decryption.php).
 * R4.http    requisições JSON com corpo criptografado.
 *
 * A chave vem de R4.config.cryptoKey ou, se vazia, de window.BASE_CRIPTOGRAFIA
 * (injetada pelo public/index.php).
 * ============================================
 */
(function (R4) {
  'use strict';

  const enc = new TextEncoder(), dec = new TextDecoder();
  const ITER = 100000;

  // base64 seguro para buffers grandes (evita estourar a pilha com spread)
  const toB64 = buf => {
    const a = new Uint8Array(buf); let s = '';
    for (let i = 0; i < a.length; i += 0x8000) s += String.fromCharCode.apply(null, a.subarray(i, i + 0x8000));
    return btoa(s);
  };
  const fromB64 = b => Uint8Array.from(atob(b), c => c.charCodeAt(0));
  const secret = () => R4.config.cryptoKey || window.BASE_CRIPTOGRAFIA || '';

  async function deriveKey(salt, usage) {
    const material = await crypto.subtle.importKey('raw', enc.encode(secret()), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations: ITER, hash: 'SHA-256' },
      material, { name: 'AES-GCM', length: 256 }, false, [usage]);
  }

  R4.module('crypto', {
    /** Criptografa qualquer valor JSON → { x: dados, y: salt, z: iv } (base64) */
    async encrypt(data) {
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const key = await deriveKey(salt, 'encrypt');
      const out = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(data)));
      return { x: toB64(out), y: toB64(salt), z: toB64(iv) };
    },
    /** Inverso de encrypt. Retorna null se o pacote for inválido/adulterado. */
    async decrypt(pack) {
      try {
        if (!pack || !pack.x || !pack.y || !pack.z) throw new Error('Pacote de criptografia incompleto');
        const key = await deriveKey(fromB64(pack.y), 'decrypt');
        const out = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(pack.z) }, key, fromB64(pack.x));
        return JSON.parse(dec.decode(out));
      } catch (e) {
        console.error('[R4.crypto] falha ao descriptografar:', e);
        return null;
      }
    }
  }, {
    title: 'R4.crypto', group: 'Núcleo',
    description: 'Criptografia AES-GCM 256 com chave derivada por PBKDF2 (100 mil iterações, salt e IV aleatórios por mensagem). Formato compatível com o backend PHP.',
    props: [
      { name: 'encrypt(data)', type: 'Promise<{x,y,z}>', desc: 'x = dados, y = salt, z = iv, todos em base64.' },
      { name: 'decrypt({x,y,z})', type: 'Promise<any|null>', desc: 'Devolve o valor original, ou null se inválido.' }
    ]
  });

  R4.module('http', {
    /**
     * R4.http.request(url, { method, data, encrypt })
     * encrypt (padrão true) envia o corpo como {x,y,z}.
     */
    async request(url, { method = 'POST', data = null, encrypt = true, headers = {} } = {}) {
      const body = data == null || method === 'GET' ? undefined
        : JSON.stringify(encrypt ? await R4.crypto.encrypt(data) : data);
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json', ...headers }, body });
      // lê o corpo como texto e tenta JSON (resposta vazia/HTML não derruba com SyntaxError obscuro)
      const text = await res.text();
      let parsed = null;
      try { parsed = text ? JSON.parse(text) : null; } catch (e) { /* não era JSON */ }
      if (!res.ok) {
        const err = new Error((parsed && typeof parsed.retorno === 'string' && parsed.retorno) || 'Erro HTTP ' + res.status);
        err.status = res.status; err.data = parsed;     // o corpo (ex.: {erros:{...}}) fica em err.data
        throw err;
      }
      if (parsed === null && text) throw new Error('A resposta não é JSON válido');
      return parsed;
    },
    get: (url, opts) => R4.http.request(url, { ...opts, method: 'GET' }),
    post: (url, data, opts) => R4.http.request(url, { ...opts, method: 'POST', data })
  }, {
    title: 'R4.http', group: 'Núcleo',
    description: 'Requisições JSON. Por padrão o corpo vai criptografado com R4.crypto; use encrypt:false para enviar em claro.',
    props: [
      { name: 'request(url, {method, data, encrypt, headers})', type: 'Promise<json>', desc: 'Chamada genérica.' },
      { name: 'get(url)', type: 'Promise<json>', desc: 'GET sem corpo.' },
      { name: 'post(url, data)', type: 'Promise<json>', desc: 'POST com corpo criptografado.' }
    ]
  });
  // o módulo expõe a API em R4.crypto / R4.http
  R4.crypto = R4.modules.crypto.api;
  R4.http = R4.modules.http.api;
})(window.R4);
