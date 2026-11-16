#!/usr/bin/env node
/**
 * ============================================
 * tools/testes-seguranca.js — testes de segurança da libr4 + vitrine + API de teste
 * ============================================
 * Como rodar:
 *   1. Suba o servidor de desenvolvimento em http://127.0.0.1:8087 com APP_DEBUG=true
 *        php -S 127.0.0.1:8087 -t public
 *   2. Tenha o jsdom disponível (npm i -D jsdom) OU aponte para uma instalação existente:
 *        JSDOM_PATH=/caminho/para/node_modules/jsdom node tools/testes-seguranca.js
 *   3. node tools/testes-seguranca.js
 *
 * Variáveis opcionais: R4_BASE (padrão http://127.0.0.1:8087), JSDOM_PATH, R4_ROOT (raiz do projeto).
 * Saída: uma linha "PASSOU"/"FALHOU" por caso; código de saída 1 se algum caso falhar
 * (2 se o ambiente não estiver pronto). Nenhum arquivo do projeto é alterado.
 *
 * O que é testado (payloads reais): <img src=x onerror=...>, <script>, "><svg onload=...>,
 * javascript:, __proto__/constructor, =HYPERLINK(...)/@SUM(...), CSV com aspas quebradas,
 * valores gigantes, regex catastrófico (a+)+$, XLSX com DOCTYPE / zip bomb / células demais,
 * JSON malicioso no localStorage do tema, hash da vitrine, cabeçalhos da API de teste e do nginx.
 * Observação: o jsdom não carrega imagens, então "onerror" nunca dispararia de verdade; por isso,
 * além de conferir window.__pwn e alert(), os testes procuram no DOM qualquer elemento/atributo
 * ATIVO (script, on*, javascript:) — se o payload virou HTML, o teste falha mesmo sem execução.
 * ============================================
 */
'use strict';
const path = require('path');
const fs = require('fs');
const zlib = require('zlib');

