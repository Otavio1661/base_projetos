/**
 * ============================================
 * libr4 / preview.js  —  R4 dev
 * ============================================
 * Lado da PÁGINA DE PRÉVIA do <r4-phonepreview>: recebe por postMessage o estado do formulário
 * do painel (a página-mãe) e aplica SÓ o que a configuração autorizar.
 *
 *   <script src="/libr4/preview.js"></script>          (sozinho, sem o resto da lib; ou já vem no pacote)
 *   R4.preview.listen({
 *     text:  { nome: '#titulo', bio: ['.bio', '#rodape-bio'] },   // chave → seletor(es): textContent
 *     var:   { cor: '--marca', raio: { name: '--raio', unit: 'px' } },   // chave → variável CSS (valor revalidado)
 *     class: { estilo: { target: 'body', values: { solido: 'topo-solido', gradiente: 'topo-degrade' } } },
 *     show:  { mostrarBio: '#bio' }                                  // chave → seletor(es): hidden quando falso
 *   });
 *
 * Protocolo v1 (documentado em docs/DECLARATIVO.md):
 *   mãe → prévia  { v: 1, t: 'estado', d: { chave: valor, ... } }    (valor: texto, número, booleano, null ou lista curta)
 *   prévia → mãe  { v: 1, t: 'pronto' }                              (pede o estado completo ao carregar)
 * Só aceita mensagens com event.origin === location.origin E event.source === window.parent; formato,
 * tamanho (64 KB) e número de chaves (100) são conferidos; nunca escreve HTML nem URL.
 * Sem eval, sem dependências. Pode ser carregado sozinho (cria window.R4 se não existir).
 * ============================================
 */
