#!/usr/bin/env node
/**
 * ============================================
 * tools/rodar-testes.js — executor de linha de comando dos testes da libr4 (opcional, só para dev)
 * ============================================
 * Node só para desenvolvimento; os testes em si rodam no navegador abrindo /vitrine/testes.
 * Este script abre a MESMA página (http://127.0.0.1:8087/vitrine/testes?auto=1) dentro do jsdom,
 * espera window.__R4_TESTS.done, imprime o resumo e as falhas e sai com código != 0 se algo falhou.
 *
 * Como rodar:
 *   1. Servidor de desenvolvimento com APP_DEBUG=true:   php -S 127.0.0.1:8087 -t public
 *   2. jsdom disponível (NÃO fica no repositório):       JSDOM_PATH=/caminho/node_modules/jsdom
 *   3. node tools/rodar-testes.js [suites] [--sem-lentas] [--verbose] [--json]
 *        suites          lista separada por vírgula (ex.: grid,form); padrão = todas
 *        --sem-lentas    pula a suíte lenta (regressão da vitrine)
 *        --verbose       imprime também cada teste que passou
 *        --json          imprime o resumo (window.__R4_TESTS) em JSON no fim
 *
 * Variáveis: R4_BASE (padrão http://127.0.0.1:8087), JSDOM_PATH, R4_TIMEOUT (segundos, padrão 600).
 * Saída: código 0 = tudo passou; 1 = há falhas; 2 = ambiente não está pronto; 3 = tempo esgotado.
 *
 * Limites do jsdom: não calcula layout (medidas = 0), não carrega imagens e não tem IntersectionObserver
 * nem ResizeObserver; testes que dependem de layout real são marcados PULADO aqui (t.needLayout()) e
 * só rodam de verdade no Chrome, abrindo /vitrine/testes. matchMedia é um stub mínimo (modo claro).
 * ============================================
 */
