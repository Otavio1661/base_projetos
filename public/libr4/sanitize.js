/**
 * ============================================
 * libr4 / sanitize.js  —  R4 dev
 * ============================================
 * R4.sanitize: normalização e SINAIS de injeção no navegador (defesa em profundidade).
 *
 *   R4.sanitize.text(v, { max: 1000, multiline: false })   → texto limpo (NFC, sem NUL/controles/bidi)
 *   R4.sanitize.filename('..\\..\\shell.php.jpg')          → 'shell_php.jpg'
 *   R4.sanitize.detect("' OR '1'='1")                      → { sql: ['tautologia'], script: [], ... }
 *   R4.sanitize.prompt(texto, { max: 8000, wrap: true })   → texto neutralizado para um LLM
 *   await R4.sanitize.sniffFile(file)                      → { kind: 'png', ext: 'png', match: true }
 *
 * IMPORTANTE (e honesto): nada aqui protege o SERVIDOR. Qualquer pessoa chama a API direto, sem
 * passar por esta página. A proteção real é no PHP: consultas preparadas (PDO prepare/bind),
 * validação por esquema (Core\Security\Input), upload seguro (Core\Security\Upload) e tratamento
 * do texto que vai para IA (Core\Security\Prompt). Este módulo melhora a experiência (avisa cedo,
 * não manda lixo invisível) e gera sinais para log. O cliente NÃO "escapa SQL": escapar aspas no
 * navegador é antipadrão (quebra nomes como O'Brien e não impede ninguém de chamar a API direto).
 * ============================================
 */
