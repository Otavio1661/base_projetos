/**
 * ============================================
 * libr4 / support.js  —  R4 dev
 * ============================================
 * R4.support: detecção de recursos do navegador (e do contexto) que a libr4 usa, com relatório e
 * degradação elegante. NUNCA lança exceção: qualquer falha na detecção vira "recurso ausente".
 *
 *   R4.support.report()   → { ok, faltando[], opcionais[], detalhes[], contexto, verificado }
 *   R4.support.has('IntersectionObserver')   → boolean (nome do recurso, sem diferenciar maiúsculas)
 *   R4.support.probe()    → Promise: testa DE VERDADE ECDH P-256, HKDF e AES-GCM (o relatório síncrono só presume
 *                           que existem quando crypto.subtle existe) e devolve o relatório já atualizado
 *   R4.support.avisar()   → aviso ÚNICO no console quando falta algo OBRIGATÓRIO (feito sozinho ao carregar)
 *   R4.support.motivoCripto() → texto em português do motivo de a criptografia não funcionar (null se ok)
 *
 * OBRIGATÓRIOS (sem eles R4.crypto e a R4.http cifrada falham com mensagem clara; o resto da lib segue):
 *   crypto.subtle, ECDH P-256, HKDF, AES-GCM, TextEncoder, fetch.
 * OPCIONAIS (a lib tem alternativa; o que acontece sem cada um está em `efeito`): AbortController,
 *   IntersectionObserver, ResizeObserver, CSS color-mix, structuredClone, DecompressionStream, localStorage,
 *   matchMedia, requestIdleCallback, adoptedStyleSheets.
 * Matriz de navegadores e checklist: docs/NAVEGADORES.md.
 * ============================================
 */