'use strict';
let jsdom;
try { jsdom = require(process.env.JSDOM_PATH || 'jsdom'); }
catch (e) {
  console.error('jsdom não encontrado. Use "npm i -D jsdom" fora do repositório ou defina JSDOM_PATH=/caminho/node_modules/jsdom');
  process.exit(2);
}
const { JSDOM, VirtualConsole } = jsdom;
const BASE = (process.env.R4_BASE || 'http://127.0.0.1:8087').replace(/\/$/, '');
const args = process.argv.slice(2);
const flag = f => args.includes(f);
const suites = args.find(a => !a.startsWith('--')) || '';
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  try { await fetch(BASE + '/vitrine/testes'); }
  catch (e) { console.error('Servidor fora do ar em ' + BASE + ' (suba com: php -S 127.0.0.1:8087 -t public, com APP_DEBUG=true)'); process.exit(2); }

  const logs = { error: [], jsdom: [] };
  const vc = new VirtualConsole();
  vc.on('error', m => logs.error.push(String(m)));
  vc.on('jsdomError', e => logs.jsdom.push(e.message + (e.detail && e.detail.stack ? ' @ ' + String(e.detail.stack).split('\n')[1] : '')));
  const url = BASE + '/vitrine/testes?auto=1' + (suites ? '&suite=' + encodeURIComponent(suites) : '') + (flag('--sem-lentas') ? '&slow=0' : '');
  const t0 = Date.now();
  const dom = await JSDOM.fromURL(url, {
    runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w) {
      w.alert = w.confirm = w.prompt = () => null;
      w.fetch = (u, o) => fetch(new URL(String(u), w.location.href), o);           // a página usa o fetch do Node, apontado ao servidor
      w.structuredClone = w.structuredClone || structuredClone;
      if (!w.crypto || !w.crypto.subtle) Object.defineProperty(w, 'crypto', { value: require('crypto').webcrypto, configurable: true });
      w.TextEncoder = TextEncoder; w.TextDecoder = TextDecoder;
      if (typeof DecompressionStream !== 'undefined') w.DecompressionStream = DecompressionStream;
      if (typeof CompressionStream !== 'undefined') w.CompressionStream = CompressionStream;
      if (!w.URL.createObjectURL) { w.URL.createObjectURL = () => 'blob:' + w.location.origin + '/teste'; w.URL.revokeObjectURL = () => {}; }
      if (!w.matchMedia) w.matchMedia = q => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
    }
  });
  const w = dom.window;
  const timeout = (+process.env.R4_TIMEOUT || 600) * 1000;
  let last = -1, peakRss = 0;
  for (;;) {
    await sleep(500);
    peakRss = Math.max(peakRss, process.memoryUsage().rss);
    const s = w.__R4_TESTS;
    if (s && s.done) break;
    if (s && s.total && s.total !== last && s.total % 50 === 0) { last = s.total; process.stderr.write('  ... ' + s.total + ' testes\r'); }
    if (Date.now() - t0 > timeout) { console.error('Tempo esgotado (' + timeout / 1000 + ' s) esperando window.__R4_TESTS.done'); process.exit(3); }
  }
  process.stderr.write('\r' + ' '.repeat(40) + '\r');   // apaga a linha de progresso
  const s = w.__R4_TESTS;
  const bySuite = {};
  s.results.forEach(r => { const b = bySuite[r.suite] || (bySuite[r.suite] = { ok: 0, fail: 0, skip: 0, known: 0, asserts: 0 }); b[r.status === 'pass' ? 'ok' : r.status === 'fail' ? 'fail' : r.status === 'known' ? 'known' : 'skip']++; b.asserts += r.asserts; });
  console.log('Suíte'.padEnd(14) + 'ok'.padStart(5) + 'falha'.padStart(7) + 'pulado'.padStart(8) + 'conhec.'.padStart(8) + 'asserções'.padStart(11));
  Object.keys(bySuite).forEach(n => { const b = bySuite[n]; console.log(n.padEnd(14) + String(b.ok).padStart(5) + String(b.fail).padStart(7) + String(b.skip).padStart(8) + String(b.known).padStart(8) + String(b.asserts).padStart(11)); });
  s.results.forEach(r => {
    if (r.status === 'pass' && flag('--verbose')) console.log('PASSOU  ' + r.suite + ' > ' + r.name + '  (' + r.asserts + ' asserções, ' + r.ms + ' ms)');
    if (r.status === 'skip') console.log('PULADO  ' + r.suite + ' > ' + r.name + '  -> ' + r.error);
  });
  s.results.filter(r => r.status === 'known').forEach(r => console.log('CONHECIDA  ' + r.suite + ' > ' + r.name + '\n        -> ' + String(r.error).slice(0, 400)));
  s.results.filter(r => r.status === 'fail').forEach(r => console.log('FALHOU  ' + r.suite + ' > ' + r.name + '\n        -> ' + String(r.error).slice(0, 600)));
  if (logs.jsdom.length) console.log('\nErros do jsdom (' + logs.jsdom.length + '):\n  ' + logs.jsdom.slice(0, 5).join('\n  '));
  const mem = process.memoryUsage();
  console.log('\n' + (s.failed ? 'FALHOU' : 'PASSOU') + ': ' + s.passed + ' ok, ' + s.failed + ' falha(s), ' + s.skipped + ' pulado(s), ' + s.known + ' falha(s) conhecida(s) de ' + s.total + ' testes; ' + s.asserts + ' asserções; ' +
    (s.ms / 1000).toFixed(1) + ' s (tempo total do processo ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s); memória do Node: heap ' + (mem.heapUsed / 1048576).toFixed(0) + ' MB, pico RSS ' + (peakRss / 1048576).toFixed(0) + ' MB');
  if (flag('--json')) console.log(JSON.stringify({ passed: s.passed, failed: s.failed, skipped: s.skipped, total: s.total, asserts: s.asserts, ms: s.ms, failures: s.failures }));
  w.close();
  process.exit(s.failed ? 1 : 0);
})();