(function (R4) {
  'use strict';
  if (!R4) return;

  const DEF = { maxText: 1000, maxTextarea: 10000, maxPrompt: 8000, guard: 'warn' };

  /* ---------------- texto ---------------- */
  // faixas montadas por código (sem caracteres invisíveis no fonte):
  // zero-width U+200B, U+2060-2064, U+FEFF; bidi U+202A-202E, U+2066-2069; "tags" Unicode U+E0000-E007F
  const INVIS = /[\u200B\u2060-\u2064\uFEFF\u202A-\u202E\u2066-\u2069]|\uDB40[\uDC00-\uDC7F]/g;
  const LONE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;   // surrogate sozinho (UTF-16 inválido)
  const CTRL_1 = /[\u0000-\u001F\u007F-\u009F]/g;          // linha única: tudo
  const CTRL_M = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F]/g;   // multilinha: mantém \t e \n
  const SPACES = /[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/g;

  /** Corta em `max` caracteres (code points) sem partir par substituto (emoji). */
  function cut(s, max) {
    if (!(max > 0) || s.length <= max) return s;
    let n = 0, i = 0;
    while (i < s.length && n < max) { const c = s.charCodeAt(i); i += c >= 0xD800 && c <= 0xDBFF && i + 1 < s.length ? 2 : 1; n++; }
    return s.slice(0, i);
  }
  const cpLen = s => { let n = 0; for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); if (c < 0xDC00 || c > 0xDFFF) n++; } return n; };

  /**
   * Texto limpo. Opções: max (padrão 1000; 0 = sem corte), multiline (false), normalize (true = NFC),
   * trim (true), collapse (true = espaços repetidos viram um na linha única; no multilinha tira espaços
   * no fim das linhas e 3+ linhas vazias viram 2).
   */
  function text(v, o) {
    o = o || {};
    if (v == null || typeof v === 'object' || typeof v === 'function' || typeof v === 'symbol') return '';
    let s = String(v);
    const max = o.max == null ? DEF.maxText : +o.max || 0, ml = !!o.multiline;
    if (max > 0 && s.length > max * 2 + 64) s = s.slice(0, max * 2 + 64);   // não processa megabytes à toa
    s = s.replace(LONE, '�');
    if (o.normalize !== false && s.normalize) { try { s = s.normalize('NFC'); } catch (e) { /* mantém */ } }
    s = s.replace(/\r\n?|[\u2028\u2029\u0085]/g, '\n').replace(INVIS, '');
    if (!ml) s = s.replace(/[\n\t]/g, ' ');
    s = s.replace(ml ? CTRL_M : CTRL_1, '').replace(SPACES, ' ');
    if (o.collapse !== false) s = ml ? s.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n') : s.replace(/ {2,}/g, ' ');
    if (o.trim !== false) s = s.replace(/^[ \t\n]+|[ \t\n]+$/g, '');
    return cut(s, max);
  }
  /** Limpeza mínima (não mexe em espaços nem corta): tira NUL, controles (menos \t \n \r), bidi e invisíveis. */
  const strip = v => (typeof v === 'string' ? v.replace(LONE, '�').replace(INVIS, '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, '') : v);

  const BAD_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
  /**
   * Copia profunda para ENVIO: strings passam por strip() (desligue com {strip: false}), chaves
   * __proto__/constructor/prototype são descartadas, profundidade máx. 8, até 10.000 itens por array,
   * funções/símbolos somem.
   */
  function deep(v, o, d = 0) {
    const st = !(o && o.strip === false);
    if (typeof v === 'string') return st ? strip(v) : v;
    if (v == null || typeof v !== 'object') return typeof v === 'function' || typeof v === 'symbol' ? undefined : v;
    if (d > 8) return undefined;
    if (v instanceof Date) return v;
    if (typeof Blob !== 'undefined' && v instanceof Blob) return v;
    if (Array.isArray(v)) return v.slice(0, 10000).map(x => deep(x, o, d + 1));
    const out = {};
    for (const k of Object.keys(v)) {
      if (BAD_KEYS.has(k)) continue;
      const x = deep(v[k], o, d + 1);
      if (x !== undefined) out[k] = x;
    }
    return out;
  }

  /* ---------------- nome de arquivo ---------------- */
  const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
  /**
   * Nome seguro para EXIBIR/enviar: sem caminho (../, \), NUL, controles, bidi, reservados do Windows
   * (<>:"/\|?* e CON, PRN, COM1...), pontos/espaços nas pontas; só a ÚLTIMA extensão é mantida
   * ("shell.php.jpg" → "shell_php.jpg"). O servidor deve gravar com nome próprio (aleatório).
   */
  function filename(nome, o) {
    const max = (o && o.max) || 120;
    let s = text(nome, { max: 1000 }).replace(/\\/g, '/');
    s = s.slice(s.lastIndexOf('/') + 1);
    s = s.replace(/[<>:"|?*\u0000-\u001F]/g, '_').replace(/^[\s.]+|[\s.]+$/g, '');
    const parts = s.split('.');
    let ext = parts.length > 1 ? parts.pop().toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 10) : '';
    let base = parts.join('_').replace(/_{2,}/g, '_').replace(/^[\s._]+|[\s._]+$/g, '');
    if (!base || RESERVED.test(base)) base = '_' + base;
    base = cut(base, Math.max(1, max - (ext ? ext.length + 1 : 0)));
    const out = base + (ext ? '.' + ext : '');
    return out === '_' ? 'arquivo' : out;
  }
  /** Extensões executáveis/ativas bloqueadas por padrão no filedrop. */
  const EXEC = ['php', 'php3', 'php4', 'php5', 'php7', 'php8', 'phtml', 'phar', 'phps', 'pht', 'exe', 'bat', 'cmd', 'com', 'scr', 'msi', 'dll',
    'sh', 'bash', 'ps1', 'vbs', 'vbe', 'js', 'mjs', 'jar', 'jsp', 'asp', 'aspx', 'cgi', 'pl', 'py', 'hta', 'wsf', 'lnk', 'reg', 'htaccess', 'htpasswd'];
  const extOf = n => { const m = /\.([^.\\/]+)$/.exec(String(n || '').trim()); return m ? m[1].toLowerCase() : ''; };
  /** '' se o nome é aceitável; senão 'exec' (extensão executável) ou 'double' (dupla extensão perigosa: x.php.jpg). */
  function dangerousName(n, list) {
    const L = list || EXEC;
    let raw = String(n || '').toLowerCase().replace(/\\/g, '/');
    raw = raw.slice(raw.lastIndexOf('/') + 1).replace(/[\s.\u0000]+$/, '');
    const parts = raw.split('.');
    if (parts.length < 2) return '';
    if (L.includes(parts.pop().trim())) return 'exec';                       // x.php, .htaccess, nota.csv.exe
    return parts.slice(1).some(p => L.includes(p.trim())) ? 'double' : '';   // shell.php.jpg
  }

  /* ---------------- detecção (SINAL, não barreira) ---------------- */
  const P = {
    sql: [
      ['tautologia', /['"`]\s*\)?\s*(or|and|\|\||&&)\s*\(?\s*['"`]?\s*\w*\s*['"`]?\s*(=|<>|!=|like\b|>|<)/i],
      ['tautologia', /\b(or|and)\s+\(?\s*\d+\s*=\s*\d+/i],
      ['union-select', /\bunion\s+(all\s+|distinct\s+)?select\b/i],
      ['comando-empilhado', /;\s*(drop|delete|insert|update|alter|create|truncate|exec|execute|shutdown|grant|revoke|rename)\s/i],
      ['fecha-aspas-comentario', /['"`]\s*\)*\s*(--|\/\*)/],
      ['comentario-sql', /\/\*.{0,200}?\*\/|['"`)\d]\s*--\s*$/m],
      ['atraso', /\b(sleep|pg_sleep|benchmark)\s*\(\s*\d|\bwaitfor\s+delay\b/i],
      ['funcao-perigosa', /\b(xp_cmdshell|information_schema|load_file\s*\(|into\s+(out|dump)file|sqlite_master|pg_catalog)\b/i]
    ],
    script: [
      ['tag-html', /<\s*\/?\s*(script|iframe|object|embed|svg|math|style|link|meta|base|form|img|video|audio|body|frame|frameset|applet|template|details|marquee|input|textarea|button)\b/i],
      ['evento-inline', /\bon[a-z]{3,25}\s*=/i],
      ['url-script', /(java|vb|live)script\s*:|data\s*:\s*text\/html/i],
      ['template', /\{\{.{0,100}?\}\}|\$\{.{0,100}?\}|<%.{0,100}?%>/],
      ['codigo-js', /\b(eval|document\.cookie|document\.write|innerHTML|outerHTML|fromCharCode|setTimeout|setInterval|new\s+Function)\b\s*[(=]/],
      ['entidade-codificada', /&#x?0*(60|3c|62|3e|34|22|39|27);?|\\u00?3c|%3c\s*\/?\s*script/i]
    ],
    path: [
      ['subir-diretorio', /(^|[\\/])\.\.([\\/]|$)/],
      ['traversal-codificado', /%2e%2e|%252e|\.\.%2f|\.\.%5c|%c0%ae|%c1%9c|%e0%80%ae/i],
      ['caminho-sistema', /(^|[\s"'=(:])\/(etc|proc|var|root|usr|bin|boot|dev|sys|tmp)\/\w/i],
      ['caminho-windows', /\b[a-z]:[\\/](windows|winnt|system32|users|boot\.ini|inetpub)/i],
      ['wrapper', /\b(file|php|phar|zip|data|expect|glob|gopher|dict|ldap|jar|ftp):\/\//i],
      ['byte-nulo', /\u0000|%00/],
      ['caminho-rede', /^\\\\[^\\\s]+\\/]
    ],
    // espelho de Core\Security\Prompt::SINAIS (texto dobrado: minúsculo e sem acento)
    prompt: [
      ['ignorar-instrucoes', /\b(ignore|ignora|ignorem|ignorar|desconsidere|desconsiderar|desconsidera|esqueca|esquecer|disregard|forget|override|bypass|pule|skip)\b.{0,60}?\b(instruc\w*|instruction\w*|regra\w*|rules?|prompt\w*|orientac\w*|diretriz\w*|anterior\w*|previous|prior|above|acima|tudo|everything|all)\b/],
      ['revelar-prompt', /\b(revele|revelar|revela|mostre|mostrar|mostra|imprima|imprimir|exiba|exibir|repita|repetir|diga|conte|reveal|show|print|repeat|output|tell|display|leak)\b.{0,60}?\b(system ?prompt|prompt|instruc\w*|instructions?|mensagem (de|do) sistema|system message|regras internas|initial instructions|segredo\w*|secrets?|senha\w*|passwords?|api[ _-]?keys?|chaves?|tokens?)\b/],
      ['troca-de-papel', /\b(voce agora e|voce e agora|a partir de agora voce|de agora em diante voce|finja (ser|que)|aja como|atue como|you are now|from now on,? you|pretend (to be|you are)|act as|roleplay as|new persona|nova persona)\b/],
      ['modo-sem-restricao', /\b(developer mode|modo (de )?desenvolvedor|jailbreak|dan mode|do anything now|sem (nenhuma )?restric\w*|without (any )?restrictions|no restrictions|unfiltered|sem filtros?|god mode)\b/],
      ['marcador-de-papel', /<\|?\s*(im_start|im_end|endoftext|system|assistant)\s*\|?>|\[\/?inst\]|<<\/?sys>>|<\/?\s*(system|instructions?|instrucoes|assistant)\s*>|^\s*#{0,6}\s*(system|assistant|sistema|assistente|developer)\s*:/m],
      ['acao-de-ferramenta', /\b(execute|executar|rode|rodar|run|chame|chamar|call|invoke|use a ferramenta|use the tool)\b.{0,40}?\b(comando|command|shell|terminal|bash|powershell|ferramenta|tool|funcao|function|sql|query|consulta|script)\b/],
      ['exfiltracao', /!\[[^\]]{0,100}\]\(\s*https?:\/\/|\b(envie|mande|send|post|forward|encaminhe)\b.{0,60}?\b(para|to)\b.{0,20}?(https?:\/\/|www\.|@[a-z0-9-]+\.)/],
      ['codificado', /\b(base64|rot13|hex|decode|decodifique|decodificar)\b.{0,40}?\b(e (siga|execute|obede\w*)|and (follow|execute|obey)|instruc\w*|instructions?)\b/]
    ],
    proto: [
      ['__proto__', /__proto__/],
      ['constructor.prototype', /\bconstructor\s*(\.|\[\s*['"`]?)\s*prototype\b|\[\s*['"`]constructor['"`]\s*\]/],
      ['prototype[...]', /\bprototype\s*\[/]
    ]
  };
  const fold = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[ \t]+/g, ' ');
  /**
   * Procura padrões comuns de injeção. Devolve { sql, script, path, prompt, proto } (listas de sinais).
   * É só SINAL para UX/log (avisar o usuário, registrar tentativa). NÃO é barreira: um atacante
   * contorna qualquer lista e chama o servidor direto. Texto legítimo pode dar falso positivo.
   */
  function detect(v) {
    const out = { sql: [], script: [], path: [], prompt: [], proto: [] };
    if (v == null || typeof v === 'object') return out;
    let s = String(v);
    if (s.length > 20000) s = s.slice(0, 20000);
    const compact = s.replace(/[\s\u0000-\u001F]+/g, '');
    let folded = '';
    try { folded = fold(s.replace(INVIS, '')); } catch (e) { folded = s.toLowerCase(); }
    for (const cat of Object.keys(P)) {
      const src = cat === 'prompt' ? folded : s;
      for (const [nome, re] of P[cat]) {
        if (out[cat].includes(nome)) continue;
        if (re.test(src) || (cat === 'script' && nome === 'url-script' && re.test(compact))) out[cat].push(nome);
      }
    }
    if (/[\u200B-\u200F\u2060-\u2064\uFEFF\u202A-\u202E\u2066-\u2069]|\uDB40[\uDC00-\uDC7F]/.test(s)) out.prompt.push('caracteres-invisiveis');
    return out;
  }
  /** Categorias com algum sinal: ['sql', 'script'] (vazio = nada conhecido). */
  const kinds = r => Object.keys(r || {}).filter(k => Array.isArray(r[k]) && r[k].length);

  /* ---------------- texto para IA ---------------- */
  function neutralize(s) {
    return s
      .replace(/<\|([^|<>\n]{0,40})\|>/g, '‹|$1|›')
      .replace(/\[(\/?)(INST|SYS)\]/gi, '($1$2)')
      .replace(/<<(\/?)(SYS)>>/gi, '‹‹$1$2››')
      .replace(/<\s*(\/?)\s*(system|assistant|user|human|developer|instructions?|instru[cç](?:ao|ão|oes|ões)|prompt|context|contexto|tool[_-]?\w*|function[_-]?\w*|im_start|im_end|[a-z_]*dados[a-z_]*|[a-z_]*user_?input[a-z_]*|document|documento)\b([^>\n]{0,200})>/gi, '‹$1$2$3›')
      .replace(/^([ \t>#*]*)(system|assistant|user|human|ai|developer|sistema|assistente|usu[aá]rio|desenvolvedor|modelo|model)(\s*):/gim, '$1($2)$3:')
      .replace(/^(#{1,6})(\s)/gm, '\\$1$2')
      .replace(/`{3,}/g, '` ` `')
      .replace(/~{3,}/g, '~ ~ ~');
  }
  const randId = () => {
    const b = new Uint8Array(8);
    (window.crypto && crypto.getRandomValues ? crypto.getRandomValues(b) : b.forEach((_, i) => { b[i] = Math.random() * 256; }));
    return [...b].map(x => x.toString(16).padStart(2, '0')).join('');
  };
  /**
   * Espelha Core\Security\Prompt::untrusted no cliente: limpa (multilinha), tira ZWJ/ZWNJ/LRM/RLM,
   * corta em `max`, neutraliza marcadores de papel/tags/tokens/cercas. wrap:true embrulha em
   * <dados_do_usuario id="..."> com id aleatório. Útil para PRÉ-VISUALIZAR; o servidor refaz tudo.
   */
  function prompt(v, o) {
    o = o || {};
    const max = o.max || DEF.maxPrompt;
    let s = text(v, { max: 0, multiline: true }).replace(/[\u200C-\u200F]/g, '');
    const cortado = cpLen(s) > max;
    s = neutralize(cut(s, max)) + (cortado ? '\n[... texto cortado no limite de ' + max + ' caracteres]' : '');
    if (!o.wrap) return s;
    const id = /^[a-f0-9]{8,64}$/.test(o.id || '') ? o.id : randId();
    return '<dados_do_usuario id="' + id + '">\n' + s + '\n</dados_do_usuario>';
  }

  /* ---------------- assinatura de arquivo ---------------- */
  const EXPECT = { png: ['png'], jpg: ['jpeg'], jpeg: ['jpeg'], jfif: ['jpeg'], gif: ['gif'], webp: ['webp'], pdf: ['pdf'],
    zip: ['zip', 'xlsx', 'docx', 'pptx', 'ooxml'], xlsx: ['xlsx', 'ooxml', 'zip'], docx: ['docx', 'ooxml', 'zip'], pptx: ['pptx', 'ooxml', 'zip'],
    csv: ['text'], tsv: ['text'], txt: ['text'], json: ['text'], md: ['text'], log: ['text'], xml: ['text', 'html'], svg: ['html', 'text'],
    exe: ['exe'], dll: ['exe'] };
  const readHead = (file, n) => new Promise((res, rej) => {
    const blob = file.slice ? file.slice(0, n) : file;
    if (blob.arrayBuffer) { blob.arrayBuffer().then(b => res(new Uint8Array(b)), rej); return; }
    const fr = new FileReader();
    fr.onload = () => res(new Uint8Array(fr.result)); fr.onerror = () => rej(fr.error || new Error('leitura'));
    fr.readAsArrayBuffer(blob);
  });
  const starts = (b, sig, at = 0) => sig.every((x, i) => b[at + i] === x);
  const ascii = s => [...s].map(c => c.charCodeAt(0));
  const hasAscii = (b, s) => { const t = ascii(s); for (let i = 0; i + t.length <= b.length; i++) if (starts(b, t, i)) return true; return false; };
  function kindOf(b) {
    if (!b.length) return 'empty';
    if (starts(b, [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])) return 'png';
    if (starts(b, [0xFF, 0xD8, 0xFF])) return 'jpeg';
    if (starts(b, ascii('GIF87a')) || starts(b, ascii('GIF89a'))) return 'gif';
    if (starts(b, ascii('RIFF')) && starts(b, ascii('WEBP'), 8)) return 'webp';
    if (starts(b, ascii('%PDF-'))) return 'pdf';
    if (starts(b, [0x50, 0x4B, 0x03, 0x04]) || starts(b, [0x50, 0x4B, 0x05, 0x06])) {
      if (hasAscii(b, 'xl/')) return 'xlsx';
      if (hasAscii(b, 'word/')) return 'docx';
      if (hasAscii(b, 'ppt/')) return 'pptx';
      return hasAscii(b, '[Content_Types].xml') ? 'ooxml' : 'zip';
    }
    if (starts(b, ascii('MZ')) || starts(b, [0x7F, 0x45, 0x4C, 0x46]) || starts(b, [0xCA, 0xFE, 0xBA, 0xBE]) || starts(b, [0xCF, 0xFA, 0xED, 0xFE]) || starts(b, [0xFE, 0xED, 0xFA, 0xCE])) return 'exe';
    if (starts(b, ascii('#!'))) return 'script';
    if (b.includes(0)) return 'binary';
    let t = '', end = b.length;
    if (end >= 4096) {   // amostra cortada: não termina no meio de um caractere UTF-8
      let k = end - 1, n = 0;
      while (k > 0 && n < 3 && (b[k] & 0xC0) === 0x80) { k--; n++; }
      if (b[k] >= 0xC0 && end - k < (b[k] >= 0xF0 ? 4 : b[k] >= 0xE0 ? 3 : 2)) end = k;
    }
    try { t = new TextDecoder('utf-8', { fatal: true }).decode(b.subarray(0, end)); }
    catch (e) {
      // pode ser texto em latin-1/cp1252: aceita se quase tudo for imprimível
      const bad = [...b].filter(x => x < 9 || (x > 13 && x < 32)).length;
      if (bad > b.length * 0.02) return 'binary';
      t = String.fromCharCode(...b.slice(0, 2048));
    }
    const head = t.replace(/^\uFEFF/, '').trimStart().slice(0, 200).toLowerCase();
    if (/^<\?php|^<\?=/.test(head) || /<\?php/i.test(t)) return 'php';
    if (/^(<!doctype html|<html|<script|<svg|<\?xml[^>]*>\s*<svg)/.test(head)) return 'html';
    return 'text';
  }
  /**
   * Lê os primeiros bytes (padrão 4100) e identifica o conteúdo: png, jpeg, gif, webp, pdf, zip, xlsx,
   * docx, exe (MZ/ELF/Mach-O), script (#!), php, html, text, binary, empty. Promise<{kind, ext, match}>:
   * match = true/false comparando com a extensão do nome, ou null se a extensão não está na tabela.
   * Também é só defesa em profundidade: o servidor confere de novo (Core\Security\Upload).
   */
  async function sniffFile(file, o) {
    const ext = extOf(file && file.name);
    let kind = 'unknown';
    try { kind = kindOf(await readHead(file, (o && o.bytes) || 4100)); } catch (e) { kind = 'unknown'; }
    const exp = EXPECT[ext];
    return { kind, ext, match: exp ? exp.includes(kind) : null };
  }

  const api = {
    defaults: DEF, text, strip, deep, filename, detect, kinds, prompt, neutralize, sniffFile, dangerousName, extOf,
    execExtensions: EXEC,
    url: (v, kind) => R4.util.safeUrl(v, kind),
    safeUrl: (v, kind) => R4.util.safeUrl(v, kind)
  };
  R4.sanitize = R4.module('sanitize', api, {
    title: 'R4.sanitize', group: 'Núcleo',
    description: 'Normalização de texto e SINAIS de injeção (SQL, HTML/JS, caminho, prompt de IA, protótipo) no navegador, nome de arquivo seguro e conferência de assinatura de arquivo. É defesa em profundidade e UX — NÃO protege o servidor: qualquer um chama a API direto. A barreira real é no PHP (consultas preparadas, Core\\Security\\Input, Upload e Prompt). Os campos dos formulários já usam este módulo (opções sanitize e guard).',
    props: [
      { name: 'text(v, {max: 1000, multiline: false, normalize: true, trim: true})', type: 'string', desc: 'NFC; tira NUL, controles, bidi (U+202A–202E, U+2066–2069), zero-width e tags Unicode; troca espaços exóticos; colapsa espaços (linha única) ou linhas vazias (multilinha); corta no limite sem partir emoji.' },
      { name: 'strip(v) / deep(obj)', type: 'string / object', desc: 'Limpeza mínima (NUL, controles, bidi, invisíveis) sem mexer em espaços / cópia profunda para envio: strings com strip, sem __proto__/constructor/prototype, profundidade ≤ 8.' },
      { name: 'filename(nome, {max: 120})', type: 'string', desc: 'Sem caminho (../, \\), NUL, controles, bidi, <>:"|?*, nomes reservados do Windows (CON, PRN, COM1...); só a última extensão fica ("shell.php.jpg" → "shell_php.jpg").' },
      { name: 'detect(v)', type: '{sql, script, path, prompt, proto}', desc: 'Listas de sinais encontrados (ex.: sql: ["tautologia"]). Só SINAL para aviso/log — não é barreira e pode dar falso positivo.' },
      { name: 'kinds(resultado)', type: 'string[]', desc: 'Categorias com algum sinal: kinds(detect(v)) → ["sql"].' },
      { name: 'prompt(v, {max: 8000, wrap: false, id})', type: 'string', desc: 'Espelha Core\\Security\\Prompt::untrusted: limpa, corta e neutraliza "system:", </instructions>, <|im_start|>, [INST], ```; wrap embrulha em <dados_do_usuario id="aleatório">. O servidor refaz tudo.' },
      { name: 'sniffFile(file)', type: 'Promise<{kind, ext, match}>', desc: 'Lê os primeiros bytes: png, jpeg, gif, webp, pdf, zip, xlsx, docx, exe, script, php, html, text, binary. match compara com a extensão (null se desconhecida).' },
      { name: 'dangerousName(nome) / execExtensions', type: "'' | 'exec' | 'double'", desc: 'Extensão executável (.php, .exe, .js, .sh, .htaccess...) ou dupla extensão perigosa (x.php.jpg).' },
      { name: 'url(v) / safeUrl(v)', type: 'string', desc: 'O mesmo R4.util.safeUrl: só relativa, #, http(s), mailto, tel, blob; senão "".' },
      { name: 'defaults', type: 'object', desc: '{ maxText: 1000, maxTextarea: 10000, maxPrompt: 8000, guard: "warn" } — limites usados pelos campos quando maxLength = 0.' },
      { name: 'Campos: sanitize', type: 'boolean', default: 'true', desc: 'textfield, textarea, maskfield: getValue() devolve o texto limpo (e limitado a maxLength ou ao limite padrão). passwordfield só tira NUL. false desliga.' },
      { name: "Campos: guard", type: "'off' | 'warn' | 'block'", default: "'warn'", desc: "warn: aviso visível no campo + console.warn (sem o valor) + evento suspicious; block: o campo fica inválido e o form não envia. passwordfield usa 'off'." },
      { name: 'O que o SERVIDOR deve fazer', type: 'obrigatório', desc: 'PDO prepare/bind (nunca concatenar), Core\\Security\\Input::validate (esquema, recusa campos extras), Core\\Security\\Upload (allowlist + MIME real + assinatura + nome aleatório fora do public/), Core\\Security\\Prompt (e validar a SAÍDA do modelo). Veja docs/SEGURANCA.md, seção 13.' }
    ]
  });
})(window.R4);