(function (R4) {
  'use strict';

  const ok = f => { try { return !!f(); } catch (e) { return false; } };
  const fn = nome => ok(() => typeof window[nome] === 'function');
  const subtle = () => { try { return window.crypto && window.crypto.subtle ? window.crypto.subtle : null; } catch (e) { return null; } };

  /** Algoritmos que só se confirmam com uma operação real (preenchido por probe()). */
  const sonda = {};   // { ecdh, hkdf, aesgcm } → true | false (ausente = ainda presumido)

  /**
   * Tabela de recursos: nome (também é o id), se é obrigatório, o teste síncrono e o efeito da ausência.
   * Os testes são recompostos a cada report(): refletem o estado ATUAL (útil em testes que removem recursos).
   */
  const RECURSOS = [
    { n: 'crypto.subtle', o: true, t: () => { const s = subtle(); return s && typeof s.generateKey === 'function' && typeof s.deriveBits === 'function'; },
      e: 'R4.crypto e a R4.http cifrada recusam enviar (mensagem clara). Exige HTTPS ou localhost e um navegador atual.' },
    { n: 'ECDH P-256', o: true, t: () => (sonda.ecdh !== undefined ? sonda.ecdh : subtle()),
      e: 'Sem acordo de chave ECDH não há criptografia ponta a ponta com o servidor.' },
    { n: 'HKDF', o: true, t: () => (sonda.hkdf !== undefined ? sonda.hkdf : subtle()),
      e: 'Sem HKDF-SHA256 não há como derivar a chave AES da sessão.' },
    { n: 'AES-GCM', o: true, t: () => (sonda.aesgcm !== undefined ? sonda.aesgcm : subtle()),
      e: 'Sem AES-256-GCM não há como cifrar as mensagens.' },
    { n: 'TextEncoder', o: true, t: () => fn('TextEncoder') && fn('TextDecoder'),
      e: 'A criptografia converte texto em bytes com TextEncoder/TextDecoder; sem eles recusa cifrar.' },
    { n: 'fetch', o: true, t: () => fn('fetch'),
      e: 'R4.http, o grid remoto, formulários com url e envio de arquivos não conseguem falar com o servidor.' },
    { n: 'AbortController', o: false, t: () => fn('AbortController'),
      e: 'A lib não depende dele hoje; só não há cancelamento de requisições em andamento.' },
    { n: 'IntersectionObserver', o: false, t: () => fn('IntersectionObserver'),
      e: 'As animações r4-anim rodam direto, sem esperar o elemento entrar na tela.' },
    { n: 'ResizeObserver', o: false, t: () => fn('ResizeObserver'),
      e: 'Os gráficos só se ajustam ao redimensionar a janela (não ao tamanho do próprio contêiner); o grid virtual só repinta ao rolar ou com refresh().' },
    { n: 'CSS color-mix', o: false, t: () => window.CSS && typeof window.CSS.supports === 'function' && window.CSS.supports('color: color-mix(in srgb, red, blue)'),
      e: 'Sombras, faixas e fundos translúcidos usam cores sólidas aproximadas (bloco @supports not no libr4.css).' },
    { n: 'structuredClone', o: false, t: () => fn('structuredClone'),
      e: 'A cópia da configuração dos componentes usa uma cópia rasa (Object.assign) no lugar.' },
    { n: 'DecompressionStream', o: false, t: () => fn('DecompressionStream'),
      e: 'Só a leitura de XLSX compactado falha (com aviso claro); CSV, JSON e geração de XLSX continuam.' },
    { n: 'localStorage', o: false, t: () => { const s = window.localStorage; s.getItem('r4:__probe'); return true; },
      e: 'R4.store guarda em memória (tema, idioma e abas não sobrevivem ao recarregar).' },
    { n: 'matchMedia', o: false, t: () => fn('matchMedia'),
      e: 'O modo "auto" do tema assume claro; "reduzir movimento" é ignorado.' },
    { n: 'requestIdleCallback', o: false, t: () => fn('requestIdleCallback'),
      e: 'A gravação do R4.store usa setTimeout (50 ms) no lugar.' },
    { n: 'adoptedStyleSheets', o: false, t: () => 'adoptedStyleSheets' in document && typeof window.CSSStyleSheet === 'function' && 'replaceSync' in window.CSSStyleSheet.prototype,
      e: 'A lib não usa hoje (cria <style>); só importa para quem quiser CSP estrita em style-src.' }
  ];

  /** Relatório síncrono. Nunca lança. */
  function report() {
    try {
      const detalhes = RECURSOS.map(r => {
        const presente = ok(r.t);
        const testado = r.n === 'ECDH P-256' ? sonda.ecdh !== undefined : r.n === 'HKDF' ? sonda.hkdf !== undefined : r.n === 'AES-GCM' ? sonda.aesgcm !== undefined : true;
        return { nome: r.n, obrigatorio: r.o, ok: presente, verificado: testado, efeito: presente ? '' : r.e };
      });
      const faltando = detalhes.filter(d => d.obrigatorio && !d.ok).map(d => d.nome);
      const opcionais = detalhes.filter(d => !d.obrigatorio && !d.ok).map(d => d.nome);
      let seguro = null, protocolo = '';
      try { seguro = typeof window.isSecureContext === 'boolean' ? window.isSecureContext : null; protocolo = String(location.protocol || ''); } catch (e) { /* sem contexto */ }
      return { ok: faltando.length === 0, faltando, opcionais, detalhes, contexto: { seguro, protocolo }, verificado: sonda.ecdh !== undefined && sonda.hkdf !== undefined && sonda.aesgcm !== undefined };
    } catch (e) {
      return { ok: false, faltando: ['(a detecção falhou)'], opcionais: [], detalhes: [], contexto: { seguro: null, protocolo: '' }, verificado: false };
    }
  }

  const tenta = async f => { try { await f(); return true; } catch (e) { return false; } };
  let sondando = null;
  /** Testa de verdade os algoritmos da criptografia (uma vez); nunca rejeita. Devolve o relatório atualizado. */
  function probe() {
    if (!sondando) {
      sondando = (async () => {
        const S = subtle();
        if (!S) { sonda.ecdh = sonda.hkdf = sonda.aesgcm = false; return; }
        const zeros = n => new Uint8Array(n);
        sonda.ecdh = await tenta(async () => {
          const a = await S.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']);
          const b = await S.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']);
          await S.deriveBits({ name: 'ECDH', public: b.publicKey }, a.privateKey, 256);
        });
        sonda.hkdf = await tenta(async () => {
          const k = await S.importKey('raw', zeros(32), 'HKDF', false, ['deriveKey']);
          await S.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: zeros(16), info: zeros(1) }, k, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
        });
        sonda.aesgcm = await tenta(async () => {
          const k = await S.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
          await S.encrypt({ name: 'AES-GCM', iv: zeros(12), tagLength: 128 }, k, zeros(4));
        });
      })().catch(() => { /* nunca rejeita */ }).then(() => report());
    }
    return sondando;
  }

  /** O recurso existe? (nome como em report().detalhes, sem diferenciar maiúsculas/minúsculas) */
  function has(nome) {
    try {
      const alvo = String(nome).toLowerCase();
      const r = RECURSOS.find(x => x.n.toLowerCase() === alvo || x.n.toLowerCase().replace(/^css /, '') === alvo);
      return r ? ok(r.t) : false;
    } catch (e) { return false; }
  }

  /** Motivo (pt-BR) de a criptografia não funcionar neste navegador/contexto; null se tudo indica que funciona. */
  function motivoCripto() {
    try {
      if (!subtle()) {
        let seguro = true;
        try { seguro = window.isSecureContext !== false; } catch (e) { /* assume seguro */ }
        return seguro
          ? 'este navegador não oferece a WebCrypto (crypto.subtle). Use uma versão atual do Chrome, Edge, Firefox ou Safari (veja docs/NAVEGADORES.md).'
          : 'a página não está em contexto seguro, e o navegador só libera crypto.subtle em HTTPS ou em localhost. Abra o site por HTTPS (veja docs/NAVEGADORES.md).';
      }
      const rel = report(), falta = rel.faltando.filter(n => n !== 'crypto.subtle');
      if (falta.length) return 'este navegador não oferece: ' + falta.join(', ') + '. Use uma versão atual do Chrome, Edge, Firefox ou Safari (veja docs/NAVEGADORES.md).';
      return null;
    } catch (e) { return null; }
  }

  let avisou = false;
  /** Aviso único no console quando falta algo obrigatório. R4.config.avisoSuporte = false silencia. Devolve o relatório. */
  function avisar() {
    const rel = report();
    try {
      if (!rel.ok && !avisou && !(R4.config && R4.config.avisoSuporte === false)) {
        avisou = true;
        console.warn('[R4] Este navegador não tem recursos necessários: ' + rel.faltando.join(', ') + '. ' + (motivoCripto() || '') +
          ' A criptografia (R4.crypto e a R4.http cifrada) fica indisponível; o restante da biblioteca continua funcionando onde possível.');
      }
    } catch (e) { /* aviso é só conforto */ }
    return rel;
  }

  R4.support = R4.module('support', { report, has, probe, avisar, motivoCripto }, {
    title: 'R4.support', group: 'Núcleo',
    description: 'Detecção de recursos do navegador (crypto.subtle + ECDH P-256 + HKDF + AES-GCM, fetch, TextEncoder e os opcionais: IntersectionObserver, ResizeObserver, CSS color-mix, structuredClone, DecompressionStream, localStorage, matchMedia, requestIdleCallback, adoptedStyleSheets). Nunca lança exceção. Sem um recurso obrigatório a criptografia falha com mensagem clara em português (e há um aviso único no console); os opcionais têm alternativa (o relatório diz qual). Matriz de navegadores: docs/NAVEGADORES.md.',
    props: [
      { name: 'report()', type: '{ok, faltando[], opcionais[], detalhes[], contexto, verificado}', desc: 'Relatório síncrono. ok = nada obrigatório falta; faltando = obrigatórios ausentes; opcionais = recursos opcionais ausentes; detalhes traz {nome, obrigatorio, ok, verificado, efeito} de cada um; contexto = {seguro, protocolo}.' },
      { name: 'has(nome)', type: 'boolean', desc: 'O recurso existe agora? Ex.: R4.support.has("IntersectionObserver").' },
      { name: 'probe()', type: 'Promise<relatório>', desc: 'Testa de verdade ECDH P-256, HKDF e AES-GCM (o report() síncrono só presume que existem quando crypto.subtle existe). Nunca rejeita.' },
      { name: 'avisar()', type: 'relatório', desc: 'Mostra no console, uma única vez, o aviso de recursos obrigatórios ausentes. Roda sozinho ao carregar; R4.config.avisoSuporte = false silencia.' },
      { name: 'motivoCripto()', type: 'string | null', desc: 'Por que a criptografia não funciona aqui (contexto inseguro, sem crypto.subtle, algoritmo ausente) ou null.' }
    ]
  });

  avisar();   // uma vez ao carregar (não lança; só escreve no console se faltar algo obrigatório)
})(window.R4);
