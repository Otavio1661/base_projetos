/**
 * ============================================
 * libr4 / theme.js  —  R4 dev
 * ============================================
 * Temas (R4.theme + <r4-themeswitch>) e internacionalização (R4.i18n, R4.t, <r4-t>).
 *
 * Temas: a partir de UMA cor primária geram-se os tokens --r4-* (claro e escuro) num
 * <style id="r4-theme">. Nenhum arquivo é editado. Toda entrada é validada (cor hex/rgb,
 * raio numérico limitado, densidade/modo em lista, fonte só com nomes seguros) antes de
 * virar CSS, então um valor como "red;}body{display:none" é rejeitado, nunca injetado.
 *
 * Densidade: --r4-density (0.75 | 1 | 1.25). Outros módulos usam
 *   padding: calc(8px * var(--r4-density, 1));
 * ou as variáveis prontas --r4-pad-y / --r4-pad-x / --r4-gap.
 *
 * i18n: dicionários pt-BR e en com as strings da lib sob chaves r4.*.
 * ============================================
 */
(function (R4) {
  'use strict';
  const { el } = R4.util;
  const warn = m => (R4.warn ? R4.warn(m) : console.warn('[R4] ' + m));
  const root = () => document.documentElement;

  /*
   * Preferências (tema e idioma) vão para o R4.store (chaves r4:theme e r4:locale): validade de 180 dias
   * renovada a cada uso, valor revalidado ao ler, lixeira automática. R4.store nunca lança exceção
   * (sem localStorage cai para memória). Sem o módulo store carregado, nada é guardado.
   */
  const PREF = { ttl: '180d', sliding: true, now: true };
  const store = {
    get(k, schema) { try { return R4.store ? R4.store.get(k, { schema }) : undefined; } catch (e) { return undefined; } },
    set(k, v) { try { return !!R4.store && R4.store.set(k, v, PREF); } catch (e) { return false; } },
    del(k) { try { if (R4.store) R4.store.del(k); } catch (e) { /* ignora */ } },
    /** migração única: lê e APAGA uma chave antiga (sem prefixo, de antes do R4.store); devolve o texto (curto) ou null */
    legacy(k) {
      if (!R4.store) return null;
      try { const v = window.localStorage.getItem(k); window.localStorage.removeItem(k); return typeof v === 'string' && v.length <= 4096 ? v : null; } catch (e) { return null; }
    }
  };

  /* ============================================================
   * CORES
   * ============================================================ */
  const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
  const RGB = /^rgb\(\s*([0-9]{1,3})\s*[, ]\s*([0-9]{1,3})\s*[, ]\s*([0-9]{1,3})\s*\)$/i;
  const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
  const hex2 = n => Math.round(clamp(n, 0, 255)).toString(16).padStart(2, '0');

  /** '#abc' | '#aabbcc' | 'rgb(1,2,3)' -> [r,g,b] ou null (qualquer outra coisa é inválida) */
  function parseColor(v) {
    if (typeof v !== 'string') return null;
    const s = v.trim();
    let m = HEX.exec(s);
    if (m) {
      let h = m[1];
      if (h.length === 3) h = h.replace(/./g, c => c + c);
      return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
    }
    m = RGB.exec(s);
    if (m) { const c = [+m[1], +m[2], +m[3]]; return c.every(x => x <= 255) ? c : null; }
    return null;
  }
  const toHex = c => '#' + c.map(hex2).join('');

  function rgbToHsl([r, g, b]) {
    r /= 255; g /= 255; b /= 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
    let h = 0, s = 0;
    if (d) {
      s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
      h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
      h *= 60;
    }
    return [h, s * 100, l * 100];
  }
  function hsl(h, s, l) {   // -> '#rrggbb'
    h = ((h % 360) + 360) % 360; s = clamp(s, 0, 100) / 100; l = clamp(l, 0, 100) / 100;
    const k = n => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
    const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return toHex([f(0) * 255, f(8) * 255, f(4) * 255]);
  }

  /** Luminância relativa WCAG 2.x */
  function luminance(c) {
    const [r, g, b] = c.map(x => { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }
  /** Razão de contraste WCAG entre duas cores (1 a 21); null se alguma for inválida. */
  function contrast(a, b) {
    const x = parseColor(a), y = parseColor(b);
    if (!x || !y) return null;
    const l1 = luminance(x), l2 = luminance(y);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  }
  const TXT_LIGHT = '#ffffff', TXT_DARK = '#0b1020';
  /** Escolhe texto claro ou escuro sobre `bg`: { color, ratio } (a opção de maior contraste). */
  function textOn(bg) {
    const w = contrast(TXT_LIGHT, bg), d = contrast(TXT_DARK, bg);
    return w >= d ? { color: TXT_LIGHT, ratio: w } : { color: TXT_DARK, ratio: d };
  }

  /* ============================================================
   * TEMA
   * ============================================================ */
  const DEFAULT_PRIMARY = '#3b5bdb';
  const DENSITY = { compact: 0.75, normal: 1, comfortable: 1.25 };
  const MODES = ['light', 'dark', 'auto'];
  const GENERIC_FONTS = ['serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui', 'ui-sans-serif', 'ui-serif', 'ui-monospace', 'ui-rounded'];
  const KEY = 'theme';    // chave no R4.store (no localStorage: "r4:theme")

  const presets = {
    'R4 Azul': { primary: '#3b5bdb', radius: 6 },
    'Esmeralda': { primary: '#0b7d55', radius: 8 },
    'Laranja': { primary: '#e8590c', radius: 6 },
    'Grafite': { primary: '#495057', radius: 4 },
    'Violeta': { primary: '#7048e8', radius: 10 }
  };

  // só presets próprios (nunca "__proto__", "constructor"... herdados de Object.prototype)
  const hasPreset = n => typeof n === 'string' && Object.prototype.hasOwnProperty.call(presets, n) && presets[n] && typeof presets[n] === 'object';
  const defaults = () => ({ mode: 'light', primary: DEFAULT_PRIMARY, radius: 6, density: 'normal', font: '', preset: 'R4 Azul' });
  let state = defaults();
  let started = false;     // só mexe no DOM depois do primeiro set()/restauração
  const listeners = new Set();
  let mql = null, mqlFn = null;

  /** Valida UM campo. Devolve { ok, value } — nada que falhe aqui chega ao CSS. */
  function sanitize(key, v) {
    switch (key) {
      case 'mode': return MODES.includes(v) ? { ok: true, value: v } : { ok: false, msg: 'mode deve ser light, dark ou auto' };
      case 'density': return typeof v === 'string' && Object.prototype.hasOwnProperty.call(DENSITY, v) ? { ok: true, value: v } : { ok: false, msg: 'density deve ser compact, normal ou comfortable' };
      case 'primary': { const c = parseColor(v); return c ? { ok: true, value: toHex(c) } : { ok: false, msg: 'primary deve ser cor hex (#rgb, #rrggbb) ou rgb(r,g,b)' }; }
      case 'radius': {
        const n = typeof v === 'number' ? v : (typeof v === 'string' && /^[0-9]{1,2}(\.[0-9]+)?$/.test(v.trim()) ? Number(v) : NaN);
        return Number.isFinite(n) ? { ok: true, value: Math.round(clamp(n, 0, 24) * 10) / 10 } : { ok: false, msg: 'radius deve ser número entre 0 e 24' };
      }
      case 'font': {
        if (v === '' || v == null) return { ok: true, value: '' };
        if (typeof v !== 'string' || v.length > 160) return { ok: false, msg: 'font inválida' };
        const parts = v.split(',').map(p => p.trim().replace(/^(["'])(.*)\1$/, '$2').trim());
        if (!parts.length || parts.length > 8) return { ok: false, msg: 'font inválida' };
        const out = [];
        for (const p of parts) {
          if (GENERIC_FONTS.includes(p.toLowerCase())) { out.push(p.toLowerCase()); continue; }
          if (!/^[A-Za-z0-9][A-Za-z0-9 _-]{0,40}$/.test(p)) return { ok: false, msg: 'font aceita só nomes de fonte (letras, números, espaço, - e _)' };
          out.push(/[ ]/.test(p) ? '"' + p + '"' : p);
        }
        return { ok: true, value: out.join(',') };
      }
      default: return { ok: false, msg: 'opção desconhecida' };
    }
  }

  /** Gera os tokens (claro e escuro) a partir da cor primária. */
  function tokens(primary) {
    const rgb = parseColor(primary), [h, s, l] = rgbToHsl(rgb);
    const ns = clamp(s * 0.45, 6, 32);             // saturação dos neutros acompanha a marca, sem pesar
    const on = textOn(primary);
    const light = {
      '--r4-bg': hsl(h, ns, 95), '--r4-line': hsl(h, ns, 86), '--r4-txt': hsl(h, clamp(ns * 1.2, 8, 38), 17),
      '--r4-mut': hsl(h, ns * 0.6, 42), '--r4-acc': primary, '--r4-acc-txt': on.color,
      '--r4-head': hsl(h, ns, 92), '--r4-head-txt': hsl(h, clamp(ns * 1.2, 8, 38), 17),
      '--r4-hover': hsl(h, clamp(ns * 1.4, 8, 50), 96), '--r4-sel': hsl(h, clamp(s, 35, 100), 92)
    };
    // no escuro, a cor de destaque é clareada para manter contraste sobre o fundo escuro
    const dl = l < 62 ? 68 : l, ds = Math.min(s, 85), dAcc = hsl(h, ds, dl), dOn = textOn(dAcc);
    const dark = {
      '--r4-bg': hsl(h, ns, 9), '--r4-panel': hsl(h, ns, 12.5), '--r4-line': hsl(h, ns * 0.9, 22), '--r4-txt': hsl(h, 30, 92),
      '--r4-mut': hsl(h, 15, 66), '--r4-acc': dAcc, '--r4-acc-txt': dOn.color,
      '--r4-head': hsl(h, ns, 16.5), '--r4-head-txt': hsl(h, 30, 92), '--r4-hover': hsl(h, ns, 17), '--r4-sel': hsl(h, clamp(ns + 12, 10, 45), 27)
    };
    return { light, dark, onRatio: on.ratio, darkOnRatio: dOn.ratio, dAcc };
  }

  const warned = new Set();
  function checkContrast(primary, t) {
    const once = (k, m) => { if (!warned.has(k)) { warned.add(k); warn(m); } };
    if (t.onRatio < 4.5) once('on:' + primary, 'tema: contraste do texto sobre a cor primária ' + primary + ' é ' + t.onRatio.toFixed(2) + ':1 (abaixo de 4.5:1, WCAG AA). Escolha uma cor mais clara ou mais escura.');
    if (t.darkOnRatio < 4.5) once('don:' + primary, 'tema: no modo escuro o texto sobre o destaque ' + t.dAcc + ' tem contraste ' + t.darkOnRatio.toFixed(2) + ':1 (abaixo de 4.5:1).');
    const ui = contrast(primary, '#ffffff');
    if (ui < 3) once('ui:' + primary, 'tema: a cor primária ' + primary + ' tem contraste ' + ui.toFixed(2) + ':1 contra o fundo claro (WCAG 1.4.11 pede 3:1 para bordas/ícones).');
  }

  const decl = o => Object.keys(o).map(k => k + ':' + o[k]).join(';');

  function buildCss() {
    const common = {
      '--r4-radius': state.radius + 'px', '--r4-density': String(DENSITY[state.density]),
      '--r4-pad-y': 'calc(6px * var(--r4-density))', '--r4-pad-x': 'calc(12px * var(--r4-density))', '--r4-gap': 'calc(8px * var(--r4-density))'
    };
    if (state.font) common['--r4-font'] = state.font;
    let lightT = {}, darkT = {};
    if (state.primary !== DEFAULT_PRIMARY) {      // com a cor padrão, valem as variáveis originais do libr4.css
      const t = tokens(state.primary);
      lightT = t.light; darkT = t.dark;
      checkContrast(state.primary, t);
    }
    return ':root{' + decl(Object.assign({ 'color-scheme': 'light' }, common, lightT)) + '}\n' +
      ':root.r4-dark{' + decl(Object.assign({ 'color-scheme': 'dark' }, darkT)) + '}\n';
  }

  const systemDark = () => { try { return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches); } catch (e) { return false; } };
  const isDark = () => state.mode === 'dark' || (state.mode === 'auto' && systemDark());

  function watchSystem() {
    const want = state.mode === 'auto' && typeof window.matchMedia === 'function';
    if (!want) {
      if (mql) { try { mql.removeEventListener ? mql.removeEventListener('change', mqlFn) : mql.removeListener(mqlFn); } catch (e) { /* ignora */ } mql = mqlFn = null; }
      return;
    }
    if (mql) return;
    try {
      mql = window.matchMedia('(prefers-color-scheme: dark)');
      mqlFn = () => { applyDom(); emit('system'); };
      mql.addEventListener ? mql.addEventListener('change', mqlFn) : mql.addListener(mqlFn);
    } catch (e) { mql = mqlFn = null; }
  }

  function applyDom() {
    let st = document.getElementById('r4-theme');
    if (!st) { st = document.createElement('style'); st.id = 'r4-theme'; document.head.appendChild(st); }
    const css = buildCss();
    if (st.textContent !== css) st.textContent = css;
    root().classList.toggle('r4-dark', isDark());
  }
  function emit(reason) {
    const info = { dark: isDark(), reason };
    listeners.forEach(fn => { try { fn(get(), info); } catch (e) { console.error('[R4] R4.theme.onChange:', e); } });
  }
  const get = () => Object.assign({}, state, { dark: isDark() });

  /**
   * set({ mode, primary, radius, density, font }, { persist = true })
   * Campos inválidos são ignorados com aviso no console; os válidos são aplicados.
   */
  function set(cfg, opts) {
    cfg = cfg && typeof cfg === 'object' ? cfg : {};
    const next = Object.assign({}, state);
    let changed = false;
    Object.keys(cfg).forEach(k => {
      if (k === 'preset') return;
      const r = sanitize(k, cfg[k]);
      if (!r.ok) { warn('R4.theme.set: ' + k + ' ignorado — ' + r.msg); return; }
      if (next[k] !== r.value) { next[k] = r.value; changed = true; }
    });
    if ('primary' in cfg || 'radius' in cfg) {    // o rótulo de preset só vale se bater com as opções dele
      const hit = Object.keys(presets).find(n => presets[n].primary === next.primary && presets[n].radius === next.radius);
      next.preset = hit || null;
    }
    if (typeof cfg.preset === 'string' && hasPreset(cfg.preset)) next.preset = cfg.preset;
    if (!changed && started) return api;
    state = next; started = true;
    watchSystem(); applyDom();
    if (!opts || opts.persist !== false) {
      store.set(KEY, { mode: state.mode, primary: state.primary, radius: state.radius, density: state.density, font: state.font, preset: state.preset });   // sem armazenamento: segue só em memória
    }
    emit((opts && opts.reason) || 'set');
    return api;
  }

  function preset(name) {
    const p = hasPreset(name) ? presets[name] : null;
    if (!p) { warn('R4.theme.preset: "' + name + '" não existe. Disponíveis: ' + Object.keys(presets).join(', ')); return api; }
    return set(Object.assign({}, p, { preset: name }), { reason: 'preset' });
  }

  function reset() {
    state = defaults(); started = false;
    watchSystem();
    const st = document.getElementById('r4-theme'); if (st) st.remove();
    root().classList.remove('r4-dark');
    store.del(KEY);
    emit('reset');
    return api;
  }

  function onChange(fn) {
    if (typeof fn !== 'function') return () => {};
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  const api = {
    set, get, preset, reset, onChange, presets, isDark, contrast, textOn, parseColor, storageKey: 'r4:' + KEY,
    /** Valida sem aplicar: { ok, errors } */
    validate(cfg) {
      const errors = {};
      Object.keys(cfg || {}).forEach(k => { const r = sanitize(k, cfg[k]); if (!r.ok) errors[k] = r.msg; });
      return { ok: !Object.keys(errors).length, errors };
    }
  };
  R4.theme = api;

  // esquema do que foi salvo: só campos válidos (cada um passa por sanitize); sem nenhum válido → undefined (o R4.store apaga a chave)
  function savedTheme(o) {
    if (!o || typeof o !== 'object' || Array.isArray(o)) return undefined;
    const cfg = {};
    ['mode', 'primary', 'radius', 'density', 'font'].forEach(k => {
      if (!Object.prototype.hasOwnProperty.call(o, k)) return;
      const r = sanitize(k, o[k]); if (r.ok) cfg[k] = r.value;
    });
    return Object.keys(cfg).length ? cfg : undefined;
  }
  // restaura o tema salvo (revalidando tudo; valor adulterado no storage é descartado)
  (function restore() {
    // migração única das chaves antigas (r4-theme, r4-dark): importa se valer e APAGA as antigas
    const lt = store.legacy('r4-theme'), ld = store.legacy('r4-dark');
    let cfg = store.get(KEY, savedTheme);
    if (!cfg) {
      try { cfg = lt ? savedTheme(JSON.parse(lt)) : undefined; } catch (e) { cfg = undefined; }
      if (!cfg && ld && /^(1|true|dark)$/i.test(ld.trim())) cfg = { mode: 'dark' };
      if (cfg) store.set(KEY, cfg);
    }
    if (cfg) { set(cfg, { persist: false, reason: 'restore' }); return; }
    if (root().classList.contains('r4-dark')) state.mode = 'dark';   // página já nasceu escura (ex.: alternador próprio)
  })();

  R4.module('theme', api, {
    group: 'Núcleo', title: 'R4.theme',
    description: 'Tema a partir de UMA cor primária: gera os tokens --r4-* (acc, sel, hover, head, bg, line, txt...) para claro e escuro num <style id="r4-theme">, sem editar arquivos. Modo claro/escuro/auto (segue o sistema), raio, densidade e fonte; salva no R4.store (chave r4:theme, validade de 180 dias renovada a cada uso, revalidado ao ler). Toda entrada é validada (impede injeção de CSS) e o contraste do texto sobre a cor primária é calculado (WCAG AA 4.5:1) com escolha automática de texto claro/escuro em --r4-acc-txt. Densidade: use calc(8px * var(--r4-density, 1)) nos seus estilos, ou --r4-pad-y / --r4-pad-x / --r4-gap.',
    props: [
      { name: 'set({ mode, primary, radius, density, font })', type: 'R4.theme', desc: "mode: 'light' | 'dark' | 'auto'; primary: '#3b5bdb' ou 'rgb(59,91,219)'; radius: 0 a 24 (px); density: 'compact' | 'normal' | 'comfortable'; font: lista de nomes de fonte. Campos inválidos são ignorados com aviso." },
      { name: 'get()', type: 'object', desc: 'Estado atual { mode, primary, radius, density, font, preset, dark }.' },
      { name: 'preset(nome)', type: 'R4.theme', desc: "Aplica um preset. Disponíveis em R4.theme.presets: 'R4 Azul' (padrão), 'Esmeralda', 'Laranja', 'Grafite', 'Violeta'." },
      { name: 'presets', type: 'object', desc: 'Nome → { primary, radius }. Adicione os seus: R4.theme.presets.Rosa = { primary: "#d6336c", radius: 6 }.' },
      { name: 'reset()', type: 'R4.theme', desc: 'Remove o <style id="r4-theme">, a classe r4-dark e o valor salvo: volta ao libr4.css original.' },
      { name: 'onChange(fn(estado, {dark, reason}))', type: 'function', desc: 'Escuta mudanças (inclusive do sistema no modo auto). Devolve a função para cancelar.' },
      { name: 'isDark()', type: 'boolean', desc: 'O tema escuro está ativo agora (considera o modo auto).' },
      { name: 'contrast(corA, corB)', type: 'number', desc: 'Razão de contraste WCAG (1 a 21). Ex.: contrast("#000","#fff") = 21.' },
      { name: 'textOn(cor)', type: '{color, ratio}', desc: 'Texto claro ou escuro de maior contraste sobre a cor.' },
      { name: 'validate(cfg)', type: '{ok, errors}', desc: 'Valida sem aplicar.' },
      { name: '--r4-density', type: 'css', default: '1', desc: '0.75 compacto, 1 normal, 1.25 confortável. Multiplique seus espaçamentos por ela.' },
      { name: '--r4-pad-y / --r4-pad-x / --r4-gap', type: 'css', desc: 'Atalhos já multiplicados pela densidade (6px / 12px / 8px base).' },
      { name: '--r4-acc-txt', type: 'css', desc: 'Cor de texto legível sobre --r4-acc (escolhida automaticamente).' }
    ],
    events: ['change (onChange)']
  });

  /* ============================================================
   * COMPONENTE themeswitch
   * ============================================================ */
  const MODE_DEF = [['light', 'r4.theme.light', 'sun'], ['dark', 'r4.theme.dark', 'moon'], ['auto', 'r4.theme.auto', 'contrast']];   // nomes de R4.icon

  R4.define('themeswitch', {
    config: { modes: true, presets: true, picker: false, label: '' },
    build() {
      const root = el('div', { class: 'r4-themeswitch', role: 'group' });
      this._btns = {};
      this._parts = {};
      if (this.modes) {
        const grp = el('div', { class: 'r4-ts-modes' });
        MODE_DEF.forEach(([m, key, icon]) => {
          const b = el('button', { type: 'button', class: 'r4-btn r4-ts-btn', 'aria-pressed': 'false', 'data-mode': m }, [
            R4.util.icon(el('span', { class: 'r4-ts-ico', 'aria-hidden': 'true' }), icon), el('span', { class: 'r4-ts-txt' })]);
          b.addEventListener('click', () => R4.theme.set({ mode: m }));
          this._btns[m] = { b, key };
          grp.append(b);
        });
        root.append(grp);
      }
      if (this.presets) {
        const id = this.id + '-preset', lab = el('label', { class: 'r4-ts-field', for: id }), txt = el('span', { class: 'r4-label' });
        const sel = el('select', { class: 'r4-input r4-ts-select', id });
        sel.addEventListener('change', () => { if (sel.value) R4.theme.preset(sel.value); });
        this._parts.presetLabel = txt; this._parts.sel = sel;
        lab.append(txt, sel); root.append(lab);
      }
      if (this.picker) {
        const id = this.id + '-color', lab = el('label', { class: 'r4-ts-field', for: id }), txt = el('span', { class: 'r4-label' });
        const inp = el('input', { type: 'color', class: 'r4-ts-color', id });
        inp.addEventListener('input', () => R4.theme.set({ primary: inp.value }));
        this._parts.colorLabel = txt; this._parts.color = inp;
        lab.append(txt, inp); root.append(lab);
      }
      return root;
    },
    afterRender() {
      this._off = [R4.theme.onChange(() => this.sync()), R4.i18n.onChange(() => this.sync())];
      this.sync();
    },
    /** Sincroniza rótulos (idioma) e estado (tema) com R4.theme */
    sync() {
      if (!this.el) return;
      const st = R4.theme.get(), t = R4.t;
      this.el.setAttribute('aria-label', this.label || t('r4.theme.title'));
      Object.keys(this._btns).forEach(m => {
        const { b, key } = this._btns[m];
        b.querySelector('.r4-ts-txt').textContent = t(key);
        b.setAttribute('aria-pressed', st.mode === m ? 'true' : 'false');
        b.title = t('r4.theme.modeTitle', { mode: t(key) });
        b.setAttribute('aria-label', t(key));
      });
      const p = this._parts;
      if (p.sel) {
        p.presetLabel.textContent = t('r4.theme.preset');
        const names = Object.keys(R4.theme.presets);
        p.sel.replaceChildren(...[st.preset ? null : el('option', { value: '', text: t('r4.theme.custom') })]
          .concat(names.map(n => el('option', { value: n, text: n }))).filter(Boolean));
        p.sel.value = st.preset || '';
      }
      if (p.color) { p.colorLabel.textContent = t('r4.theme.color'); p.color.value = st.primary; }
    },
    destroy() { (this._off || []).forEach(f => f()); this._off = null; R4.Component.prototype.destroy.call(this); }
  }, {
    title: 'themeswitch', group: 'Núcleo',
    description: 'Alternador de tema pronto: botões Claro / Escuro / Auto (aria-pressed), seletor de preset e, opcionalmente, seletor de cor primária. Acompanha R4.theme e o idioma (R4.i18n). Tag <r4-themeswitch>, função R4.themeswitch("#alvo").',
    props: [
      { name: 'modes', type: 'boolean', default: 'true', desc: 'Mostra os botões Claro / Escuro / Auto.' },
      { name: 'presets', type: 'boolean', default: 'true', desc: 'Mostra o seletor de preset.' },
      { name: 'picker', type: 'boolean', default: 'false', desc: 'Mostra o seletor de cor primária.' },
      { name: 'label', type: 'string', default: "''", desc: 'Rótulo acessível do grupo (padrão: "Tema").' },
      { name: 'sync()', type: 'método', desc: 'Relê o tema e o idioma e atualiza a interface.' }
    ],
    events: []
  });
  R4.registry.themeswitch.meta.playground = {
    html: '<r4-themeswitch{attrs}></r4-themeswitch>', cfg: {},
    controls: { modes: true, presets: true, picker: false }
  };
  R4.quickMap.themeswitch = (a, b) => (a && typeof a === 'object' && !a.nodeType ? a : (b || {}));

  /* ============================================================
   * i18n
   * ============================================================ */
  const FALLBACK = 'pt-BR', LKEY = 'locale';   // chave no R4.store (no localStorage: "r4:locale")
  let pendingLocale = null;   // idioma salvo cujo dicionário ainda não foi adicionado (aplicado em add())
  const PLURAL_ALIAS = { zero: 'zero', um: 'one', one: 'one', dois: 'two', two: 'two', poucos: 'few', few: 'few', muitos: 'many', many: 'many', outros: 'other', other: 'other' };
  const dict = {};          // locale -> { chave: string | { one, other... } }
  let locale = FALLBACK;
  const i18nListeners = new Set();
  const missing = new Set();
  const prCache = {};

  function canon(l) {
    if (typeof l !== 'string' || !/^[A-Za-z]{2,3}([-_][A-Za-z0-9]{2,8})*$/.test(l)) return null;
    try { return Intl.getCanonicalLocales(l.replace(/_/g, '-'))[0]; } catch (e) { return null; }
  }
  const isPluralObj = o => Object.keys(o).length > 0 && Object.keys(o).every(k => PLURAL_ALIAS[k]);
  function flatten(obj, prefix, out) {
    Object.keys(obj).forEach(k => {
      const v = obj[k], key = prefix ? prefix + '.' + k : k;
      if (typeof v === 'string') out[key] = v;
      else if (typeof v === 'number') out[key] = String(v);
      else if (v && typeof v === 'object' && !Array.isArray(v)) {
        if (isPluralObj(v)) { const p = {}; Object.keys(v).forEach(c => { p[PLURAL_ALIAS[c]] = String(v[c]); }); out[key] = p; }
        else flatten(v, key, out);
      }
    });
    return out;
  }
  function lookup(key) {
    const chain = [locale, locale.split('-')[0], FALLBACK, 'pt'];
    for (const l of chain) if (dict[l] && Object.prototype.hasOwnProperty.call(dict[l], key)) return { v: dict[l][key], loc: l };
    return null;
  }
  function pluralCat(loc, n) {
    try { return (prCache[loc] ||= new Intl.PluralRules(loc)).select(n); } catch (e) { return 'other'; }
  }
  /** R4.t('chave', { nome, n }) */
  function t(key, params) {
    const hit = lookup(key);
    if (!hit) {
      if (!missing.has(key)) { missing.add(key); warn('i18n: chave não encontrada "' + key + '"'); }
      return String(key);
    }
    let msg = hit.v;
    params = params || {};
    if (msg && typeof msg === 'object') {
      const n = Number(params.n !== undefined ? params.n : params.count);
      if (n === 0 && msg.zero !== undefined) msg = msg.zero;
      else msg = msg[pluralCat(hit.loc, n)] ?? msg.other ?? msg.one ?? '';
    }
    return String(msg).replace(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (m, k) => (params[k] !== undefined && params[k] !== null ? String(params[k]) : m));
  }
  const has = key => !!lookup(key);

  function add(loc, messages) {
    const l = canon(loc);
    if (!l) { warn('i18n.add: locale inválido "' + loc + '"'); return i18n; }
    if (!messages || typeof messages !== 'object') return i18n;
    Object.assign(dict[l] ||= {}, flatten(messages, '', {}));
    if (pendingLocale && (l === pendingLocale || l === pendingLocale.split('-')[0])) { const p = pendingLocale; pendingLocale = null; setLocale(p, { persist: false }); }   // idioma salvo que só agora existe
    else if (started18) retranslate(document);   // novas chaves podem completar elementos já na página
    return i18n;
  }
  function setLocale(loc, opts) {
    const l = canon(loc);
    if (!l) { warn('i18n.set: locale inválido "' + loc + '"'); return i18n; }
    if (!dict[l] && !dict[l.split('-')[0]]) warn('i18n.set: sem dicionário para "' + l + '"; usando ' + FALLBACK + ' como reserva. Use R4.i18n.add("' + l + '", {...}).');
    if (l === locale && !(opts && opts.force)) return i18n;
    const prev = locale;
    pendingLocale = null;
    locale = l;
    try { root().setAttribute('lang', l); } catch (e) { /* ignora */ }
    if (!opts || opts.persist !== false) store.set(LKEY, l);
    started18 = true;
    retranslate(document);
    i18nListeners.forEach(fn => { try { fn(l, prev); } catch (e) { console.error('[R4] R4.i18n.onChange:', e); } });
    return i18n;
  }
  const curCurrency = () => ({ pt: 'BRL', en: 'USD', es: 'EUR', de: 'EUR', fr: 'EUR', ja: 'JPY' }[locale.split('-')[0]] || 'BRL');
  const i18n = {
    t, has, add, set: setLocale,
    get locale() { return locale; },
    get locales() { return Object.keys(dict); },
    fallback: FALLBACK,
    onChange(fn) { if (typeof fn !== 'function') return () => {}; i18nListeners.add(fn); return () => i18nListeners.delete(fn); },
    number(n, opts) { return new Intl.NumberFormat(locale, opts).format(Number(n)); },
    money(n, currency) { return new Intl.NumberFormat(locale, { style: 'currency', currency: currency || curCurrency() }).format(Number(n)); },
    date(v, opts) {   // 'AAAA-MM-DD' é data local (sem deslocar um dia por fuso)
      const m = typeof v === 'string' && /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/.exec(v);
      return new Intl.DateTimeFormat(locale, opts).format(m ? new Date(+m[1], m[2] - 1, +m[3]) : new Date(v));
    },
    /** Traduz elementos <r4-t> e [r4-i18n] dentro de `root` (automático; útil em shadow DOM ou depois de gerar HTML) */
    bind(rootEl) { retranslate(rootEl || document); return i18n; },
    /** Para o MutationObserver (teste/desmontagem da página) */
    disconnect() { if (obs) { obs.disconnect(); obs = null; } }
  };
  R4.i18n = i18n;
  R4.t = t;

  /* ---------- ligação com o DOM: <r4-t key>, r4-i18n="chave" | "placeholder:chave;title:chave" ---------- */
  const ATTRS = new Set(['placeholder', 'title', 'aria-label', 'alt', 'label', 'aria-description']);   // nunca on*, href, src, style...
  const SEL = 'r4-t,[r4-i18n]';
  let started18 = false, obs = null;

  function paramsOf(e) {
    let p = {};
    const raw = e.getAttribute('params');
    if (raw) { try { const o = JSON.parse(raw); if (o && typeof o === 'object' && !Array.isArray(o)) p = o; } catch (err) { warn('i18n: atributo params inválido (use JSON): ' + raw); } }
    if (e.hasAttribute('n')) p.n = e.getAttribute('n');
    return p;
  }
  function translateEl(e) {
    if (e.localName === 'r4-t') {
      const k = e.getAttribute('key');
      if (k && has(k)) { const v = t(k, paramsOf(e)); if (e.textContent !== v) e.textContent = v; }
    }
    const spec = e.getAttribute && e.getAttribute('r4-i18n');
    if (spec) {
      spec.split(';').forEach(part => {
        part = part.trim(); if (!part) return;
        const i = part.indexOf(':'), attr = i < 0 ? '' : part.slice(0, i).trim(), key = (i < 0 ? part : part.slice(i + 1)).trim();
        if (!has(key)) return;
        const v = t(key, paramsOf(e));
        if (!attr) { if (e.textContent !== v) e.textContent = v; }
        else if (ATTRS.has(attr.toLowerCase())) e.setAttribute(attr, v);
        else warn('i18n: atributo "' + attr + '" não permitido em r4-i18n');
      });
    }
  }
  function retranslate(rootEl) {
    if (!rootEl || !rootEl.querySelectorAll) return;
    if (rootEl.matches && rootEl.matches(SEL)) translateEl(rootEl);
    rootEl.querySelectorAll(SEL).forEach(translateEl);
  }
  function startObserver() {
    if (obs || typeof MutationObserver === 'undefined' || !document.body) return;
    obs = new MutationObserver(muts => {
      muts.forEach(m => {
        if (m.type === 'attributes') { if (m.target.matches && m.target.matches(SEL)) translateEl(m.target); return; }
        m.addedNodes.forEach(n => { if (n.nodeType === 1) retranslate(n); });
      });
    });
    obs.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['key', 'params', 'n', 'r4-i18n'] });
  }
  R4.structural && R4.structural('r4-t');
  R4.ready(() => { startObserver(); retranslate(document); });

  /* ---------- dicionários ---------- */
  add('pt-BR', {
    r4: {
      ok: 'OK', cancel: 'Cancelar', yes: 'Sim', no: 'Não', confirm: 'Confirmar', notice: 'Aviso', close: 'Fechar',
      save: 'Salvar', prev: 'Anterior', next: 'Próxima', loading: 'Carregando...', tab: 'Aba',
      copied: 'Copiado!', copyFail: 'Não foi possível copiar — selecione e use Ctrl+C',
      empty: 'Nenhum registro.', filter: 'Filtrar...', search: 'Buscar...', loadFail: 'Falha ao carregar.',
      error: 'Erro: {message}', mountError: 'R4: {message}',
      pager: { info: { um: '{page} / {pages}  ·  {n} registro', outros: '{page} / {pages}  ·  {n} registros' } },
      records: { um: '{n} registro', outros: '{n} registros' },
      items: { um: '{n} item', outros: '{n} itens' },
      err: {
        renderTo: 'renderTo não encontrado: {target}', parent: 'pai desconhecido "{xtype}"', xtype: 'xtype desconhecido "{xtype}"',
        target: 'alvo não encontrado: #{id}', action: 'ação {name}: {message}',
        cryptoIncomplete: 'Pacote de criptografia incompleto', cryptoDecrypt: 'falha ao descriptografar'
      },
      warn: {
        tag: 'tag desconhecida <{tag}>', tagSuggest: 'tag desconhecida <{tag}> — quis dizer <r4-{suggestion}>?',
        attr: '<{tag}>: atributo desconhecido "{attr}"', attrSuggest: '<{tag}>: atributo desconhecido "{attr}" — quis dizer "{suggestion}"?',
        action: 'ação desconhecida "{name}"', actionSuggest: 'ação desconhecida "{name}" — quis dizer "{suggestion}"?'
      },
      theme: {
        title: 'Tema', light: 'Claro', dark: 'Escuro', auto: 'Auto', preset: 'Cor', color: 'Cor primária',
        custom: 'Personalizado', modeTitle: 'Tema {mode}'
      }
    }
  });
  add('en', {
    r4: {
      ok: 'OK', cancel: 'Cancel', yes: 'Yes', no: 'No', confirm: 'Confirm', notice: 'Notice', close: 'Close',
      save: 'Save', prev: 'Previous', next: 'Next', loading: 'Loading...', tab: 'Tab',
      copied: 'Copied!', copyFail: 'Could not copy — select the text and press Ctrl+C',
      empty: 'No records.', filter: 'Filter...', search: 'Search...', loadFail: 'Failed to load.',
      error: 'Error: {message}', mountError: 'R4: {message}',
      pager: { info: { one: '{page} / {pages}  ·  {n} record', other: '{page} / {pages}  ·  {n} records' } },
      records: { one: '{n} record', other: '{n} records' },
      items: { one: '{n} item', other: '{n} items' },
      err: {
        renderTo: 'renderTo not found: {target}', parent: 'unknown parent "{xtype}"', xtype: 'unknown xtype "{xtype}"',
        target: 'target not found: #{id}', action: 'action {name}: {message}',
        cryptoIncomplete: 'Incomplete encryption package', cryptoDecrypt: 'decryption failed'
      },
      warn: {
        tag: 'unknown tag <{tag}>', tagSuggest: 'unknown tag <{tag}> — did you mean <r4-{suggestion}>?',
        attr: '<{tag}>: unknown attribute "{attr}"', attrSuggest: '<{tag}>: unknown attribute "{attr}" — did you mean "{suggestion}"?',
        action: 'unknown action "{name}"', actionSuggest: 'unknown action "{name}" — did you mean "{suggestion}"?'
      },
      theme: {
        title: 'Theme', light: 'Light', dark: 'Dark', auto: 'Auto', preset: 'Color', color: 'Primary color',
        custom: 'Custom', modeTitle: '{mode} theme'
      }
    }
  });

  add('pt-BR', {
    r4: {
      clear: 'Limpar', remove: 'Remover', retry: 'Tentar novamente',
      http: { status: 'Erro HTTP {status}' },
      pager: {
        prev: 'Página anterior', next: 'Próxima página', current: 'Página {page}, atual', goto: 'Ir para a página {page}',
        range: '{from}–{to} de {total}', none: 'Nenhum registro'
      },
      grid: {
        pageSize: 'Linhas por página', all: 'Todos', vrInfo: '{a} a {b} de {n} registros',
        filterLabel: 'Filtrar registros', cols: 'Colunas', colsTitle: 'Mostrar ou ocultar colunas', export: 'Exportar',
        exportTitle: 'Exportar os registros filtrados', retry: 'Tentar de novo', resize: 'Arraste para redimensionar',
        selectAll: 'Selecionar todos os registros filtrados', edit: 'Editar {col}', unsort: 'Limpar ordenação',
        print: 'Imprimir', printing: 'Impressão', total: 'Total', noList: 'Resposta sem lista de registros.',
        badJson: 'A resposta não é JSON válido.', count: { um: '{total} registro', outros: '{total} registros' },
        cfBtn: 'Filtrar valores', cfTitle: 'Filtrar valores de {col}', cfAll: 'Selecionar todos', cfClear: 'Limpar', cfEmpty: '(vazio)',
        cfCount: '{n} de {m} selecionados', cfSearch: 'Buscar valor...', cfMany: 'Muitos valores ({n}): use a busca acima.', cfFail: 'Falha ao carregar valores',
        cfSortCount: 'Por quantidade', cfSortAlpha: 'A–Z'
      },
      form: {
        required: 'Campo obrigatório.', requiredCheck: 'Marque esta opção para continuar.', requiredChoice: 'Selecione uma opção.',
        minLength: 'Use pelo menos {n} caracteres.', maxLength: 'Use no máximo {n} caracteres.',
        min: 'O valor mínimo é {n}.', max: 'O valor máximo é {n}.', number: 'Informe um número válido.', date: 'Informe uma data válida.',
        minDate: 'Informe uma data a partir de {n}.', maxDate: 'Informe uma data até {n}.', email: 'Informe um e-mail válido.',
        pattern: 'Formato inválido.', match: 'Não confere com o campo "{campo}".', cpf: 'CPF inválido.', cnpj: 'CNPJ inválido.',
        cpfCnpj: 'CPF ou CNPJ inválido.', telefone: 'Telefone incompleto.', cep: 'CEP incompleto.', mask: 'Preencha no formato {n}.',
        weak: 'Senha fraca: combine letras maiúsculas, minúsculas, números e símbolos.', maxItems: 'Selecione no máximo {n} opções.',
        invalid: 'Valor inválido.',
        strength: 'Força: {level}', strength0: 'Muito fraca', strength1: 'Fraca', strength2: 'Média', strength3: 'Forte', strength4: 'Muito forte',
        select: 'Selecione...', noOptions: 'Nenhuma opção encontrada.', optsFail: 'Falha ao carregar as opções.',
        showing: 'Mostrando {shown} de {total} — refine a busca.', clearSel: 'Limpar seleção', searchIn: 'Buscar em {label}', searchAria: 'Buscar',
        remove: 'Remover {item}', increase: 'Aumentar', decrease: 'Diminuir', show: 'Mostrar', hide: 'Ocultar',
        showPwd: 'Mostrar senha', hidePwd: 'Ocultar senha', offline: 'Sem conexão com o servidor.',
        sendFail: 'Não foi possível enviar. Tente novamente.'
      },
      files: {
        drop: 'Arraste arquivos para cá ou', choose: 'Escolher arquivo', selected: 'Arquivos selecionados', invalid: 'Arquivo inválido.',
        badType: '"{name}": tipo de arquivo não permitido (aceitos: {accept}).', tooBig: '"{name}": arquivo muito grande ({size}; máximo {max}).',
        readFail: 'Não foi possível ler "{name}".', dup: '"{name}" já está na lista.', maxFiles: { um: 'Selecione no máximo {n} arquivo.', outros: 'Selecione no máximo {n} arquivos.' },
        badJson: 'JSON inválido.', types: 'Tipos: {types}', max: 'Máx. {size}', maxEach: 'Máx. {size} por arquivo',
        blocked: '"{name}": tipo de arquivo bloqueado por segurança (executável/script).', double: '"{name}": extensão dupla suspeita (ex.: .php.jpg).',
        mismatch: '"{name}": o conteúdo não corresponde à extensão .{ext} (parece {kind}).', uploadFail: 'falha no envio.',
        warnRows: 'Arquivo truncado em {n} linhas.', warnCols: 'Colunas limitadas a {n}.', warnText: 'Arquivo truncado em {n}.', warnCell: 'Textos longos foram cortados em {n} caracteres.',
        warnKey: 'Chaves ignoradas por segurança: {keys}.', warnPath: 'Caminho "{path}" não encontrado; usando a estrutura inteira.', textTooBig: 'Texto grande demais (máximo {n}).'
      },
      imageeditor: {
        title: 'Editar imagem', area: 'Área de edição da imagem',
        help: 'Arraste para mover a imagem. Use a roda do mouse, a pinça (toque) ou as teclas + e − para ampliar, [ e ] para girar 90° e as setas para mover (Shift: passo de 1 px).',
        zoom: 'Zoom', zoomIn: 'Aumentar o zoom', zoomOut: 'Diminuir o zoom', rotateL: 'Girar 90° à esquerda', rotateR: 'Girar 90° à direita',
        flip: 'Espelhar', reset: 'Redefinir', fine: 'Ajuste fino', apply: 'Aplicar', choose: 'Escolher imagem',
        empty: 'Nenhuma imagem carregada.', loading: 'Carregando imagem…',
        badType: '"{name}": formato não aceito. Use PNG, JPEG, WebP ou GIF.', svg: '"{name}": SVG não é aceito (pode conter scripts). Use PNG, JPEG, WebP ou GIF.',
        tooBig: '"{name}": arquivo muito grande ({size}; máximo {max}).', dims: 'Imagem grande demais ({w} × {h} px; máximo {max} px por lado).',
        pixels: 'Imagem com megapixels demais (máximo {mp} MP).', decode: 'Não foi possível abrir a imagem (arquivo corrompido ou incompatível).',
        support: 'Este navegador não consegue editar imagens.', badSrc: 'Origem da imagem não permitida: use um arquivo (File/Blob) ou um endereço data:/blob:.',
        noImage: 'Nenhuma imagem para exportar.', encode: 'Não foi possível gerar a imagem editada.'
      },
      sanitize: {
        warn: 'Atenção: o texto parece conter {kinds}. Ele será enviado como texto comum e o servidor valida de novo.',
        block: 'Conteúdo não permitido neste campo (parece conter {kinds}).',
        sql: 'comando SQL', script: 'código HTML/JavaScript', path: 'caminho de arquivo', prompt: 'instruções para IA', proto: 'chave de protótipo'
      },
      ui: {
        menu: 'Menu', progress: 'Progresso', loadingShort: 'Carregando', loadingContent: 'Carregando conteúdo',
        up: 'Aumento de ', down: 'Queda de ', flat: 'Sem variação: ', pagination: 'Paginação', crumbs: 'Trilha de navegação',
        steps: 'Etapas', step: 'Etapa {n}', stepErr: ' (com erro)', stepDone: ' (concluída)', timeline: 'Linha do tempo',
        noEvents: 'Nenhum evento.', closeAlert: 'Fechar aviso', indicator: 'Indicador', tag: 'etiqueta', avatar: 'Avatar',
        nothing: 'Nada por aqui', notifications: 'Notificações', closeNotice: 'Fechar notificação'
      },
      chart: {
        dlSvg: 'Baixar como SVG', dlPng: 'Baixar como PNG', exportFail: 'Não foi possível exportar: {message}', viewTable: 'Ver como tabela',
        viewChart: 'Ver gráfico', loadFail: 'Não foi possível carregar os dados.', empty: 'Sem dados para exibir.',
        tableLabel: 'Dados do gráfico em tabela', rows: 'Mostrando {shown} de {total} linhas.', item: 'Item', share: 'Participação',
        hidden: ' (oculto)', hiddenF: ' (oculta)'
      }
    }
  });
  add('en', {
    r4: {
      clear: 'Clear', remove: 'Remove', retry: 'Try again',
      http: { status: 'HTTP error {status}' },
      pager: {
        prev: 'Previous page', next: 'Next page', current: 'Page {page}, current', goto: 'Go to page {page}',
        range: '{from}–{to} of {total}', none: 'No records'
      },
      grid: {
        pageSize: 'Rows per page', all: 'All', vrInfo: '{a} to {b} of {n} records',
        filterLabel: 'Filter records', cols: 'Columns', colsTitle: 'Show or hide columns', export: 'Export',
        exportTitle: 'Export the filtered records', retry: 'Try again', resize: 'Drag to resize',
        selectAll: 'Select all filtered records', edit: 'Edit {col}', unsort: 'Clear sorting',
        print: 'Print', printing: 'Printing', total: 'Total', noList: 'Response has no list of records.',
        badJson: 'The response is not valid JSON.', count: { one: '{total} record', other: '{total} records' },
        cfBtn: 'Filter values', cfTitle: 'Filter values of {col}', cfAll: 'Select all', cfClear: 'Clear', cfEmpty: '(empty)',
        cfCount: '{n} of {m} selected', cfSearch: 'Search value...', cfMany: 'Many values ({n}): use the search above.', cfFail: 'Could not load values',
        cfSortCount: 'By count', cfSortAlpha: 'A–Z'
      },
      form: {
        required: 'Required field.', requiredCheck: 'Check this option to continue.', requiredChoice: 'Select an option.',
        minLength: 'Use at least {n} characters.', maxLength: 'Use at most {n} characters.',
        min: 'The minimum value is {n}.', max: 'The maximum value is {n}.', number: 'Enter a valid number.', date: 'Enter a valid date.',
        minDate: 'Enter a date on or after {n}.', maxDate: 'Enter a date on or before {n}.', email: 'Enter a valid email.',
        pattern: 'Invalid format.', match: 'Does not match the "{campo}" field.', cpf: 'Invalid CPF.', cnpj: 'Invalid CNPJ.',
        cpfCnpj: 'Invalid CPF or CNPJ.', telefone: 'Incomplete phone number.', cep: 'Incomplete postal code.', mask: 'Fill in the format {n}.',
        weak: 'Weak password: mix upper and lower case letters, numbers and symbols.', maxItems: 'Select at most {n} options.',
        invalid: 'Invalid value.',
        strength: 'Strength: {level}', strength0: 'Very weak', strength1: 'Weak', strength2: 'Fair', strength3: 'Strong', strength4: 'Very strong',
        select: 'Select...', noOptions: 'No options found.', optsFail: 'Failed to load the options.',
        showing: 'Showing {shown} of {total} — refine your search.', clearSel: 'Clear selection', searchIn: 'Search in {label}', searchAria: 'Search',
        remove: 'Remove {item}', increase: 'Increase', decrease: 'Decrease', show: 'Show', hide: 'Hide',
        showPwd: 'Show password', hidePwd: 'Hide password', offline: 'No connection to the server.',
        sendFail: 'Could not send. Please try again.'
      },
      files: {
        drop: 'Drag files here or', choose: 'Choose file', selected: 'Selected files', invalid: 'Invalid file.',
        badType: '"{name}": file type not allowed (accepted: {accept}).', tooBig: '"{name}": file too large ({size}; maximum {max}).',
        readFail: 'Could not read "{name}".', dup: '"{name}" is already in the list.', maxFiles: { one: 'Select at most {n} file.', other: 'Select at most {n} files.' },
        badJson: 'Invalid JSON.', types: 'Types: {types}', max: 'Max. {size}', maxEach: 'Max. {size} per file',
        blocked: '"{name}": file type blocked for security (executable/script).', double: '"{name}": suspicious double extension (e.g. .php.jpg).',
        mismatch: '"{name}": the content does not match the .{ext} extension (looks like {kind}).', uploadFail: 'upload failed.',
        warnRows: 'File truncated at {n} rows.', warnCols: 'Columns limited to {n}.', warnText: 'File truncated at {n}.', warnCell: 'Long texts were cut at {n} characters.',
        warnKey: 'Keys ignored for security: {keys}.', warnPath: 'Path "{path}" not found; using the whole structure.', textTooBig: 'Text too large (maximum {n}).'
      },
      imageeditor: {
        title: 'Edit image', area: 'Image editing area',
        help: 'Drag to move the image. Use the mouse wheel, pinch (touch) or the + and − keys to zoom, [ and ] to rotate 90°, and the arrow keys to move (Shift: 1 px steps).',
        zoom: 'Zoom', zoomIn: 'Zoom in', zoomOut: 'Zoom out', rotateL: 'Rotate 90° left', rotateR: 'Rotate 90° right',
        flip: 'Flip', reset: 'Reset', fine: 'Fine rotation', apply: 'Apply', choose: 'Choose image',
        empty: 'No image loaded.', loading: 'Loading image…',
        badType: '"{name}": format not accepted. Use PNG, JPEG, WebP or GIF.', svg: '"{name}": SVG is not accepted (it can contain scripts). Use PNG, JPEG, WebP or GIF.',
        tooBig: '"{name}": file too large ({size}; maximum {max}).', dims: 'Image too large ({w} × {h} px; maximum {max} px per side).',
        pixels: 'Image has too many megapixels (maximum {mp} MP).', decode: 'Could not open the image (corrupted or incompatible file).',
        support: 'This browser cannot edit images.', badSrc: 'Image source not allowed: use a file (File/Blob) or a data:/blob: address.',
        noImage: 'No image to export.', encode: 'Could not generate the edited image.'
      },
      sanitize: {
        warn: 'Heads up: the text looks like it contains {kinds}. It will be sent as plain text and the server validates it again.',
        block: 'Content not allowed in this field (looks like {kinds}).',
        sql: 'an SQL command', script: 'HTML/JavaScript code', path: 'a file path', prompt: 'instructions for an AI', proto: 'a prototype key'
      },
      ui: {
        menu: 'Menu', progress: 'Progress', loadingShort: 'Loading', loadingContent: 'Loading content',
        up: 'Increase of ', down: 'Decrease of ', flat: 'No change: ', pagination: 'Pagination', crumbs: 'Breadcrumb',
        steps: 'Steps', step: 'Step {n}', stepErr: ' (with error)', stepDone: ' (completed)', timeline: 'Timeline',
        noEvents: 'No events.', closeAlert: 'Dismiss alert', indicator: 'Indicator', tag: 'tag', avatar: 'Avatar',
        nothing: 'Nothing here', notifications: 'Notifications', closeNotice: 'Dismiss notification'
      },
      chart: {
        dlSvg: 'Download as SVG', dlPng: 'Download as PNG', exportFail: 'Could not export: {message}', viewTable: 'View as table',
        viewChart: 'View chart', loadFail: 'Could not load the data.', empty: 'No data to display.',
        tableLabel: 'Chart data as a table', rows: 'Showing {shown} of {total} rows.', item: 'Item', share: 'Share',
        hidden: ' (hidden)', hiddenF: ' (hidden)'
      }
    }
  });

  // troca de idioma: componentes na tela que sabem se retraduzir (relocalize) atualizam o que é simples. Um único ouvinte global.
  i18n.onChange(() => Object.keys(R4.instances).forEach(id => {
    const c = R4.instances[id];
    if (c && !c._destroyed && c.rendered && typeof c.relocalize === 'function') { try { c.relocalize(); } catch (e) { console.error('[R4] relocalize:', e); } }
  }));

  // restaura o idioma salvo (só um código de idioma válido; migra e APAGA a chave antiga r4-locale)
  (function () {
    const valido = v => (typeof v === 'string' && v.length <= 35 ? canon(v) || undefined : undefined);
    const antigo = store.legacy('r4-locale');
    let saved = store.get(LKEY, valido);
    if (!saved && antigo) { saved = valido(antigo); if (saved) store.set(LKEY, saved); }
    if (!saved) return;
    if (dict[saved] || dict[saved.split('-')[0]]) setLocale(saved, { persist: false });
    else pendingLocale = saved;
  })();

  R4.module('i18n', i18n, {
    group: 'Núcleo', title: 'R4.i18n / R4.t',
    description: 'Internacionalização: R4.t("chave", {params}) com interpolação {nome} e plural via Intl.PluralRules; dicionários pt-BR e en já trazem TODAS as strings fixas da lib sob r4.*; fallback para pt-BR; formatos de número, moeda e data por locale; atributo lang no <html>. No HTML: <r4-t key="r4.empty"></r4-t> ou r4-i18n="chave" em qualquer elemento (atualizam sozinhos ao trocar o idioma). Os textos fixos de TODOS os componentes (grid, form, ui, chart, files, diálogos, aria-labels) vêm de r4.*: ao trocar o idioma, o que está na tela se atualiza (atributo r4-i18n e método relocalize de cada componente; um único ouvinte global) e componentes novos já nascem no idioma atual. Para adicionar um idioma: R4.i18n.add("es", { r4: { empty: "Sin registros.", ... } }) e R4.i18n.set("es") — chaves ausentes usam pt-BR.',
    props: [
      { name: "R4.t('chave', {params})", type: 'string', desc: "Interpola {nome}. Plural: mensagem {um:'{n} item', outros:'{n} itens'} escolhida pelo parâmetro n (ou count). Chave ausente → fallback pt-BR → a própria chave (com aviso). Devolve TEXTO (params não são escapados): <r4-t>/r4-i18n usam textContent; se você concatenar em HTML, escape com R4.util.esc." },
      { name: "i18n.set('pt-BR' | 'en')", type: 'R4.i18n', desc: 'Troca o idioma: atualiza <html lang>, salva no R4.store (r4:locale, 180 dias renovados a cada uso), retraduz <r4-t>/r4-i18n e dispara onChange.' },
      { name: 'i18n.add(locale, mensagens)', type: 'R4.i18n', desc: "Adiciona/mescla mensagens (aceita objetos aninhados: {r4:{ok:'OK'}} → 'r4.ok')." },
      { name: 'i18n.locale', type: 'string', desc: 'Idioma atual (somente leitura). i18n.locales lista os disponíveis.' },
      { name: 'i18n.onChange(fn(locale, anterior))', type: 'function', desc: 'Escuta trocas de idioma; devolve a função para cancelar.' },
      { name: 'i18n.number(n, opts) / money(n, moeda) / date(v, opts)', type: 'string', desc: 'Formatos via Intl no idioma atual. money usa BRL em pt, USD em en (ou a moeda informada). date aceita AAAA-MM-DD como data local.' },
      { name: 'Novo idioma', type: 'receita', desc: "1) R4.i18n.add('es', { r4: { ok: 'Aceptar', empty: 'Sin registros.', pager: { info: { one: '{page} / {pages} · {n} registro', other: '{page} / {pages} · {n} registros' } } } }); 2) R4.i18n.set('es'). Só traduza o que quiser: o resto cai no pt-BR. A lista completa de chaves está nos blocos add('pt-BR') e add('en') do fim de theme.js. Textos próprios: use outro prefixo (app.*) e R4.t('app.chave')." },
      { name: 'componente.relocalize()', type: 'método (opcional)', desc: 'Componentes com textos montados em código (grid, select, passwordfield, form, filedrop, chart, pagination) definem relocalize(), chamado por um único ouvinte global ao trocar o idioma. Textos estáticos usam R4.util.tx(el, chave, reserva[, atributo]), que grava o r4-i18n no elemento.' },
      { name: 'R4.util.T(chave, params, reserva) / R4.util.tx(...)', type: 'helpers', desc: 'T = R4.t com texto de reserva se o módulo i18n não estiver carregado (resolva em tempo de uso, não no define). Params são TEXTO: ao montar HTML, escape com R4.util.esc (os componentes da lib usam textContent).' },
      { name: 'i18n.has(chave)', type: 'boolean', desc: 'A chave existe (no idioma, no idioma-base ou no pt-BR).' },
      { name: 'i18n.bind(elemento)', type: 'R4.i18n', desc: 'Traduz <r4-t>/r4-i18n dentro do elemento agora (normalmente automático via MutationObserver).' },
      { name: '<r4-t key="r4.empty" n="3" params=\'{"nome":"Ana"}\'>', type: 'tag', desc: 'Texto traduzido; o conteúdo da tag é o reserva se a chave não existir.' },
      { name: 'r4-i18n="chave" | "placeholder:chave;title:chave"', type: 'atributo', desc: 'Sem prefixo troca o texto (textContent) do elemento; com prefixo, o atributo (só placeholder, title, aria-label, alt, label, aria-description).' }
    ],
    events: ['change (onChange)']
  });
})(window.R4);