let jsdom;
try { jsdom = require(process.env.JSDOM_PATH || 'jsdom'); }
catch (e) {
  console.error('jsdom não encontrado. Instale com "npm i -D jsdom" ou defina JSDOM_PATH=/caminho/node_modules/jsdom');
  process.exit(2);
}
const { JSDOM, VirtualConsole } = jsdom;
const BASE = (process.env.R4_BASE || 'http://127.0.0.1:8087').replace(/\/$/, '');
const ROOT = process.env.R4_ROOT || path.resolve(__dirname, '..');   // raiz do projeto (padrão: pasta acima de tools/)
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ---------------- placar ---------------- */
const results = [];
function check(name, ok, detail) {
  results.push({ name, ok: !!ok });
  console.log((ok ? 'PASSOU' : 'FALHOU') + '  ' + name + (!ok && detail ? '\n        -> ' + String(detail).slice(0, 400) : ''));
}
let limpar = null;   // remove o que o caso deixou na página (caixas, avisos, menus)
async function caso(name, fn) {
  try { await fn(); } catch (e) { check(name, false, 'exceção: ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : e)); }
  try { limpar && limpar(name); } catch (e) { /* ignora */ }
}
const pwnLog = [];   // casos em que window.__pwn foi definido (payload executou)

/* ---------------- payloads ---------------- */
const P_IMG = '<img src=x onerror=window.__pwn=1>';
const P_SCRIPT = '<script>window.__pwn=1</script>';
const P_SVG = '"><svg onload=window.__pwn=1>';
const P_JS = 'javascript:window.__pwn=1';

/** Elementos/atributos ativos dentro de `root` (o que um XSS precisaria para rodar). */
function active(root) {
  const out = [];
  const all = [root, ...root.querySelectorAll('*')];
  for (const n of all) {
    if (!n.attributes) continue;
    const tag = n.localName;
    // os <script src="/libr4/..."> e "/showcase/..." da própria vitrine não contam
    if (tag === 'script' && /^(https?:\/\/[^/]+)?\/(libr4|showcase)\//.test(n.getAttribute('src') || '')) continue;
    if (['script', 'object', 'embed', 'base'].includes(tag)) out.push('<' + tag + '>');
    if (tag === 'iframe' && !n.hasAttribute('sandbox')) out.push('<iframe> sem sandbox');
    for (const a of n.attributes) {
      if (/^on/i.test(a.name)) out.push(tag + '[' + a.name + ']');
      if (/^(href|src|action|formaction|xlink:href|data)$/i.test(a.name) && /^\s*(javascript|vbscript|data:text\/html)/i.test(a.value.replace(/[\u0000- ]/g, ''))) out.push(tag + '[' + a.name + '=' + a.value + ']');
    }
  }
  return out;
}

/* ---------------- abrir páginas ---------------- */
function vc(logs) {
  const v = new VirtualConsole();
  v.on('warn', m => logs.warn.push(String(m)));
  v.on('error', m => logs.error.push(String(m)));
  v.on('jsdomError', e => logs.jsdom.push(e.message));
  return v;
}
function prepWindow(w, logs, extra) {
  w.__alerts = 0;
  w.alert = w.confirm = w.prompt = () => { w.__alerts++; return null; };
  w.__evals = [];
  const realEval = w.eval;
  w.eval = function (s) { w.__evals.push(String(s)); return realEval(s); };
  w.__fetchLog = [];
  w.__mock = {};   // pathname -> { status, body } (resposta simulada de servidor "comprometido")
  w.fetch = async (u, o) => {
    const url = new URL(String(u), w.location.href);
    w.__fetchLog.push({ url: url.href, opts: o || {} });
    const m = w.__mock[url.pathname] || (url.origin !== new URL(BASE).origin ? { status: 200, body: [] } : null);
    if (m) {
      const text = typeof m.body === 'string' ? m.body : JSON.stringify(m.body);
      return { ok: m.status >= 200 && m.status < 300, status: m.status, headers: { get: () => 'application/json' },
        text: async () => text, json: async () => JSON.parse(text) };
    }
    return fetch(url, o);
  };
  w.structuredClone = w.structuredClone || structuredClone;
  if (!w.crypto || !w.crypto.subtle) Object.defineProperty(w, 'crypto', { value: require('crypto').webcrypto, configurable: true });
  w.TextEncoder = TextEncoder; w.TextDecoder = TextDecoder;
  if (typeof DecompressionStream !== 'undefined') w.DecompressionStream = DecompressionStream;
  if (!w.URL.createObjectURL) { w.URL.createObjectURL = () => 'blob:' + w.location.origin + '/teste'; w.URL.revokeObjectURL = () => {}; }
  extra && extra(w);
}
async function openPage(p, { wait = 1800, before } = {}) {
  const logs = { warn: [], error: [], jsdom: [] };
  const dom = await JSDOM.fromURL(BASE + p, {
    runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true, virtualConsole: vc(logs),
    beforeParse: w => prepWindow(w, logs, before)
  });
  await sleep(wait);
  return { w: dom.window, d: dom.window.document, logs, close: () => dom.window.close() };
}
/** Página "de produção" (outra origem, sem a vitrine) com os arquivos da lib embutidos. */
function openLocal(url, files, before) {
  const logs = { warn: [], error: [], jsdom: [] };
  const code = files.map(f => fs.readFileSync(path.join(ROOT, 'public/libr4', f), 'utf8').replace(/<\/script/gi, '<\\/script'));
  const html = '<!doctype html><html><head></head><body>' + code.map(c => '<script>' + c + '</script>').join('') + '</body></html>';
  const dom = new JSDOM(html, { url, runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc(logs),
    beforeParse: w => prepWindow(w, logs, before) });
  return { w: dom.window, d: dom.window.document, logs, close: () => dom.window.close() };
}

/* ---------------- ZIP (para montar XLSX maliciosos) ---------------- */
function crc32(b) {
  let c = ~0;
  for (let i = 0; i < b.length; i++) { c ^= b[i]; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; }
  return (~c) >>> 0;
}
function zipBuild(entries) {   // [{name, data(Buffer|string), deflate}]
  const parts = [], central = []; let off = 0;
  for (const e of entries) {
    const name = Buffer.from(e.name), raw = Buffer.isBuffer(e.data) ? e.data : Buffer.from(e.data);
    const data = e.deflate ? zlib.deflateRawSync(raw, { level: 9 }) : raw, crc = crc32(raw);
    const h = Buffer.alloc(30);
    h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(0x0800, 6); h.writeUInt16LE(e.deflate ? 8 : 0, 8);
    h.writeUInt32LE(crc, 14); h.writeUInt32LE(data.length, 18); h.writeUInt32LE(raw.length, 22); h.writeUInt16LE(name.length, 26);
    parts.push(h, name, data);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x0800, 8); c.writeUInt16LE(e.deflate ? 8 : 0, 10);
    c.writeUInt32LE(crc, 16); c.writeUInt32LE(data.length, 20); c.writeUInt32LE(raw.length, 24); c.writeUInt16LE(name.length, 28); c.writeUInt32LE(off, 42);
    central.push(c, name);
    off += 30 + name.length + data.length;
  }
  const cd = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(off, 16);
  return new Uint8Array(Buffer.concat([...parts, cd, end]));
}
const NSX = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const XLSX_WB = '<?xml version="1.0"?><workbook xmlns="' + NSX + '" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="P" sheetId="1" r:id="rId1"/></sheets></workbook>';
const xlsx = (sheet, extra = [], opts = {}) => zipBuild([
  { name: 'xl/workbook.xml', data: opts.wb || XLSX_WB },
  { name: 'xl/worksheets/sheet1.xml', data: sheet, deflate: !!opts.deflate },
  ...extra
]);

/* ================================================================== */
(async () => {
  try { await fetch(BASE + '/vitrine'); }
  catch (e) { console.error('Servidor fora do ar em ' + BASE + ' (suba com: php -S 127.0.0.1:8087 -t public)'); process.exit(2); }

  /* ===================== 1. página da vitrine (lib completa) ===================== */
  const pg = await openPage('/vitrine#__nada');
  const { w, d } = pg, R4 = w.R4;
  const box = () => { const b = d.createElement('div'); b.className = 'sec-box'; d.body.append(b); return b; };
  const tick = () => sleep(60);
  limpar = name => {
    if (w.__pwn !== undefined) { pwnLog.push(name); w.__pwn = undefined; }
    d.querySelectorAll('.sec-box').forEach(b => { b.querySelectorAll('*').forEach(n => { if (n._r4) try { n._r4.destroy(); } catch (e) { /* */ } }); b.remove(); });
    R4.notify && R4.notify.closeAll && R4.notify.closeAll();
    d.querySelectorAll('.r4-mask, .r4-toast, .r4-dd-menu, .r4-grid-menu, iframe.r4-print-frame').forEach(n => n.remove());
  };

  /* ---------- núcleo ---------- */
  await caso('core: R4.util.merge ignora __proto__/constructor (sem poluir Object.prototype)', async () => {
    R4.util.merge(new w.Object(), w.JSON.parse('{"__proto__":{"__pwnMerge":1},"constructor":{"prototype":{"__pwnMerge2":1}}}'));
    const ok = w.Object.prototype.__pwnMerge === undefined && w.Object.prototype.__pwnMerge2 === undefined && w.Function.prototype.__pwnMerge2 === undefined;
    delete w.Object.prototype.__pwnMerge; delete w.Object.prototype.__pwnMerge2; delete w.Object.prototype.constructor.prototype.__pwnMerge2;
    check('core: R4.util.merge ignora __proto__/constructor (sem poluir Object.prototype)', ok);
  });
  await caso('core: config com __proto__/constructor/prototype (JSON) não troca o protótipo do componente', async () => {
    const b = box();
    const c = R4.create(w.JSON.parse('{"xtype":"panel","title":"ok","__proto__":{"build":null,"hidden":1},"constructor":"x","prototype":{"a":1}}'));
    c.render(b);
    const ok = c instanceof R4.registry.panel.cls && c.constructor !== 'x' && !Object.prototype.hasOwnProperty.call(c, 'prototype') && b.querySelector('.r4-panel');
    check('core: config com __proto__/constructor/prototype (JSON) não troca o protótipo do componente', ok, 'instanceof=' + (c instanceof R4.registry.panel.cls) + ' constructor=' + typeof c.constructor);
  });
  await caso('core: R4.util.el não cria handler inline (on*) nem href javascript:', async () => {
    const a = R4.util.el('a', { href: P_JS, onclick: 'window.__pwn=1', onmouseover: 'window.__pwn=1', text: 'x' });
    const img = R4.util.el('img', { src: ' java\nscript:alert(1)' });
    check('core: R4.util.el não cria handler inline (on*) nem href javascript:', !active(a).length && !active(img).length, active(a).concat(active(img)).join(', '));
  });
  await caso('core: domAttrs não aceita on*', async () => {
    const b = box();
    R4.create({ xtype: 'button', text: 'x', renderTo: b, domAttrs: { onclick: 'window.__pwn=1', 'data-ok': '1' } });
    check('core: domAttrs não aceita on*', !active(b).length && b.querySelector('[data-ok]'), active(b).join(', '));
  });
  await caso('core: R4.html escapa interpolação e R4.raw marca HTML confiável', async () => {
    const h = R4.html`<b class="x">${P_IMG}</b>${R4.raw('<i>ok</i>')}`;
    const ok = R4.util.isRaw(h) && String(h) === '<b class="x">' + R4.util.esc(P_IMG) + '</b><i>ok</i>';
    check('core: R4.html escapa interpolação e R4.raw marca HTML confiável', ok, String(h));
  });

  /* ---------- r4-click / declarativo ---------- */
  await caso('declarativo: goto:javascript: é bloqueado', async () => {
    const b = box();
    const before = pg.logs.warn.length;
    b.innerHTML = '<button id="g1" r4-click="goto:' + P_JS + '">ir</button><button id="g2" r4-click="goto:  JaVa\tScRiPt:window.__pwn=1">ir</button><button id="g3" r4-click="goto:data:text/html,<script>window.__pwn=1</script>">ir</button>';
    b.querySelector('#g1').click(); b.querySelector('#g2').click(); b.querySelector('#g3').click();
    await tick();
    const warned = pg.logs.warn.slice(before).filter(m => /goto/i.test(m)).length;
    check('declarativo: goto:javascript: é bloqueado', w.__pwn === undefined && warned >= 3, 'pwn=' + w.__pwn + ' avisos=' + warned + ' jsdom=' + pg.logs.jsdom.slice(-2).join(' | '));
  });
  await caso('declarativo: goto:#âncora/relativa continua funcionando', async () => {
    const b = box();
    b.innerHTML = '<a id="g4" href="#" r4-click="goto:#__nada">ir</a>';
    b.querySelector('#g4').click(); await tick();
    check('declarativo: goto:#âncora/relativa continua funcionando', w.location.hash === '#__nada' && R4.util.safeUrl('/clientes?id=1') === '/clientes?id=1' && R4.util.safeUrl('https://a.b/x') === 'https://a.b/x' && R4.util.safeUrl(P_JS) === '');
  });
  await caso('declarativo: alert:/toast:/notify: com HTML viram texto', async () => {
    const b = box();
    b.innerHTML = '<button id="a1" r4-click="alert:' + R4.util.esc(P_IMG) + '">a</button><button id="a2" r4-click="toast:' + R4.util.esc(P_SCRIPT) + '">b</button><button id="a3" r4-click="notify:err|' + R4.util.esc(P_SVG) + '">c</button>';
    ['a1', 'a2', 'a3'].forEach(i => b.querySelector('#' + i).click()); await tick();
    const bad = active(d.body);
    const win = [...d.querySelectorAll('.r4-window')].pop();
    check('declarativo: alert:/toast:/notify: com HTML viram texto', !bad.length && win && win.textContent.includes('<img'), bad.join(', '));
    win && win.querySelector('.r4-tool') && win.querySelector('.r4-tool').click();
  });
  await caso('declarativo: r4-ignore desliga tags e ações em conteúdo de usuário', async () => {
    const b = box();
    b.innerHTML = '<div r4-ignore><r4-panel title="x" html="' + R4.util.esc(P_IMG) + '"></r4-panel><button id="ig" r4-click="goto:#ignorado">x</button></div>';
    await tick(); R4.scan(b);
    b.querySelector('#ig').click(); await tick();
    check('declarativo: r4-ignore desliga tags e ações em conteúdo de usuário', !b.querySelector('.r4-panel') && !active(b).length && w.location.hash !== '#ignorado');
  });

  /* ---------- grid ---------- */
  await caso('grid: renderer que devolve string é texto (payload não vira HTML)', async () => {
    const b = box();
    const g = R4.create({ xtype: 'grid', renderTo: b, data: [{ n: P_IMG, m: P_SCRIPT }], columns: [{ header: 'N', dataIndex: 'n', renderer: v => v }, { header: 'M', dataIndex: 'm', renderer: v => '<b>' + v + '</b>' }] });
    const td = b.querySelector('tbody td:not(.r4-vspace):not(.r4-empty)');
    check('grid: renderer que devolve string é texto (payload não vira HTML)', !active(b).length && !b.querySelector('tbody img, tbody b') && td.textContent === P_IMG, active(b).join(', '));
    g.destroy();
  });
  await caso('grid: renderer com R4.html escapa dados e mantém o HTML do autor', async () => {
    const b = box();
    R4.create({ xtype: 'grid', renderTo: b, data: [{ n: P_IMG }], columns: [{ header: 'N', dataIndex: 'n', renderer: v => R4.html`<b class="ok">${v}</b>` }] });
    const bb = b.querySelector('tbody b.ok');
    check('grid: renderer com R4.html escapa dados e mantém o HTML do autor', bb && bb.textContent === P_IMG && !active(b).length);
  });
  await caso('grid: cabeçalho, emptyText, erro do servidor, rodapé e filtros só como texto', async () => {
    const b = box();
    w.__mock['/mock/grid-erro'] = { status: 500, body: { status: 500, retorno: P_IMG } };
    const g = R4.create({ xtype: 'grid', renderTo: b, src: '/mock/grid-erro', emptyText: P_SVG, errorText: P_SCRIPT, summaryLabel: P_IMG, exportable: true, columnMenu: true,
      columns: [{ header: P_IMG, dataIndex: 'v', summary: 'sum' }] });
    await sleep(120);
    g.setFilter(P_IMG);
    check('grid: cabeçalho, emptyText, erro do servidor, rodapé e filtros só como texto', !active(b).length && b.textContent.includes('<img'), active(b).join(', '));
  });
  await caso('grid: ação com {campo} não injeta javascript: nem encadeia ações', async () => {
    const b = box();
    R4.create({ xtype: 'grid', renderTo: b, data: [{ url: P_JS, nome: 'x;goto:' + P_JS }], columns: [{ header: 'A', actions: [
      { text: 'Abrir', 'r4-click': 'goto:{url}' }, { text: 'Toast', 'r4-click': 'toast:{nome}' }] }] });
    const btns = b.querySelectorAll('.r4-grid-act');
    btns[0].click(); btns[1].click(); await tick();
    check('grid: ação com {campo} não injeta javascript: nem encadeia ações', w.__pwn === undefined && !btns[1].getAttribute('r4-click').includes(';'));
  });
  await caso('grid: impressão (srcdoc) escapa dados e usa iframe com sandbox', async () => {
    const b = box();
    const g = R4.create({ xtype: 'grid', renderTo: b, data: [{ n: P_IMG }], columns: [{ header: P_SCRIPT, dataIndex: 'n' }] });
    const html = g._printHtml(P_SVG);
    g.print(); await tick();
    const f = d.querySelector('iframe.r4-print-frame');
    const ok = !/<img|<script|<svg/i.test(html) && f && f.getAttribute('sandbox') !== null && !/allow-scripts/.test(f.getAttribute('sandbox'));
    check('grid: impressão (srcdoc) escapa dados e usa iframe com sandbox', ok, 'sandbox=' + (f && f.getAttribute('sandbox')));
    g.destroy();
  });

  /* ---------- rede ---------- */
  await caso('rede: src/action com javascript:/data: são recusados', async () => {
    let n = 0;
    for (const u of [P_JS, 'data:application/json,[1]', 'vbscript:x']) { try { await R4.http.get(u); } catch (e) { n++; } }
    check('rede: src/action com javascript:/data: são recusados', n === 3, 'recusados=' + n);
  });
  await caso('rede: outra origem gera aviso; strictOrigins bloqueia; credentials same-origin', async () => {
    const before = pg.logs.warn.length;
    await R4.http.get('https://evil.example/api');
    const warned = pg.logs.warn.slice(before).some(m => /origem/i.test(m));
    R4.config.strictOrigins = true;
    let blocked = false; try { await R4.http.get('https://evil2.example/api'); } catch (e) { blocked = true; }
    R4.config.strictOrigins = false;
    const last = w.__fetchLog.filter(x => x.url.includes('evil.example')).pop();
    check('rede: outra origem gera aviso; strictOrigins bloqueia; credentials same-origin', warned && blocked && last && last.opts.credentials === 'same-origin', 'aviso=' + warned + ' bloqueou=' + blocked + ' cred=' + (last && last.opts.credentials));
  });
  await caso('rede: grid/form com src/action de outra origem respeitam strictOrigins', async () => {
    R4.config.strictOrigins = true;
    const n0 = w.__fetchLog.length;
    const b = box();
    R4.create({ xtype: 'grid', renderTo: b, src: 'https://evil3.example/dados' });
    const f = R4.create({ xtype: 'form', renderTo: b, action: 'https://evil3.example/salvar', fields: [{ type: 'text', name: 'a' }] });
    await sleep(80); await f.submit();
    R4.config.strictOrigins = false;
    check('rede: grid/form com src/action de outra origem respeitam strictOrigins', !w.__fetchLog.slice(n0).some(x => x.url.includes('evil3')));
  });

  /* ---------- ui ---------- */
  await caso('ui: timeline com src (JSON de API) não aceita campo html', async () => {
    const b = box();
    w.__mock['/mock/eventos'] = { status: 200, body: [{ titulo: P_IMG, descricao: P_SCRIPT, html: P_IMG, data: '2026-01-01' }, { title: 'b', html: '<b>x</b>' + P_SVG }] };
    R4.create({ xtype: 'timeline', renderTo: b, src: '/mock/eventos' });
    await sleep(120);
    check('ui: timeline com src (JSON de API) não aceita campo html', !active(b).length && !b.querySelector('.r4-tl img, .r4-tl b') && b.textContent.includes('<img'), active(b).join(', '));
  });
  await caso('ui: stat/stats/select/notify/tooltip/dropdown/breadcrumb/avatar com dados hostis', async () => {
    const b = box();
    w.__mock['/mock/kpis'] = { status: 200, body: [{ id: 'a', titulo: P_IMG, valor: P_SCRIPT, variacao: 5, formato: 'money', icone: P_SVG, variant: '"><x onclick=1>' }] };
    w.__mock['/mock/opcoes'] = { status: 200, body: [{ valor: '1', texto: P_IMG }, { value: P_SVG, text: P_SCRIPT }] };
    R4.create({ xtype: 'stats', renderTo: b, src: '/mock/kpis' });
    R4.create({ xtype: 'stat', renderTo: b, src: '/mock/kpis', key: 'a' });
    const s = R4.create({ xtype: 'select', renderTo: b, name: 's', src: '/mock/opcoes', searchable: true });
    R4.notify({ title: P_IMG, text: P_SCRIPT, icon: P_SVG });
    R4.create({ xtype: 'tooltip', renderTo: b, text: P_IMG });
    R4.create({ xtype: 'dropdown', renderTo: b, text: P_IMG, items: [{ text: P_IMG, href: P_JS }, { text: 'b', href: ' javascript:x' }] }).open();
    R4.create({ xtype: 'breadcrumb', renderTo: b, items: [{ text: P_IMG, href: P_JS }, 'fim'] });
    R4.create({ xtype: 'avatar', renderTo: b, name: P_IMG, src: P_JS });
    R4.create({ xtype: 'badge', renderTo: b, text: P_IMG });
    R4.create({ xtype: 'emptystate', renderTo: b, title: P_IMG, text: P_SCRIPT, actionText: P_SVG, actionClick: 'goto:' + P_JS }).btn.click();
    await sleep(150);
    s.open && s.open();
    const bad = active(d.body);
    check('ui: stat/stats/select/notify/tooltip/dropdown/breadcrumb/avatar com dados hostis', !bad.length && w.__pwn === undefined, bad.join(', '));
  });

  /* ---------- formulários ---------- */
  await caso('form: pattern catastrófico (a+)+$ não trava a página', async () => {
    const b = box();
    const f = R4.create({ xtype: 'textfield', renderTo: b, name: 'x', pattern: '(a+)+$' });
    f.setValue('a'.repeat(25) + '!');
    const t0 = Date.now(); f.validate(); const dt = Date.now() - t0;
    check('form: pattern catastrófico (a+)+$ não trava a página', dt < 250, 'levou ' + dt + 'ms');
  });
  await caso('form: anti-ReDoS recusa só padrões aninhados e mantém os legítimos', async () => {
    const b = box();
    const legit = [['[0-9]{3}', '123'], ['([0-9]{3}\\.){2}[0-9]{3}-[0-9]{2}', '123.456.789-09'], ['[A-Za-z ]+', 'Ana Maria'], ['(\\+55)?[0-9]{10,11}', '+5511999998888'], ['(ab|cd)+', 'abcd'], ['[(a+)+]+', 'a+(']];
    const perig = ['(\\w+\\s?)+$', '(a*)*', '(?:x+y)+', '(a+){2,}', '((ab)+c)*', '(.*a){12}'];
    const okL = legit.every(([p, v]) => { const f = R4.create({ xtype: 'textfield', renderTo: b, name: 'p', pattern: p }); f.setValue(v); return f.validate() === true; });
    const n0 = pg.logs.warn.length;
    perig.forEach(p => { const f = R4.create({ xtype: 'textfield', renderTo: b, name: 'q', pattern: p }); f.setValue('a'.repeat(30) + '!'); f.validate(); });
    const avisos = pg.logs.warn.slice(n0).filter(m => /ReDoS/.test(m)).length;
    check('form: anti-ReDoS recusa só padrões aninhados e mantém os legítimos', okL && avisos === perig.length, 'legítimos ok=' + okL + ' avisos=' + avisos + '/' + perig.length);
  });
  await caso('form: valor gigante não é testado contra o pattern (limite) e pattern normal funciona', async () => {
    const b = box();
    const f = R4.create({ xtype: 'textfield', renderTo: b, name: 'y', pattern: '[0-9]{3}' });
    f.setValue('12a'); const r1 = f.validate();
    f.setValue('123'); const r2 = f.validate();
    const g = R4.create({ xtype: 'textfield', renderTo: b, name: 'z', pattern: '[a-z]+' });
    g.setValue('a'.repeat(2e6)); const t0 = Date.now(); const r3 = g.validate(); const dt = Date.now() - t0;
    check('form: valor gigante não é testado contra o pattern (limite) e pattern normal funciona', r1 === false && r2 === true && r3 === false && dt < 250, 'r1=' + r1 + ' r2=' + r2 + ' r3=' + r3 + ' ' + dt + 'ms');
  });
  await caso('form: mensagens de erro do servidor viram texto', async () => {
    const b = box();
    w.__mock['/mock/form'] = { status: 422, body: { status: 422, mensagem: P_IMG, erros: { nome: P_SCRIPT, outro: P_SVG } } };
    const f = R4.create({ xtype: 'form', renderTo: b, action: '/mock/form', fields: [{ type: 'text', name: 'nome', label: P_IMG, helpText: P_SVG }] });
    await f.submit();
    check('form: mensagens de erro do servidor viram texto', !active(b).length && b.textContent.includes('<script>'), active(b).join(', '));
  });

  /* ---------- arquivos ---------- */
  await caso('files: toCSV neutraliza fórmulas (=, +, -, @, TAB, CR) e preserva números', async () => {
    const csv = R4.files.toCSV([{ a: '=HYPERLINK("http://evil","x")' }, { a: '@SUM(1+1)' }, { a: '+1+1' }, { a: '-2+3' }, { a: '\t=1' }, { a: '\r=1' }, { a: -5 }, { a: '-5' }],
      { bom: false, columns: [{ key: 'a', header: '=cmd|x' }] });
    const cells = R4.files.parseCSV(csv, { header: false, delimiter: ';' }).map(r => r[0]);
    const ok = cells[0] === "'=cmd|x" && cells.slice(1, 7).every(c => c[0] === "'") && cells[7] === '-5' && cells[8] === '-5';
    check('files: toCSV neutraliza fórmulas (=, +, -, @, TAB, CR) e preserva números', ok, JSON.stringify(cells));
  });
  await caso('files: toXLSX grava texto (nunca <f>)', async () => {
    const z = R4.files.toXLSX([{ a: '=1+1', b: '@SUM(A1)' }], { bytes: true });
    const s = Buffer.from(z).toString('latin1');
    check('files: toXLSX grava texto (nunca <f>)', !/<f[ >]/.test(s) && s.includes('=1+1'));
  });
  await caso('files: parseCSV com __proto__/constructor não polui protótipos', async () => {
    const rows = R4.files.parseCSV('__proto__;constructor;prototype\n{"x":1};a;b', { delimiter: ';' });
    const r = rows[0];
    const ok = w.Object.prototype.x === undefined && Object.getPrototypeOf(r) === w.Object.prototype && r.constructor === 'a' && Object.keys(r).includes('__proto__');
    check('files: parseCSV com __proto__/constructor não polui protótipos', ok);
  });
  await caso('files: CSV com aspas quebradas e arquivo grande terminam rápido', async () => {
    const r1 = R4.files.parseCSV('a;b\n"x;y\n1;2', { delimiter: ';' });
    const big = 'a;b;c\n' + Array.from({ length: 200000 }, (_, i) => i + ';"t""' + i + '";' + (i % 7)).join('\n');
    const t0 = Date.now(); const r2 = R4.files.parseCSV(big); const dt = Date.now() - t0;
    check('files: CSV com aspas quebradas e arquivo grande terminam rápido', r1.length === 1 && r2.length === 200000 && dt < 5000, dt + 'ms');
  });
  await caso('files: XLSX com DOCTYPE/entidades é recusado', async () => {
    const z = xlsx('<worksheet xmlns="' + NSX + '"><sheetData/></worksheet>', [], { wb: '<?xml version="1.0"?><!DOCTYPE x [<!ENTITY a "aaaaaaaaaa"><!ENTITY b "&a;&a;&a;&a;&a;">]><workbook xmlns="' + NSX + '"><sheets><sheet name="&b;" sheetId="1"/></sheets></workbook>' });
    let msg = ''; try { await R4.files.parseXLSX(z); } catch (e) { msg = e.message; }
    check('files: XLSX com DOCTYPE/entidades é recusado', /DOCTYPE/.test(msg), msg);
  });
  await caso('files: XLSX "zip bomb" passa do limite descompactado e é recusado', async () => {
    const sheet = '<worksheet xmlns="' + NSX + '"><sheetData>' + ' '.repeat(3 * 1024 * 1024) + '</sheetData></worksheet>';
    const z = xlsx(sheet, [], { deflate: true });
    let msg = ''; try { await R4.files.parseXLSX(z, { maxUncompressed: 1024 * 1024 }); } catch (e) { msg = e.message; }
    check('files: XLSX "zip bomb" passa do limite descompactado e é recusado', z.length < 64 * 1024 && /limite/i.test(msg), 'zip=' + z.length + 'B msg=' + msg);
  });
  await caso('files: XLSX com células esparsas demais (XFD em cada linha) é recusado', async () => {
    let rows = '';
    for (let i = 1; i <= 1000; i++) rows += '<row r="' + i + '"><c r="XFD' + i + '"><v>1</v></c></row>';
    const z = xlsx('<worksheet xmlns="' + NSX + '"><sheetData>' + rows + '</sheetData></worksheet>', [], { deflate: true });
    let msg = '', n = -1; try { n = (await R4.files.parseXLSX(z, { header: false })).length; } catch (e) { msg = e.message; }
    check('files: XLSX com células esparsas demais (XFD em cada linha) é recusado', /c[ée]lulas/i.test(msg), 'linhas=' + n + ' msg=' + msg);
  });
  await caso('files: XLSX com caminho ../ no rels não lê nada fora do pacote', async () => {
    const rels = '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="x" Target="../../../../etc/passwd"/></Relationships>';
    const z = xlsx('<worksheet xmlns="' + NSX + '"><sheetData/></worksheet>', [{ name: 'xl/_rels/workbook.xml.rels', data: rels }]);
    let msg = ''; try { await R4.files.parseXLSX(z); } catch (e) { msg = e.message; }
    check('files: XLSX com caminho ../ no rels não lê nada fora do pacote', /falta|inválid/i.test(msg), msg);
  });
  await caso('files: download saneia o nome (caminho, controle, bidi RLO)', async () => {
    let name = null;
    const orig = w.HTMLAnchorElement.prototype.click;
    w.HTMLAnchorElement.prototype.click = function () { name = this.getAttribute('download'); };
    R4.files.download('x', '..\\..\\evil‮txt.exe/../a\u0000b.csv');
    w.HTMLAnchorElement.prototype.click = orig;
    check('files: download saneia o nome (caminho, controle, bidi RLO)', name && !/[\\/\u0000‮]/.test(name) && !name.startsWith('.'), JSON.stringify(name));
  });
  await caso('files: filedrop valida extensão e mostra nome hostil como texto', async () => {
    const b = box();
    const fd = R4.create({ xtype: 'filedrop', renderTo: b, accept: '.csv', multiple: true });
    let inval = [];
    fd.on('invalid', (c, e) => { inval = e; });
    await fd.add([new w.File(['a'], P_IMG + '.csv', { type: 'text/csv' }), new w.File(['MZ'], 'nota.csv.exe'), new w.File(['MZ'], 'x.exe', { type: 'text/csv' })]);
    check('files: filedrop valida extensão e mostra nome hostil como texto', fd.getFiles().length === 1 && inval.length === 2 && !active(b).length, 'aceitos=' + fd.getFiles().length + ' inval=' + inval.length);
  });

  /* ---------- gráficos ---------- */
  await caso('chart: rótulos/título hostis só como texto; cores com url()/image-set() recusadas', async () => {
    const b = box();
    const c = R4.create({ xtype: 'chart', renderTo: b, type: 'bar', title: P_SCRIPT, x: 'mes', y: 'v,w',
      data: [{ mes: P_IMG, v: 1, w: 2 }, { mes: P_SVG, v: 2, w: 1 }],
      series: [{ key: 'v', label: P_IMG, color: 'image-set("https://evil.example/y.png" 1x)' }, { key: 'w', label: 'w', color: 'red;background:url(https://evil.example/x)' }] });
    const p = R4.create({ xtype: 'chart', renderTo: b, type: 'pie', x: 'k', y: 'v', data: [{ k: P_IMG, v: 1 }, { k: 'b', v: 2 }], colors: ['url(https://evil.example/z)', 'cross-fade(url(a),url(b))'] });
    const styles = [...b.querySelectorAll('[style]')].map(e => e.getAttribute('style')).join(' ');
    // exportSVG: o SVG gerado é reaberto como documento e não pode ter nada ativo
    const docs = [c.getSVG(), p.getSVG()].map(s => new w.DOMParser().parseFromString(s, 'image/svg+xml').documentElement);
    const svgBad = docs.flatMap(x => active(x)).concat(docs.some(x => x.localName !== 'svg') ? ['svg inválido'] : []);
    const ok = !active(b).length && !/evil|image-set|cross-fade|url\(/i.test(styles) && !svgBad.length && docs[0].textContent.includes(P_IMG) && docs[0].textContent.includes(P_SCRIPT);
    check('chart: rótulos/título hostis só como texto; cores com url()/image-set() recusadas', ok, 'ativos=' + active(b).join(',') + ' svg=' + svgBad.join(',') + ' estilos=' + (styles.match(/[^ ]*(evil|image-set|url\()[^ ]*/i) || [''])[0]);
  });

  /* ---------- tema ---------- */
  await caso('theme: set() recusa injeção de CSS (cor, fonte, raio, densidade) e preset __proto__', async () => {
    R4.theme.set({ primary: 'red;}body{display:none', font: 'x;}*{display:none', radius: '5px;}*{x:y}', density: '__proto__', mode: 'dark;}' });
    R4.theme.set({ preset: '__proto__' }); R4.theme.preset('constructor');
    const css = (d.getElementById('r4-theme') || {}).textContent || '';
    const st = R4.theme.get();
    check('theme: set() recusa injeção de CSS (cor, fonte, raio, densidade) e preset __proto__', !/display:none|\*\{|x:y/.test(css) && st.preset !== '__proto__' && st.preset !== 'constructor', css.slice(0, 200) + ' preset=' + st.preset);
    R4.theme.reset();
  });
  await caso('i18n: params com HTML viram texto; r4-i18n não escreve on*/href; add() sem poluição', async () => {
    const b = box();
    R4.i18n.add('pt-BR', w.JSON.parse('{"sec":{"ola":"Olá {nome}"},"__proto__":{"pwnI18n":"1"}}'));
    b.innerHTML = '<p><r4-t key="sec.ola" params=\'' + JSON.stringify({ nome: P_IMG }).replace(/'/g, '&#39;') + '\'></r4-t></p><a id="i1" r4-i18n="onclick:sec.ola;href:sec.ola;title:sec.ola">x</a>';
    R4.i18n.bind(b); await tick();
    const a = b.querySelector('#i1');
    check('i18n: params com HTML viram texto; r4-i18n não escreve on*/href; add() sem poluição',
      !active(b).length && b.querySelector('r4-t').textContent === 'Olá ' + P_IMG && !a.hasAttribute('onclick') && !a.hasAttribute('href') && a.title === 'Olá {nome}' && w.Object.prototype.pwnI18n === undefined);
  });

  /* ---------- vitrine ---------- */
  await caso('vitrine: nenhum alert/eval de dados e window.__pwn indefinido nesta página', async () => {
    check('vitrine: nenhum alert/eval de dados e window.__pwn indefinido nesta página', !pwnLog.length && w.__pwn === undefined && w.__alerts === 0 && !w.__evals.some(s => s.includes('__pwn')),
      'alerts=' + w.__alerts + ' __pwn definido em: ' + pwnLog.join(' ; '));
  });
  pg.close();

  for (const h of [encodeURIComponent(P_IMG), P_IMG, P_SVG, 'grid"><img src=x onerror=window.__pwn=1>', "');window.__pwn=1;('"]) {
    await caso('vitrine: hash hostil não executa (' + h.slice(0, 24) + '...)', async () => {
      const v = await openPage('/vitrine#' + h, { wait: 1500 });
      v.w.location.hash = h; v.w.dispatchEvent(new v.w.HashChangeEvent('hashchange')); await sleep(300);
      const bad = active(v.d.body);
      check('vitrine: hash hostil não executa (' + h.slice(0, 24) + '...)', !bad.length && v.w.__pwn === undefined && v.w.__alerts === 0 && !v.w.__evals.some(s => s.includes('__pwn')), bad.join(', '));
      v.close();
    });
  }

  await caso('theme: JSON malicioso no localStorage é descartado ao carregar', async () => {
    const v = await openPage('/vitrine#__nada', { wait: 1500, before: w2 => {
      w2.localStorage.setItem('r4-theme', '{"mode":"dark","primary":"red;}*{display:none}","font":"a}*{x:y","radius":"1;}","__proto__":{"pwnTheme":1}}');
      w2.localStorage.setItem('r4-locale', 'en"><img src=x onerror=1>');
    } });
    const css = (v.d.getElementById('r4-theme') || {}).textContent || '';
    const ok = !/display:none|\*\{|x:y/.test(css) && v.w.Object.prototype.pwnTheme === undefined && v.logs.error.length === 0 && v.logs.jsdom.length === 0 && v.d.documentElement.lang !== 'en"><img src=x onerror=1>';
    check('theme: JSON malicioso no localStorage é descartado ao carregar', ok, css.slice(0, 160) + ' erros=' + v.logs.error.concat(v.logs.jsdom).join(' | '));
    v.close();
  });

  /* ===================== 2. página de "produção" (outra origem) ===================== */
  await caso('crypto: chave vazia fora de localhost é recusada', async () => {
    const p = openLocal('https://app.exemplo.com/', ['core.js', 'net.js'], w2 => { w2.BASE_CRIPTOGRAFIA = ''; });
    let msg = ''; try { await p.w.R4.crypto.encrypt({ a: 1 }); } catch (e) { msg = e.message; }
    let msg2 = ''; try { await p.w.R4.http.post('/x', { a: 1 }); } catch (e) { msg2 = e.message; }
    check('crypto: chave vazia fora de localhost é recusada', /chave/i.test(msg) && /chave/i.test(msg2) && p.w.__fetchLog.length === 0, 'encrypt="' + msg + '" post="' + msg2 + '" fetches=' + p.w.__fetchLog.length);
    p.close();
  });
  await caso('crypto: chave vazia em localhost só avisa', async () => {
    const p = openLocal('http://localhost:8087/', ['core.js', 'net.js'], w2 => { w2.BASE_CRIPTOGRAFIA = ''; });
    const pack = await p.w.R4.crypto.encrypt({ a: 1 });
    check('crypto: chave vazia em localhost só avisa', pack && pack.x && p.logs.warn.some(m => /chave/i.test(m)));
    p.close();
  });
  await caso('crypto: AES-GCM com salt/IV novos a cada mensagem; adulteração → null', async () => {
    const p = openLocal('https://app.exemplo.com/', ['core.js', 'net.js'], w2 => { w2.BASE_CRIPTOGRAFIA = 'segredo-de-teste'; });
    const C = p.w.R4.crypto;
    const a = await C.encrypt({ v: 1 }), b = await C.encrypt({ v: 1 });
    const back = await C.decrypt(a);
    const raw = Buffer.from(a.x, 'base64'); raw[0] ^= 1;
    const bad = await C.decrypt({ x: raw.toString('base64'), y: a.y, z: a.z });
    const ivLen = Buffer.from(a.z, 'base64').length, saltLen = Buffer.from(a.y, 'base64').length;
    check('crypto: AES-GCM com salt/IV novos a cada mensagem; adulteração → null', back && back.v === 1 && a.z !== b.z && a.y !== b.y && ivLen === 12 && saltLen === 16 && bad === null);
    p.close();
  });

  /* ===================== 3. API de teste (PHP) e configuração ===================== */
  await caso('api: cabeçalhos nosniff + no-store nas rotas de teste', async () => {
    const r = await fetch(BASE + '/vitrine/api/clientes?page=1&size=2');
    check('api: cabeçalhos nosniff + no-store nas rotas de teste', r.headers.get('x-content-type-options') === 'nosniff' && /no-store/.test(r.headers.get('cache-control') || ''), r.headers.get('x-content-type-options') + ' | ' + r.headers.get('cache-control'));
  });
  await caso('api: parâmetros em forma de array não geram aviso PHP/caminho', async () => {
    const r = await fetch(BASE + '/vitrine/api/clientes?q[]=a&sort[]=b&dir[]=c&status[]=x&size[]=1');
    const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch (e) { /* */ }
    check('api: parâmetros em forma de array não geram aviso PHP/caminho', r.status === 200 && j && !/Warning|Deprecated|Notice|\.php|Stack trace/i.test(t), t.slice(0, 200));
  });
  await caso('api: ordenação por campo inexistente/__proto__ e limites de size/page', async () => {
    const r = await fetch(BASE + '/vitrine/api/clientes?sort=__proto__&size=99999&page=-5');
    const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch (e) { /* */ }
    check('api: ordenação por campo inexistente/__proto__ e limites de size/page', j && j.size === 100 && j.page === 1 && !/\.php/.test(t), t.slice(0, 160));
  });
  await caso('api: corpo grande demais → 413', async () => {
    const r = await fetch(BASE + '/vitrine/api/echo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ a: 'x'.repeat(2 * 1024 * 1024) }) });
    check('api: corpo grande demais → 413', r.status === 413, 'status=' + r.status);
  });
  await caso('api: pacote cifrado malformado → 400 JSON sem stack trace', async () => {
    const r = await fetch(BASE + '/vitrine/api/echo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"x":["a"],"y":{"b":1},"z":3}' });
    const t = await r.text();
    check('api: pacote cifrado malformado → 400 JSON sem stack trace', r.status === 400 && !/\.php|Stack trace|Fatal/i.test(t), r.status + ' ' + t.slice(0, 200));
  });
  await caso('api: eco não reflete < > crus (JSON_HEX_TAG) e é application/json', async () => {
    const r = await fetch(BASE + '/vitrine/api/echo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ t: '</script>' + P_IMG }) });
    const t = await r.text();
    check('api: eco não reflete < > crus (JSON_HEX_TAG) e é application/json', !/[<>]/.test(t) && /application\/json/.test(r.headers.get('content-type') || ''), t.slice(0, 200));
  });
  await caso('config: vitrine só com APP_DEBUG (controller) e nginx com CSP/Permissions-Policy', async () => {
    const ctl = fs.readFileSync(path.join(ROOT, 'src/Controllers/VitrineController.php'), 'utf8');
    const ng = fs.readFileSync(path.join(ROOT, 'docker/nginx/default.conf'), 'utf8');
    const csp = ng.match(/map \$request_uri \$r4_csp \{[\s\S]*?\}/);
    const ok = /APP_DEBUG\s*!==\s*true/.test(ctl) && /http_response_code\(404\)/.test(ctl) && csp && /Content-Security-Policy/.test(ng) && /Permissions-Policy/.test(ng)
      && /default\s+"[^"]*object-src 'none'/.test(csp[0]) && !/default\s+"[^"]*unsafe-eval/.test(csp[0]) && /vitrine[^\n]*unsafe-eval/.test(csp[0]);
    check('config: vitrine só com APP_DEBUG (controller) e nginx com CSP/Permissions-Policy', ok);
  });

  /* ---------------- resumo ---------------- */
  const fail = results.filter(r => !r.ok);
  console.log('\n' + (results.length - fail.length) + '/' + results.length + ' casos passaram' + (fail.length ? ' — FALHARAM: ' + fail.map(f => f.name).join(' ; ') : ''));
  process.exit(fail.length ? 1 : 0);
})().catch(e => { console.error('Erro inesperado:', e); process.exit(2); });