(function (global) {
  'use strict';
  const R4 = global.R4 = global.R4 || {};
  const V = 1, MAX_BYTES = 65536, MAX_KEYS = 100, MAX_TEXT = 5000, MAX_LIST = 100, MAX_NODES = 50;
  const BAD = new Set(['__proto__', 'constructor', 'prototype']);
  const KEY = /^[A-Za-z_][\w.-]{0,63}$/;
  const warned = new Set();
  const warn = m => { if (warned.has(m)) return; warned.add(m); console.warn('[R4] preview: ' + m); };
  // objeto simples (de qualquer janela: o postMessage clona para cá, mas apply() pode receber da mãe)
  const isObj = v => {
    if (v === null || typeof v !== 'object' || Array.isArray(v)) return false;
    const p = Object.getPrototypeOf(v);
    return p === null || Object.getPrototypeOf(p) === null;
  };

  /* ---------- valores de CSS seguros (compartilhado com r4-bind="var:...") ---------- */
  const WORDS = new Set(['none', 'auto', 'normal', 'bold', 'bolder', 'lighter', 'italic', 'center', 'left', 'right', 'top', 'bottom',
    'start', 'end', 'block', 'inline', 'inline-block', 'flex', 'grid', 'hidden', 'visible', 'solid', 'dashed', 'dotted',
    'cover', 'contain', 'uppercase', 'lowercase', 'capitalize', 'transparent', 'currentcolor']);
  const UNITS = ['px', 'rem', 'em', '%', 'vh', 'vw', 'vmin', 'vmax', 'deg', 'ms', 's', 'fr', 'ch'];
  const NUM = /^-?(?:[0-9]{1,6}(?:\.[0-9]{1,4})?|\.[0-9]{1,4})(px|rem|em|%|vh|vw|vmin|vmax|deg|ms|s|fr|ch)?$/;
  /** '#abc' → '#aabbcc'; '#AABBCC' → '#aabbcc'; outro → '' */
  function hex(v) {
    const s = String(v ?? '').trim().toLowerCase();
    if (/^#[0-9a-f]{6}$/.test(s)) return s;
    if (/^#[0-9a-f]{3}$/.test(s)) return '#' + s[1] + s[1] + s[2] + s[2] + s[3] + s[3];
    return '';
  }
  /**
   * Valor aceito numa variável CSS: #rgb/#rrggbb (normalizado), número com unidade permitida (ou sem unidade;
   * `unit` é acrescentada a número puro) ou uma palavra de uma lista curta. Qualquer outra coisa → '' (nunca CSS livre).
   */
  function cssValue(v, unit) {
    if (typeof v === 'number') v = Number.isFinite(v) ? String(v) : '';
    if (typeof v !== 'string' || v.length > 32) return '';
    const s = v.trim().toLowerCase();
    if (!s) return '';
    if (s[0] === '#') return hex(s);
    const m = NUM.exec(s);
    if (m) return !m[1] && unit && UNITS.includes(unit) ? s + unit : s;
    return WORDS.has(s) ? s : '';
  }
  const cssName = n => (typeof n === 'string' && /^--[A-Za-z0-9_-]{1,40}$/.test(n) ? n : '');

  /* ---------- formato da mensagem ---------- */
  function cleanVal(v, depth) {
    if (v == null) return null;
    if (typeof v === 'string') return v.length > MAX_TEXT ? v.slice(0, MAX_TEXT) : v;
    if (typeof v === 'number') return Number.isFinite(v) ? v : null;
    if (typeof v === 'boolean') return v;
    if (Array.isArray(v) && depth < 2) return v.slice(0, MAX_LIST).map(x => cleanVal(x, depth + 1));
    if (isObj(v) && depth === 1) {   // item de lista (ex.: horários do repeater): objeto raso de primitivos
      const o = {};
      Object.keys(v).slice(0, 30).forEach(k => { if (KEY.test(k) && !BAD.has(k)) { const x = v[k]; o[k] = typeof x === 'object' ? null : cleanVal(x, 2); } });
      return o;
    }
    return undefined;
  }
  /** Confere e copia o pacote { v:1, t:'estado', d:{...} }. Devolve o objeto d limpo ou null. */
  function check(msg) {
    if (!isObj(msg) || msg.v !== V || msg.t !== 'estado' || !isObj(msg.d)) return null;
    let size;
    try { size = JSON.stringify(msg).length; } catch (e) { return null; }
    if (size > MAX_BYTES) { warn('mensagem grande demais (' + size + ' bytes; máx. ' + MAX_BYTES + ') ignorada'); return null; }
    const keys = Object.keys(msg.d);
    if (keys.length > MAX_KEYS) { warn('mensagem com chaves demais (' + keys.length + '; máx. ' + MAX_KEYS + ') ignorada'); return null; }
    const d = Object.create(null);
    keys.forEach(k => {
      if (!KEY.test(k) || BAD.has(k)) return;
      const v = cleanVal(msg.d[k], 0);
      if (v !== undefined) d[k] = v;
    });
    return d;
  }
  /** Valor → texto: lista vira linhas (itens-objeto: valores separados por " · "). */
  function text(v) {
    if (v == null) return '';
    if (Array.isArray(v)) return v.map(x => (x && typeof x === 'object' ? Object.keys(x).map(k => x[k]).filter(y => y != null && y !== '').join(' · ') : text(x))).join('\n');
    return String(v);
  }
  const truthy = v => !(v == null || v === false || v === 0 || (typeof v === 'string' && !v.trim()) || (Array.isArray(v) && !v.length));

  /* ---------- aplicação ---------- */
  function nodes(root, sel) {
    const out = [];
    [].concat(sel || []).forEach(s => {
      if (typeof s !== 'string' || !s || s.length > 200) return;
      try { root.querySelectorAll(s).forEach(n => { if (out.length < MAX_NODES) out.push(n); }); }
      catch (e) { warn('seletor inválido "' + s.slice(0, 60) + '"'); }
    });
    return out;
  }
  function own(o, k) { return o && Object.prototype.hasOwnProperty.call(o, k) ? o[k] : undefined; }

  /** Aplica um pacote já conferido (d) segundo a config. Devolve as chaves aplicadas. */
  function apply(cfg, d, doc) {
    const root = cfg.root || doc, done = [];
    Object.keys(d).forEach(k => {
      const v = d[k];
      let used = false;
      const t = own(cfg.text, k);
      if (t) { nodes(root, t).forEach(n => { const s = text(v); if (n.textContent !== s) n.textContent = s; }); used = true; }
      const sh = own(cfg.show, k);
      if (sh) { nodes(root, sh).forEach(n => { n.hidden = !truthy(v); }); used = true; }
      const vr = own(cfg.var, k);
      if (vr) {
        const spec = typeof vr === 'string' ? { name: vr } : vr, name = cssName(spec.name);
        const tg = spec.target ? nodes(root, spec.target) : [doc.documentElement];
        if (!name) warn('variável CSS inválida para "' + k + '" (use --nome)');
        else {
          const css = cssValue(v, spec.unit);
          tg.forEach(n => (css ? n.style.setProperty(name, css) : n.style.removeProperty(name)));
          if (!css && v != null && v !== '') warn('valor recusado para ' + name + ' (só #rrggbb, número com unidade ou palavra simples)');
        }
        used = true;
      }
      const cl = own(cfg.class, k);
      if (cl && isObj(cl.values)) {
        const all = Object.keys(cl.values).map(x => cl.values[x]).filter(c => typeof c === 'string' && /^[A-Za-z_-][\w-]{0,40}$/.test(c));
        const want = typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' ? own(cl.values, String(v)) : undefined;
        nodes(root, cl.target || 'body').forEach(n => { all.forEach(c => n.classList.toggle(c, c === want)); });
        used = true;
      }
      if (used) done.push(k);
    });
    return done;
  }

  /**
   * Começa a ouvir. config: { text, var, class, show, root, onUpdate(d, aplicadas) }.
   * Devolve { stop(), apply(d) } (apply aplica um objeto d direto, útil em testes; passa pela mesma conferência).
   */
  function listen(config) {
    const cfg = isObj(config) ? config : {};
    const W = cfg.window || global, doc = W.document;
    const parent = W.parent;
    const inFrame = parent && parent !== W;
    if (!inFrame) warn('a página não está dentro de um iframe: nenhuma mensagem será aceita');
    const run = d => {
      const keys = apply(cfg, d, doc);
      if (typeof cfg.onUpdate === 'function') { try { cfg.onUpdate(d, keys); } catch (e) { console.error('[R4] preview onUpdate:', e); } }
      return keys;
    };
    const on = ev => {
      if (!inFrame || ev.origin !== W.location.origin || ev.source !== parent) return;   // outra origem/fonte: ignora em silêncio
      const d = check(ev.data);
      if (!d) { if (!(ev.data && ev.data.t === 'pronto')) warn('mensagem fora do protocolo v1 ignorada'); return; }
      run(d);
    };
    W.addEventListener('message', on);
    if (inFrame) { try { parent.postMessage({ v: V, t: 'pronto' }, W.location.origin); } catch (e) { /* mãe fechada */ } }
    return {
      stop() { W.removeEventListener('message', on); },
      apply(d) { const c = check({ v: V, t: 'estado', d }); return c ? run(c) : []; }
    };
  }

  R4.preview = { listen, check, cssValue, hex, version: V, limits: { bytes: MAX_BYTES, keys: MAX_KEYS, text: MAX_TEXT, list: MAX_LIST } };
  if (typeof R4.module === 'function') {
    R4.module('preview', R4.preview, {
      group: 'HTML declarativo', title: 'R4.preview (página de prévia)',
      description: 'Lado da página de prévia do <r4-phonepreview>: R4.preview.listen(config) recebe por postMessage o estado do formulário da página-mãe (mesma origem, só da janela-mãe) e aplica apenas o que a config autorizar: texto, variável CSS revalidada, classe de uma lista fixa e mostrar/ocultar. Nunca HTML, nunca URL. Carregue /libr4/preview.js sozinho na página de prévia (ou use o pacote).',
      props: [
        { name: 'listen({text, var, class, show, root, onUpdate})', type: '{stop(), apply(d)}', desc: 'text: {chave: seletor | [seletores]} → textContent (lista vira linhas). var: {chave: "--nome" | {name, unit, target}} → style.setProperty com valor revalidado. class: {chave: {target, values: {valor: "classe"}}} → liga só a classe mapeada e desliga as outras da lista. show: {chave: seletor} → hidden quando o valor é falso/vazio.' },
        { name: 'Protocolo v1', type: 'postMessage', desc: 'mãe → prévia {v:1, t:"estado", d:{chave: valor}}; prévia → mãe {v:1, t:"pronto"}. Aceita só event.origin === location.origin e event.source === window.parent; máx. 64 KB, 100 chaves, textos de 5.000 caracteres, listas de 100 itens; chaves __proto__/constructor/prototype ignoradas.' },
        { name: 'cssValue(valor, unidade)', type: 'string', desc: 'Valor de CSS seguro: #rgb/#rrggbb, número com unidade (px, rem, em, %, vh, vw, deg, ms, s, fr, ch) ou palavra simples (none, auto, bold, center...). Outro → "".' },
        { name: 'check(mensagem)', type: 'object | null', desc: 'Confere o formato do pacote e devolve os dados limpos.' }
      ]
    });
  }
})(window);
