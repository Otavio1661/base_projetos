/**
 * ============================================
 * libr4 / form.js  —  R4 dev
 * ============================================
 * Formulários: form, select (com busca e múltipla escolha), checkbox, switch,
 * radiogroup, textarea, numberfield, datefield, passwordfield, maskfield,
 * fieldset e formrow + validação declarativa (R4.validation).
 *
 *   <r4-form action="/vitrine/api/cadastro" encrypt>
 *     <r4-textfield name="nome" label="Nome" required min-length="3"></r4-textfield>
 *     <r4-select name="uf" label="UF" src="/showcase/vitrineData/estados.json" searchable></r4-select>
 *     <r4-button type="submit">Salvar</r4-button>
 *   </r4-form>
 *
 *   R4.form('#alvo', { action: '/api/x', fields: [{ type: 'text', name: 'nome', label: 'Nome', required: true }] })
 *
 * Também amplia o textfield existente (required, validação, mensagem de erro,
 * helpText, disabled, readOnly) sem alterar components.js.
 * ============================================
 */
(function (R4) {
  'use strict';
  const { el } = R4.util;
  const T = R4.util.T;   // R4.t com reserva (theme.js carrega por último; resolvido em tempo de uso)
  const G = 'Formulários';
  const proto = x => R4.registry[x].cls.prototype;
  const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  const fmt = (s, o) => String(s).replace(/\{(\w+)\}/g, (_, k) => (o && o[k] != null ? o[k] : ''));
  const bool = v => v === true || v === 'true' || v === '' || v === '1' || v === 1;
  const fold = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const onlyDigits = s => String(s ?? '').replace(/\D+/g, '');
  const alnumUp = s => String(s ?? '').toUpperCase().replace(/[^0-9A-Z]+/g, '');

  /* =====================================================================
   * R4.validation — mensagens, validadores, máscaras
   * ===================================================================== */
  const MSG = {
    required: 'Campo obrigatório.',
    requiredCheck: 'Marque esta opção para continuar.',
    requiredChoice: 'Selecione uma opção.',
    minLength: 'Use pelo menos {n} caracteres.',
    maxLength: 'Use no máximo {n} caracteres.',
    min: 'O valor mínimo é {n}.',
    max: 'O valor máximo é {n}.',
    number: 'Informe um número válido.',
    date: 'Informe uma data válida.',
    minDate: 'Informe uma data a partir de {n}.',
    maxDate: 'Informe uma data até {n}.',
    email: 'Informe um e-mail válido.',
    pattern: 'Formato inválido.',
    match: 'Não confere com o campo "{campo}".',
    cpf: 'CPF inválido.',
    cnpj: 'CNPJ inválido.',
    cpfCnpj: 'CPF ou CNPJ inválido.',
    telefone: 'Telefone incompleto.',
    cep: 'CEP incompleto.',
    mask: 'Preencha no formato {n}.',
    weak: 'Senha fraca: combine letras maiúsculas, minúsculas, números e símbolos.',
    maxItems: 'Selecione no máximo {n} opções.',
    invalid: 'Valor inválido.'
  };

  // MSG é o catálogo pt-BR editável (R4.validation.messages.x = '...'); quem não o editou acompanha o idioma (r4.form.*)
  const DEF_MSG = Object.assign({}, MSG);
  const msgOf = k => { if (!(k in MSG)) k = 'invalid'; return MSG[k] !== DEF_MSG[k] ? MSG[k] : T('r4.form.' + k, 0, MSG[k]); };

  function cpfValid(v) {
    const d = onlyDigits(v);
    if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
    const dv = n => { let s = 0; for (let i = 0; i < n; i++) s += +d[i] * (n + 1 - i); const r = (s * 10) % 11; return r === 10 ? 0 : r; };
    return dv(9) === +d[9] && dv(10) === +d[10];
  }
  /** CNPJ numérico ou alfanumérico (Receita Federal, 2026): 12 posições [0-9A-Z] + 2 dígitos verificadores. */
  function cnpjValid(v) {
    const c = alnumUp(v);
    if (!/^[0-9A-Z]{12}[0-9]{2}$/.test(c) || /^(.)\1{13}$/.test(c)) return false;
    const dv = n => {
      let s = 0, w = n - 7;
      for (let i = 0; i < n; i++) { s += (c.charCodeAt(i) - 48) * w; w = w === 2 ? 9 : w - 1; }
      const r = s % 11; return r < 2 ? 0 : 11 - r;
    };
    return dv(12) === +c[12] && dv(13) === +c[13];
  }
  const emailValid = v => { v = String(v ?? '').trim(); return v.length <= 254 && /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(v); };

  const WEAK = new Set(['12345678', '123456789', '1234567890', 'password', 'senha123', 'qwerty123', 'abc12345', '11111111', 'senha1234', 'admin123']);
  /** Força da senha: 0 (muito fraca) a 4 (muito forte). */
  function strength(pw) {
    pw = String(pw ?? '');
    if (!pw) return 0;
    let s = 0;
    if (pw.length >= 8) s++;
    if (pw.length >= 12) s++;
    if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s++;
    if (/[0-9]/.test(pw)) s++;
    if (/[^A-Za-z0-9]/.test(pw)) s++;
    if (pw.length < 8) s = Math.min(s, 1);
    if (/^(.)\1+$/.test(pw) || WEAK.has(pw.toLowerCase())) s = 0;
    return Math.min(4, s);
  }
  const STRENGTH_TXT = ['Muito fraca', 'Fraca', 'Média', 'Forte', 'Muito forte'];   // reserva pt-BR; o texto vem de r4.form.strength0..4

  /* ---- máscaras: 9 = dígito, A = letra, S = letra ou dígito; o resto é literal ---- */
  const TOKENS = { '9': /[0-9]/, 'A': /[A-Za-z]/, 'S': /[0-9A-Za-z]/ };
  const SIG = /[0-9A-Za-z]/;
  const NAMED = {
    cpf: () => '999.999.999-99',
    cnpj: () => 'SS.SSS.SSS/SSSS-99',
    cpfcnpj: v => (/[A-Za-z]/.test(v) || (String(v).match(/[0-9A-Za-z]/g) || []).length > 11 ? 'SS.SSS.SSS/SSSS-99' : '999.999.999-999'),
    telefone: v => (onlyDigits(v).length > 10 ? '(99) 99999-9999' : '(99) 9999-99999'),
    cep: () => '99999-999',
    data: () => '99/99/9999',
    hora: () => '99:99',
    cartao: () => '9999 9999 9999 9999'
  };
  NAMED.celular = NAMED.fone = NAMED.telefone;
  const MAX_MASK = 64;
  const patternOf = (mask, v) => {
    const k = String(mask || '').toLowerCase();
    if (NAMED[k]) return NAMED[k](v);
    return String(mask || '').slice(0, MAX_MASK);
  };
  /** Aplica o padrão: devolve { masked, raw } (raw = só os caracteres significativos). */
  function applyMask(value, pattern) {
    const src = String(value ?? '');
    let masked = '', raw = '', pend = '', i = 0;
    for (let p = 0; p < pattern.length && i < src.length; p++) {
      const tk = TOKENS[pattern[p]];
      if (!tk) { pend += pattern[p]; continue; }
      while (i < src.length && !tk.test(src[i])) i++;
      if (i >= src.length) break;
      const ch = pattern[p] === '9' ? src[i] : src[i].toUpperCase();
      masked += pend + ch; raw += ch; pend = ''; i++;
    }
    return { masked, raw };
  }
  const tokenCount = pattern => [...pattern].filter(c => TOKENS[c]).length;
  const moneyText = cents => (cents == null ? '' : R4.util.money(cents / 100));
  function maskValue(v, mask) {
    if (String(mask).toLowerCase() === 'moeda') {
      const n = typeof v === 'number' ? v : null;
      if (n != null) return isFinite(n) ? moneyText(Math.round(n * 100)) : '';
      const d = onlyDigits(v).replace(/^0+(?=\d)/, '').slice(0, 15);
      return d ? moneyText(Number(d)) : '';
    }
    return applyMask(v, patternOf(mask, v)).masked;
  }
  function unmaskValue(v, mask) {
    if (String(mask).toLowerCase() === 'moeda') { const d = onlyDigits(v).slice(0, 15); return d ? Number(d) / 100 : null; }
    return applyMask(v, patternOf(mask, v)).raw;
  }

  /** Número no formato pt-BR ("1.234,56") ou JS ("1234.56"). '' → null; inválido → NaN. */
  function parseNumber(s) {
    if (typeof s === 'number') return isFinite(s) ? s : NaN;
    s = String(s ?? '').replace(/[\s ]|R\$|%/g, '');
    if (!s) return null;
    if (!/^[-+]?[0-9.,]+$/.test(s)) return NaN;
    if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
    else if ((s.match(/\./g) || []).length > 1 || /^[-+]?[0-9]{1,3}\.[0-9]{3}$/.test(s)) s = s.replace(/\./g, '');
    const n = Number(s);
    return isFinite(n) ? n : NaN;
  }
  const numText = (n, d) => (n == null || isNaN(n) ? '' : Number(n).toLocaleString('pt-BR', d >= 0 ? { minimumFractionDigits: d, maximumFractionDigits: d } : { maximumFractionDigits: 10 }));

  /* ---- pattern: string → RegExp (tamanho limitado, sem eval, com cache, anti-ReDoS) ---- */
  const MAX_PATTERN = 512, MAX_TEST = 5000, reCache = new Map();
  /**
   * Detecta quantificador repetitivo (*, +, {n,}, {n≥10} ou {n,m≥10}) aplicado a um grupo que já contém
   * quantificador ilimitado — (a+)+, (\w*x)*, (a+){2,} — o formato clássico de backtracking
   * catastrófico (ReDoS). Heurística: não pega alternâncias sobrepostas como (a|aa)+.
   */
  function nestedQuant(p) {
    const stack = [];
    let closed = null;   // flag "tem ilimitado dentro" do grupo que acabou de fechar (null = token anterior não foi ')')
    for (let i = 0; i < p.length; i++) {
      const c = p[i];
      if (c === '\\') { i++; closed = null; continue; }
      if (c === '[') {   // classe de caracteres: pula até o ] (respeitando escapes)
        let j = i + 1; if (p[j] === '^') j++; if (p[j] === ']') j++;
        while (j < p.length && p[j] !== ']') { if (p[j] === '\\') j++; j++; }
        i = j; closed = null; continue;
      }
      if (c === '(') { stack.push(false); closed = null; continue; }
      if (c === ')') {
        const inner = stack.length ? stack.pop() : false;
        if (inner && stack.length) stack[stack.length - 1] = true;
        closed = inner; continue;
      }
      let q = null;   // 'u' = ilimitado, 'r' = repete muito (limitado), 'b' = limitado/opcional
      if (c === '*' || c === '+') q = 'u';
      else if (c === '?') q = 'b';
      else if (c === '{') {
        const m = /^\{(\d+)(,(\d*))?\}/.exec(p.slice(i));
        if (m) { q = m[2] ? (m[3] === '' ? 'u' : +m[3] >= 10 ? 'r' : 'b') : +m[1] >= 10 ? 'r' : 'b'; i += m[0].length - 1; }
      }
      if (q) {
        if (closed && (q === 'u' || q === 'r')) return true;
        if (q === 'u' && stack.length) stack[stack.length - 1] = true;
        if (p[i + 1] === '?' || p[i + 1] === '+') i++;   // preguiçoso/possessivo
        closed = null; continue;
      }
      closed = null;
    }
    return false;
  }
  function compilePattern(p) {
    if (p instanceof RegExp) return p;   // RegExp passado por código é responsabilidade de quem escreveu
    p = String(p);
    if (reCache.has(p)) return reCache.get(p);
    let re = null;
    if (p.length > MAX_PATTERN) R4.warn('pattern ignorado: maior que ' + MAX_PATTERN + ' caracteres');
    else if (nestedQuant(p)) R4.warn('pattern ignorado: quantificador aninhado (ex.: (a+)+) pode travar a página (ReDoS) — reescreva sem repetir um grupo que já repete: ' + p.slice(0, 60));
    else {
      try { re = new RegExp('^(?:' + p + ')$', 'u'); }
      catch (e) { try { re = new RegExp('^(?:' + p + ')$'); } catch (e2) { R4.warn('pattern inválido ignorado: ' + e2.message); } }
    }
    if (reCache.size > 200) reCache.clear();
    reCache.set(p, re);
    return re;
  }

  const VALIDATORS = {
    cpf: v => cpfValid(v) || msgOf('cpf'),
    cnpj: v => cnpjValid(v) || msgOf('cnpj'),
    cpfCnpj: v => (alnumUp(v).length <= 11 ? cpfValid(v) : cnpjValid(v)) || msgOf('cpfCnpj'),
    email: v => emailValid(v) || msgOf('email'),
    cep: v => onlyDigits(v).length === 8 || msgOf('cep'),
    telefone: v => /^[0-9]{10,11}$/.test(onlyDigits(v)) || msgOf('telefone')
  };

  const validation = R4.module('validation', {
    messages: MSG, validators: VALIDATORS,
    cpf: cpfValid, cnpj: cnpjValid, email: emailValid, strength,
    mask: maskValue, unmask: unmaskValue, parseNumber,
    /** Registra um validador nomeado: R4.validation.register('par', v => v % 2 === 0 || 'Use um número par.') */
    register(name, fn) { if (typeof fn === 'function') VALIDATORS[name] = fn; return this; }
  }, {
    title: 'R4.validation', group: G,
    description: 'Validação e máscaras usadas pelos campos: mensagens em português (editáveis), CPF/CNPJ com dígitos verificadores (inclusive CNPJ alfanumérico), e-mail, força de senha, máscaras e leitura de números pt-BR.',
    props: [
      { name: 'messages', type: 'object', desc: 'Mensagens padrão (required, minLength, email, cpf...). Edite para mudar o texto em toda a aplicação; {n} e {campo} são trocados.' },
      { name: 'validators', type: 'object', desc: 'Validadores nomeados usados em validator="cpf": cpf, cnpj, cpfCnpj, email, cep, telefone.' },
      { name: 'register(nome, fn)', type: 'método', desc: 'Adiciona um validador nomeado. fn(valor, valores) devolve true ou a mensagem de erro.' },
      { name: 'cpf(v) / cnpj(v) / email(v)', type: 'boolean', desc: 'Conferem formato e dígitos verificadores (aceita com ou sem máscara).' },
      { name: 'strength(senha)', type: 'number', desc: 'Força de 0 (muito fraca) a 4 (muito forte).' },
      { name: 'mask(valor, máscara) / unmask(valor, máscara)', type: 'string', desc: "Formata e remove máscara. Máscaras: cpf, cnpj, cpfcnpj, telefone, cep, moeda, data, hora, cartao ou padrão livre ('99/99/9999'; 9 = dígito, A = letra, S = letra ou dígito)." },
      { name: 'parseNumber(texto)', type: 'number|null', desc: '"1.234,56" → 1234.56; vazio → null; inválido → NaN.' }
    ]
  });
  R4.validation = validation;

  /* =====================================================================
   * Base dos campos (mixin) — também aplicada ao textfield existente
   * ===================================================================== */
  const FIELD_CFG = { name: '', label: '', value: '', required: false, disabled: false, readOnly: false, helpText: '',
    validateOn: 'blur', validator: null, messages: {} };
  // sanitize: getValue() devolve texto limpo (R4.sanitize.text) e limitado; guard: 'off'|'warn'|'block' (sinais de injeção)
  const TEXT_CFG = { placeholder: '', minLength: 0, maxLength: 0, pattern: '', patternText: '', email: false, match: '', autocomplete: '',
    sanitize: true, guard: 'warn' };
  const BAD_NAMES = new Set(['__proto__', 'constructor', 'prototype']);
  const OWNER = '.r4-form,.r4-subform';   // quem "possui" os campos: o form ou um item de <r4-repeater>
  const GUARD_TXT = { sql: 'comando SQL', script: 'código HTML/JavaScript', path: 'caminho de arquivo', prompt: 'instruções para IA', proto: 'chave de protótipo' };

  /** destroy idempotente que também destrói componentes montados pelo HTML interno */
  function destroyAll() {
    if (this._destroyed) return;
    if (!this.fire('beforedestroy', this)) return;
    this._destroyed = true;
    this._cleanup && this._cleanup();
    if (this.el) [...this.el.querySelectorAll('.r4-cmp')].reverse().forEach(n => {
      const c = R4.instances[n.id];
      if (c && c !== this && c.el === n) c.destroy();
    });
    (this._children || []).forEach(c => R4.instances[c.id] === c && c.destroy());
    this.el && this.el.remove();
    delete R4.instances[this.id];
    this.fire('destroy', this);
  }

  const Field = {
    _ids() { const b = this.id + '-in'; return { input: b, help: b + '-help', err: b + '-err', label: b + '-lbl', list: b + '-list' }; },
    /** Monta a casca: rótulo + controle + ajuda + erro */
    _wrap(control, extraCls, opts = {}) {
      const ids = this._ids(), kids = [];
      if (this.label && !opts.noLabel) {
        const tag = opts.labelTag || 'label';
        this.labelEl = el(tag, { class: 'r4-label', id: ids.label, for: tag === 'label' ? ids.input : null }, [String(this.label)]);
        if (tag !== 'label') this.labelEl.addEventListener('click', () => this.focus());
        kids.push(this.labelEl);
      }
      kids.push(control);
      if (opts.after) kids.push(...opts.after);
      if (this.helpText) kids.push(this.helpEl = el('div', { class: 'r4-help', id: ids.help, text: this.helpText }));
      kids.push(this.errEl = el('div', { class: 'r4-field-error', id: ids.err, hidden: true }));
      const root = el('div', { class: 'r4-field r4-fld' + (extraCls ? ' ' + extraCls : '') }, kids);
      root.addEventListener('focusout', ev => { if (!ev.relatedTarget || !root.contains(ev.relatedTarget)) this._blurred(ev); });
      return root;
    },
    _ctl() { return this.input; },
    _natives() { return this.input ? [this.input] : []; },
    _extraDesc() { return []; },
    /** Chamado no afterRender: guarda o valor inicial e aplica aria/estado */
    _initField() {
      this._initial = this._copy(this.getValue());
      this._reqMark(); this._describe(); this._applyState();
    },
    _copy: v => (Array.isArray(v) ? v.slice() : v),
    _reqMark() {
      const c = this._ctl();
      if (c) this.required ? c.setAttribute('aria-required', 'true') : c.removeAttribute('aria-required');
      if (!this.labelEl) return;
      let m = this.labelEl.querySelector('.r4-req');
      if (this.required && !m) this.labelEl.append(el('span', { class: 'r4-req', 'aria-hidden': 'true', text: ' *' }));
      if (!this.required && m) m.remove();
    },
    _describe() {
      const c = this._ctl(); if (!c) return;
      const ids = [this.helpEl && this.helpEl.id, this.guardEl && !this.guardEl.hidden && this.guardEl.id, this._error && this.errEl && this.errEl.id, ...this._extraDesc()].filter(Boolean);
      ids.length ? c.setAttribute('aria-describedby', ids.join(' ')) : c.removeAttribute('aria-describedby');
    },
    _applyState() {
      if (!this.el) return;
      this.el.classList.toggle('r4-disabled', !!this.disabled);
      this.el.classList.toggle('r4-readonly', !!this.readOnly);
      const nat = this._natives();
      nat.forEach(n => {
        n.disabled = !!this.disabled;
        if (n.type !== 'checkbox' && n.type !== 'radio') n.readOnly = !!this.readOnly;
        else if (n.type === 'checkbox') this.readOnly ? n.setAttribute('aria-readonly', 'true') : n.removeAttribute('aria-readonly');
      });
      const c = this._ctl();
      if (c && !nat.includes(c)) {
        this.disabled ? c.setAttribute('aria-disabled', 'true') : c.removeAttribute('aria-disabled');
        this.readOnly ? c.setAttribute('aria-readonly', 'true') : c.removeAttribute('aria-readonly');
      }
    },
    getName() { return this.name; },
    getError() { return this._error || ''; },
    isEmpty(v = this.getValue()) {
      return v == null || v === false || (typeof v === 'number' && isNaN(v)) || (typeof v === 'string' && !v.trim()) || (Array.isArray(v) && !v.length);
    },
    isDirty() { return !same(this.getValue(), this._initial); },
    /** Torna o valor atual o "original" (isDirty volta a false; reset volta para ele). */
    commit() { this._initial = this._copy(this.getValue()); return this; },
    reset() {
      this.setValue(this._copy(this._initial));
      this.clearError(); this._touched = false; this._validated = false;
      if (this._gKey) { this._gKey = ''; this._showGuard(null); }
      this.fire('reset', this);
      return this;
    },
    setDisabled(b) { this.disabled = !!b; this._applyState(); if (b) this.clearError(); return this; },
    setReadOnly(b) { this.readOnly = !!b; this._applyState(); return this; },
    setRequired(b) { this.required = !!b; this._reqMark(); return this; },
    setLabel(t) { this.label = t; if (this.labelEl) { this.labelEl.firstChild.textContent = t; } return this; },
    focus() { const c = this._focusEl ? this._focusEl() : this._ctl(); c && c.focus(); return this; },
    _msg(k) { return (this.messages && this.messages[k]) || msgOf(k); },
    /** Form dono do campo (ou o item do repeater, ".r4-subform", que se comporta como um mini-form) */
    _form() {
      const p = this.el && this.el.parentElement && this.el.parentElement.closest(OWNER);
      return p ? p._r4sub || R4.instances[p.id] || null : null;
    },
    _formValues() { const f = this._form(); return f ? f.getValues(true) : {}; },
    _labelOf(name) {
      const f = this._form(), o = f && f.getField(name);
      return (o && o.label) || name;
    },
    /* ---- higiene do texto (R4.sanitize) e guarda contra injeção (só nos campos de texto: _textual) ---- */
    _san() { return R4.sanitize && this.sanitize !== false && this.sanitize !== 'false' ? R4.sanitize : null; },
    /** Limite efetivo: maxLength ou, se 0, o padrão seguro (1000; textarea 10000). */
    _limit() {
      const d = R4.sanitize ? R4.sanitize.defaults : { maxText: 1000, maxTextarea: 10000 };
      return this.maxLength > 0 ? +this.maxLength : (this._multiline ? d.maxTextarea : d.maxText);
    },
    _clean(v) { const S = this._san(); return S && typeof v === 'string' ? S.text(v, { max: this._limit(), multiline: !!this._multiline }) : v; },
    _rawText() { return this.input ? String(this.input.value) : String(this.value ?? ''); },
    /** O texto (limpo, sem cortar) passa do limite? (getValue corta; a validação avisa) */
    _over() {
      const S = this._san(); if (!S || !this._textual) return false;
      const raw = this._rawText(), lim = this._limit();
      if (raw.length <= lim) return false;
      if (raw.length > lim * 2 + 64) return true;
      return [...S.text(raw, { max: 0, multiline: !!this._multiline })].length > lim;
    },
    _guardMode() { const g = String(this.guard || 'off').toLowerCase(); return this._textual && (g === 'warn' || g === 'block') ? g : 'off'; },
    /** Sinais de R4.sanitize.detect no texto atual ({kinds, detail} ou null); guarda o último resultado. */
    _findings() {
      const S = R4.sanitize;
      if (!S || this._guardMode() === 'off') return null;
      const raw = this._rawText();
      if (raw !== this._gRaw) {
        // analisa o que SERIA enviado (NUL/bidi/invisíveis já removidos pelo sanitize), não o lixo que some
        const r = S.detect(this._san() ? S.text(raw, { max: 0, multiline: !!this._multiline }) : raw), k = S.kinds(r);
        this._gRaw = raw; this._gRes = k.length ? { kinds: k, detail: r } : null;
      }
      return this._gRes;
    },
    _guardText(kinds, block) {
      const names = kinds.map(x => T('r4.sanitize.' + x, 0, GUARD_TXT[x] || x)).join(', ');
      if (block) return (this.messages && this.messages.suspicious) || T('r4.sanitize.block', { kinds: names }, 'Conteúdo não permitido neste campo (parece conter ' + names + ').');
      return T('r4.sanitize.warn', { kinds: names }, 'Atenção: o texto parece conter ' + names + '. Ele será enviado como texto comum e o servidor valida de novo.');
    },
    /** Depois de cada digitação: aviso visível (warn), validação imediata (block), console.warn e evento suspicious. */
    _guard() {
      const mode = this._guardMode(), f = mode === 'off' ? null : this._findings();
      const key = f ? f.kinds.join(',') : '';
      if (key === (this._gKey || '')) return f;
      this._gKey = key;
      if (f) {
        // nunca registra o VALOR (pode ser dado pessoal); só o campo e as categorias
        console.warn('[R4] campo "' + (this.name || this.id) + '": conteúdo com cara de ' + f.kinds.join('/') + ' — é só um SINAL (o servidor valida de novo; valor não registrado).');
        this.fire('suspicious', this, f.detail, f.kinds);
        this.el && this.el.dispatchEvent(new CustomEvent('r4-suspicious', { bubbles: true, detail: { field: this, kinds: f.kinds, detail: f.detail } }));
      }
      if (mode === 'warn') this._showGuard(f);
      else if (f && !this._destroyed) this.validate();
      return f;
    },
    _showGuard(f) {
      if (!this.el) return;
      if (!f) {
        if (this.guardEl) { this.guardEl.hidden = true; this.guardEl.textContent = ''; }
        this.el.classList.remove('r4-suspect'); this._describe(); return;
      }
      if (!this.guardEl) {
        this.guardEl = el('div', { class: 'r4-guard', id: this._ids().input + '-guard', role: 'status' });
        this.errEl ? this.errEl.before(this.guardEl) : this.el.append(this.guardEl);
      }
      this.guardEl.textContent = this._guardText(f.kinds, false);
      this.guardEl.hidden = false;
      this.el.classList.add('r4-suspect');
      this._describe();
    },
    /** Sinais de injeção no valor atual (mesmo com guard 'off'): {sql, script, path, prompt, proto} */
    getSuspicion() { return R4.sanitize ? R4.sanitize.detect(this._rawText()) : null; },
    /** true ou a mensagem de erro (sem mexer na tela) */
    _check(values) {
      const v = this.getValue();
      const pre = this._preCheck ? this._preCheck() : true;
      if (pre !== true) return pre;
      if (this._textual) {
        if (this._over()) return fmt(this._msg('maxLength'), { n: this._limit() });
        if (this._guardMode() === 'block') { const g = this._findings(); if (g) return this._guardText(g.kinds, true); }
      }
      if (this.isEmpty(v)) return this.required ? this._msg(this._reqKey || 'required') : true;
      if (typeof v === 'string') {
        const len = [...v].length;
        if (this.minLength > 0 && len < this.minLength) return fmt(this._msg('minLength'), { n: this.minLength });
        if (this.maxLength > 0 && len > this.maxLength) return fmt(this._msg('maxLength'), { n: this.maxLength });
        if (this.email && !emailValid(v)) return this._msg('email');
        if (this.pattern) {
          // valor gigante nem chega à regex (limita o custo de qualquer pattern)
          if (String(v).length > MAX_TEST) return this.patternText || this._msg('pattern');
          const re = compilePattern(this.pattern); if (re && !re.test(v)) return this.patternText || this._msg('pattern');
        }
      }
      const t = this._typeCheck ? this._typeCheck(v) : true;
      if (t !== true) return t;
      if (this.match) {
        values = values || this._formValues();
        if (!same(v, values[this.match])) return fmt(this._msg('match'), { campo: this._labelOf(this.match) });
      }
      let fn = this.validator;
      if (typeof fn === 'string') { const n = fn; fn = VALIDATORS[n]; if (!fn) R4.warn('validator desconhecido "' + n + '"'); }
      if (typeof fn === 'function') {
        let r;
        try { r = fn.call(this, v, values || this._formValues(), this); }
        catch (e) { console.error('[R4] validator de "' + (this.name || this.id) + '":', e); r = false; }
        if (r === false) return this._msg('invalid');
        if (typeof r === 'string' && r) return r;
      }
      return true;
    },
    isValid(values) { return this._check(values) === true; },
    /** Valida e mostra/limpa a mensagem. Devolve true se válido. */
    validate(values) {
      if (this.disabled) { this.clearError(); return true; }
      const r = this._check(values);
      this._validated = true;
      r === true ? this.clearError() : this.setError(r);
      return r === true;
    },
    setError(msg) {
      msg = msg == null ? '' : String(msg);
      if (!msg) return this.clearError();
      if (!this.errEl) return this;
      const first = this._error !== msg;
      this._error = msg;
      this.errEl.textContent = msg;
      this.errEl.hidden = false;
      this.errEl.setAttribute('role', 'alert');
      this.el.classList.add('r4-invalid');
      const c = this._ctl(); c && c.setAttribute('aria-invalid', 'true');
      this._describe();
      if (first) this.fire('invalid', this, msg);
      return this;
    },
    clearError() {
      if (!this.errEl) return this;
      const had = !!this._error;
      this._error = '';
      this.errEl.textContent = ''; this.errEl.hidden = true; this.errEl.removeAttribute('role');
      this.el && this.el.classList.remove('r4-invalid');
      const c = this._ctl(); c && c.removeAttribute('aria-invalid');
      if (had) this._describe();
      return this;
    },
    /** O usuário mudou o valor */
    _changed() {
      this._touched = true;
      if (this._textual) this._guard();
      const v = this.getValue();
      this.fire('change', this, v);
      this.el && this.el.dispatchEvent(new CustomEvent('r4-fieldchange', { bubbles: true, detail: { field: this, value: v } }));
      if (this.validateOn === 'input' || (this._error && this.validateOn !== 'submit')) this.validate();
      else if (this._error) this.clearError();
    },
    _blurred(ev) {
      this.fire('blur', this, ev);
      if (this.validateOn !== 'submit' && (this._touched || this._error) && !this._destroyed) this.validate();
    }
  };
  const fieldDocs = [
    { name: 'name', type: 'string', default: "''", desc: 'Nome da chave no objeto de valores do form.' },
    { name: 'label', type: 'string', default: "''", desc: 'Rótulo ligado ao campo (clicar foca o campo).' },
    { name: 'value', type: 'mixed', default: "''", desc: 'Valor inicial (reset volta para ele).' },
    { name: 'required', type: 'boolean', default: 'false', desc: 'Obrigatório (marca * e valida).' },
    { name: 'disabled / readOnly', type: 'boolean', default: 'false', desc: 'Desabilitado (fica fora de getValues) / somente leitura.' },
    { name: 'helpText', type: 'string', default: "''", desc: 'Texto de ajuda sob o campo (aria-describedby).' },
    { name: 'validateOn', type: "'blur'|'input'|'submit'", default: "'blur'", desc: 'Quando validar. Depois do primeiro erro, revalida ao digitar (exceto submit).' },
    { name: 'validator', type: "function(valor, valores) | 'cpf'|'cnpj'|'email'...", default: 'null', desc: 'Regra própria: devolve true ou a mensagem de erro. Pode ser o nome de um R4.validation.validators.' },
    { name: 'messages', type: 'object', default: '{}', desc: 'Troca mensagens só deste campo: { required: "Informe o nome" }.' },
    { name: 'getValue() / setValue(v)', type: 'método', desc: 'Lê / altera o valor (setValue não dispara change).' },
    { name: 'validate() / isValid() / setError(msg) / clearError()', type: 'método', desc: 'Valida mostrando a mensagem / só confere / erro manual.' },
    { name: 'reset() / commit() / isDirty()', type: 'método', desc: 'Volta ao valor original / torna o atual o original / mudou desde o original?' },
    { name: 'focus() / setDisabled(b) / setReadOnly(b) / setRequired(b) / setLabel(t)', type: 'método', desc: 'Controle em tempo de execução.' }
  ];
  const textDocs = [
    { name: 'placeholder', type: 'string', default: "''", desc: 'Dica dentro do campo.' },
    { name: 'minLength / maxLength', type: 'number', default: '0', desc: 'Tamanho mínimo / máximo (0 = sem limite). maxLength também limita a digitação.' },
    { name: 'pattern / patternText', type: 'string', default: "''", desc: 'Expressão regular (o valor inteiro precisa casar; máx. 512 caracteres) e a mensagem se não casar. Anti-ReDoS: padrão com quantificador aninhado como (a+)+ é ignorado com aviso, e valor com mais de 5.000 caracteres é recusado sem rodar a regex. Valide também no servidor.' },
    { name: 'email', type: 'boolean', default: 'false', desc: 'Exige e-mail válido.' },
    { name: 'match', type: 'string', default: "''", desc: 'Nome de outro campo que precisa ter o mesmo valor (ex.: confirmar senha).' },
    { name: 'autocomplete', type: 'string', default: "''", desc: 'Atributo autocomplete do navegador.' },
    { name: 'sanitize', type: 'boolean', default: 'true', desc: 'getValue() devolve o texto limpo por R4.sanitize.text: sem NUL, controles, bidi (U+202E...) e invisíveis, NFC, espaços normalizados, cortado em maxLength (ou no limite padrão: 1000; textarea 10000 — maxLength 0 só desliga o contador/mensagem). false devolve o texto cru.' },
    { name: 'guard', type: "'off' | 'warn' | 'block'", default: "'warn'", desc: "Sinais de injeção (SQL, HTML/JS, caminho, prompt de IA, __proto__) via R4.sanitize.detect. warn: aviso visível no campo, console.warn (sem o valor) e evento suspicious; block: o campo fica inválido e o form não envia. É UX/log — a proteção real é no servidor." },
    { name: 'getSuspicion()', type: 'método', desc: 'Sinais do valor atual: {sql, script, path, prompt, proto}.' }
  ];
  const fieldEvents = ['change', 'blur', 'invalid', 'reset'];
  const textEvents = ['change', 'blur', 'invalid', 'reset', 'suspicious'];

  R4.define('field', Object.assign({ config: Object.assign({}, FIELD_CFG), destroy: destroyAll }, Field), { hidden: true, group: G });

  /** input de texto comum (textfield, passwordfield, maskfield) */
  function textInput(c, attrs) {
    const ids = c._ids();
    const i = el('input', Object.assign({ class: 'r4-input', id: ids.input, type: 'text', name: c.name || null,
      placeholder: c.placeholder || null, autocomplete: c.autocomplete || null,
      maxlength: c.maxLength > 0 ? c.maxLength : (c._textual && c._san && c._san() ? c._limit() : null) }, attrs));
    i.addEventListener('keydown', ev => { if (ev.key === 'Enter') c.fire('enter', c, c.getValue()); });
    return i;
  }

  /* =====================================================================
   * textfield (existente) — ganha validação, erro, helpText, estados
   * ===================================================================== */
  (function augmentTextfield() {
    const e = R4.registry.textfield;
    if (!e) return;
    const P = e.cls.prototype, old = Object.assign({}, P.config);
    Object.assign(P.config, FIELD_CFG, TEXT_CFG, old);
    const own = Object.assign({}, Field, {
      _textual: true,
      build() {
        this.input = textInput(this, { type: this.inputType || 'text', oninput: () => this._changed() });
        this.input.value = this.value ?? '';
        return this._wrap(this.input, 'r4-textfield');
      },
      afterRender() { this._initField(); },
      getValue() { return this._clean(this.input ? this.input.value : (this.value ?? '')); },
      setValue(v) { if (this.input) this.input.value = v ?? ''; else this.value = v; return this; }
    });
    Object.defineProperties(P, Object.getOwnPropertyDescriptors(own));
    const m = e.meta;
    m.description = 'Campo de texto com rótulo, validação (obrigatório, tamanho, e-mail, pattern, match, validator), mensagem de erro acessível e eventos change/enter/blur.';
    m.props = [{ name: 'inputType', type: 'string', default: "'text'", desc: 'text, email, url, tel, search...' }, ...fieldDocs, ...textDocs];
    m.events = ['change', 'enter', 'blur', 'invalid', 'reset', 'suspicious'];
    if (m.playground) m.playground.controls = Object.assign({}, m.playground.controls, { required: false, minLength: 0, email: false, helpText: '', validateOn: ['blur', 'input', 'submit'], disabled: false, guard: ['warn', 'block', 'off'], sanitize: true });
  })();

  /* =====================================================================
   * Opções (select / radiogroup): estáticas, r4-option ou src
   * ===================================================================== */
  function normOptions(list, vf, tf) {
    if (!Array.isArray(list)) return [];
    return list.map(o => {
      if (o == null) return null;
      if (typeof o !== 'object') return { value: String(o), text: String(o) };
      const value = (vf ? o[vf] : undefined) ?? o.valor ?? o.value ?? o.id ?? o.codigo ?? o.sigla;
      if (value == null) return null;
      const text = (tf ? o[tf] : undefined) ?? o.texto ?? o.text ?? o.label ?? o.nome ?? o.descricao ?? value;
      return { value: String(value), text: String(text), disabled: !!(o.disabled || o.desabilitado) };
    }).filter(Boolean);
  }
  const Options = {
    setOptions(list) {
      this.options = Array.isArray(list) ? list : [];
      this.opts = normOptions(this.options, this.valueField, this.textField);
      this._optionsChanged();
      return this;
    },
    getOptions() { return (this.opts || []).slice(); },
    /** Carrega as opções de `src` (GET). Aceita array, {retorno|data|rows} ou a chave indicada em `root`. */
    async load(src = this.src) {
      if (!src || !this.el) return this;
      const seq = this._loadSeq = (this._loadSeq || 0) + 1;
      this._loading = true; this._loadFailed = false;
      this.el.classList.add('r4-loading'); this._ctl().setAttribute('aria-busy', 'true');
      this._optionsChanged();
      try {
        const r = await R4.http.request(src, { method: 'GET', encrypt: false });
        if (seq !== this._loadSeq || this._destroyed) return this;
        let rows = r;
        if (this.root) rows = String(this.root).split('.').reduce((o, k) => (o == null ? o : o[k]), r);
        else if (!Array.isArray(r)) rows = r && (r.retorno || r.data || r.rows);
        this._loading = false;
        this.setOptions(Array.isArray(rows) ? rows : []);
        this.fire('load', this, this.getOptions());
      } catch (e) {
        if (seq !== this._loadSeq || this._destroyed) return this;
        this._loading = false; this._loadFailed = true;
        this._optionsChanged();
        this.fire('loaderror', this, e);
      } finally {
        if (seq === this._loadSeq && !this._destroyed) { this.el.classList.remove('r4-loading'); this._ctl().removeAttribute('aria-busy'); }
      }
      return this;
    },
    reload() { return this.load(); }
  };
  const OPT_CFG = { options: [], src: '', root: '', valueField: '', textField: '' };
  const optionDocs = [
    { name: 'options', type: 'Array<{valor,texto} | {value,text} | string>', default: '[]', desc: 'Opções. Também pode usar filhos <r4-option value="x">Texto</r4-option>.' },
    { name: 'src', type: 'string', default: "''", desc: 'URL (GET) das opções: array ou {retorno|data|rows}. reload() busca de novo.' },
    { name: 'root', type: 'string', default: "''", desc: 'Caminho até a lista dentro da resposta (ex.: "planos" em opcoes.json).' },
    { name: 'valueField / textField', type: 'string', default: "''", desc: 'Chaves do valor e do texto quando não forem valor/value/id e texto/text/label/nome.' },
    { name: 'setOptions(lista) / getOptions() / load(url)', type: 'método', desc: 'Troca, lê ou carrega as opções.' }
  ];

  /* =====================================================================
   * select — combobox próprio (busca, múltipla escolha, teclado completo)
   * ===================================================================== */
  R4.define('select', Object.assign({}, Options, {
    extend: 'field',
    config: Object.assign({}, OPT_CFG, { placeholder: '', searchable: false, multiple: false, maxItems: 0, clearable: false,
      emptyText: '', searchPlaceholder: '', maxVisible: 300 }),   // '' = texto padrão no idioma atual
    _ph() { return this.placeholder || T('r4.form.select', 0, 'Selecione...'); },
    relocalize() { this._renderDisplay && this._renderDisplay(); this._open && this._renderList && this._renderList(this._active); },
    _reqKey: 'requiredChoice',
    build() {
      const ids = this._ids();
      this._val = this._parse(this.value);
      this.opts = normOptions(this.options, this.valueField, this.textField);
      this._q = ''; this._active = -1; this._view = [];
      this.display = el('span', { class: 'r4-select-value' });
      this.trigger = el('div', { class: 'r4-input r4-select-trigger', id: ids.input, role: 'combobox', tabindex: '0',
        'aria-haspopup': 'listbox', 'aria-expanded': 'false', 'aria-controls': ids.list,
        'aria-labelledby': this.label ? ids.label : null, 'aria-label': this.label ? null : this._ph() }, [this.display]);
      if (this.clearable) {
        this.clearBtn = el('button', { type: 'button', class: 'r4-select-clear', tabindex: '-1', 'aria-label': T('r4.form.clearSel', 0, 'Limpar seleção'),
          onclick: ev => { ev.stopPropagation(); if (!this.disabled && !this.readOnly) this.clear(); } }, [R4.icon('close')]);
        this.trigger.append(this.clearBtn);
      }
      this.trigger.append(el('span', { class: 'r4-select-arrow', 'aria-hidden': 'true' }, [R4.icon('chevron-down')]));
      this.trigger.addEventListener('click', ev => {
        const x = ev.target.closest('.r4-chip-x');
        if (x) { ev.stopPropagation(); if (!this.disabled && !this.readOnly) this._toggle(x.getAttribute('data-v'), false); return; }
        this._open ? this.close() : this.open();
      });
      this.trigger.addEventListener('keydown', ev => this._key(ev));

      this.list = el('ul', { class: 'r4-select-list', role: 'listbox', id: ids.list, tabindex: '-1',
        'aria-multiselectable': this.multiple ? 'true' : null, 'aria-labelledby': this.label ? ids.label : null });
      this.note = el('div', { class: 'r4-select-note', hidden: true });
      const kids = [];
      if (this.searchable) {
        this.search = el('input', { class: 'r4-input r4-select-search', type: 'text', role: 'combobox', autocomplete: 'off',
          'aria-autocomplete': 'list', 'aria-expanded': 'true', 'aria-controls': ids.list, placeholder: this.searchPlaceholder || T('r4.search', 0, 'Buscar...'),
          'aria-label': this.label ? T('r4.form.searchIn', { label: this.label }, 'Buscar em ' + this.label) : T('r4.form.searchAria', 0, 'Buscar') });
        this.search.addEventListener('input', () => { this._q = this.search.value; this._renderList(0); });
        this.search.addEventListener('keydown', ev => this._key(ev));
        kids.push(this.search);
      }
      kids.push(this.list, this.note);
      this.pop = el('div', { class: 'r4-select-pop', hidden: true }, kids);
      // clicar na lista não tira o foco do campo (evita blur antes da escolha)
      this.pop.addEventListener('mousedown', ev => { if (ev.target !== this.search) ev.preventDefault(); });
      this.list.addEventListener('click', ev => {
        const li = ev.target.closest('li[role="option"]');
        if (li) { this._setActive(+li.getAttribute('data-i'), true); this._pick(this._view[+li.getAttribute('data-i')]); }
      });
      this._outside = ev => { if (this._open && !this.el.contains(ev.target)) this.close(); };
      this._repos = () => this._open && this._position();
      const root = this._wrap(el('div', { class: 'r4-select-box' }, [this.trigger, this.pop]), 'r4-selectfield' + (this.multiple ? ' r4-multi' : ''), { labelTag: 'span' });
      root.addEventListener('focusout', ev => { if (this._open && (!ev.relatedTarget || !root.contains(ev.relatedTarget))) this.close(); });
      this._renderDisplay();
      return root;
    },
    afterRender() { this._initField(); if (this.src) this.load(); },
    _ctl() { return this.trigger; },
    _natives() { return this.search ? [this.search] : []; },
    _applyState() {
      Field._applyState.call(this);
      if (this.trigger) this.trigger.tabIndex = this.disabled ? -1 : 0;
      if (this.disabled && this._open) this.close();
    },
    _parse(v) {
      if (!this.multiple) return v == null ? '' : Array.isArray(v) ? String(v[0] ?? '') : String(v);
      if (Array.isArray(v)) return v.map(String);
      if (v == null || v === '') return [];
      const s = String(v).trim();
      if (s[0] === '[') { try { const a = JSON.parse(s); if (Array.isArray(a)) return a.map(String); } catch (e) { /* lista simples */ } }
      return s.split(',').map(x => x.trim()).filter(Boolean);
    },
    _isSel(v) { return this.multiple ? this._val.includes(v) : this._val === v; },
    _textOf(v) { const o = this.opts.find(x => x.value === v); return o ? o.text : v; },
    getValue() { return this.multiple ? this._val.slice() : this._val; },
    setValue(v) {
      this._val = this._parse(v);
      if (this.multiple && this.maxItems > 0) this._val = this._val.slice(0, this.maxItems);
      this._renderDisplay();
      if (this._open) this._renderList(this._active);
      return this;
    },
    /** Opção(ões) selecionada(s): {value, text} ou array */
    getSelected() {
      const pick = v => this.opts.find(o => o.value === v) || { value: v, text: v };
      return this.multiple ? this._val.map(pick) : (this._val ? pick(this._val) : null);
    },
    getText() { const s = this.getSelected(); return Array.isArray(s) ? s.map(o => o.text).join(', ') : (s ? s.text : ''); },
    clear() { const had = !this.isEmpty(); this._val = this.multiple ? [] : ''; this._renderDisplay(); if (this._open) this._renderList(this._active); if (had) this._changed(); return this; },
    _optionsChanged() { this._renderDisplay(); if (this._open) this._renderList(Math.max(0, this._active)); },
    _renderDisplay() {
      if (!this.display) return;
      const d = this.display, empty = this.multiple ? !this._val.length : this._val === '';
      if (empty) {
        d.replaceChildren(el('span', { class: 'r4-placeholder', text: this._loading ? T('r4.loading', 0, 'Carregando...') : this._ph() }));
      } else if (this.multiple) {
        const frag = document.createDocumentFragment();
        this._val.forEach(v => {
          const t = this._textOf(v);
          frag.append(el('span', { class: 'r4-chip' }, [el('span', { text: t }),
            el('button', { type: 'button', class: 'r4-chip-x', tabindex: '-1', 'data-v': v, 'aria-label': T('r4.form.remove', { item: t }, 'Remover ' + t) }, [R4.icon('close')])]));
        });
        d.replaceChildren(frag);
      } else d.replaceChildren(el('span', { class: 'r4-select-text', text: this._textOf(this._val) }));
      if (this.clearBtn) this.clearBtn.hidden = empty;
    },
    _optId(i) { return this._ids().list + '-' + i; },
    _renderList(active) {
      const q = fold(this._q.trim());
      const all = q ? this.opts.filter(o => fold(o.text).includes(q)) : this.opts;
      this._view = all.slice(0, Math.max(1, this.maxVisible));
      const frag = document.createDocumentFragment();
      this._view.forEach((o, i) => {
        const sel = this._isSel(o.value);
        frag.append(el('li', { class: 'r4-option' + (sel ? ' r4-selected' : ''), role: 'option', id: this._optId(i), 'data-i': i,
          'aria-selected': sel ? 'true' : 'false', 'aria-disabled': o.disabled ? 'true' : null },
        [this.multiple ? el('span', { class: 'r4-option-check', 'aria-hidden': 'true' }) : null, el('span', { text: o.text })]));
      });
      this.list.replaceChildren(frag);
      const note = this._loading ? T('r4.loading', 0, 'Carregando...') : this._loadFailed ? T('r4.form.optsFail', 0, 'Falha ao carregar as opções.')
        : !all.length ? (this.emptyText || T('r4.form.noOptions', 0, 'Nenhuma opção encontrada.'))
        : all.length > this._view.length ? T('r4.form.showing', { shown: this._view.length, total: all.length }, 'Mostrando ' + this._view.length + ' de ' + all.length + ' — refine a busca.') : '';
      this.note.textContent = note; this.note.hidden = !note;
      this._active = -1;
      if (this._view.length) this._setActive(active == null ? 0 : active);
      else (this.search || this.trigger).removeAttribute('aria-activedescendant');
    },
    _setActive(i, noScroll) {
      const n = this._view.length; if (!n) return;
      i = Math.max(0, Math.min(n - 1, i));
      const prev = this.list.querySelector('.r4-active'); prev && prev.classList.remove('r4-active');
      const li = this.list.children[i]; if (!li) return;
      li.classList.add('r4-active');
      this._active = i;
      (this.search || this.trigger).setAttribute('aria-activedescendant', li.id);
      if (!noScroll && li.scrollIntoView) li.scrollIntoView({ block: 'nearest' });
    },
    _move(d) {
      const n = this._view.length;
      for (let i = this._active + d; i >= 0 && i < n; i += d) if (!this._view[i].disabled) return this._setActive(i);
    },
    open() {
      if (this._open || this.disabled || this.readOnly || !this.el) return this;
      this._open = true;
      this._q = ''; if (this.search) this.search.value = '';
      this.pop.hidden = false;
      this.trigger.setAttribute('aria-expanded', 'true');
      this.el.classList.add('r4-open');
      const first = this.opts.findIndex(o => this._isSel(o.value));
      this._renderList(first < 0 ? 0 : Math.min(first, this.maxVisible - 1));
      this._position();
      document.addEventListener('mousedown', this._outside, true);
      document.addEventListener('touchstart', this._outside, true);
      window.addEventListener('resize', this._repos);
      window.addEventListener('scroll', this._repos, true);
      if (this.search) this.search.focus();
      this.fire('expand', this);
      return this;
    },
    close(focus) {
      if (!this._open) return this;
      this._open = false;
      this.pop.hidden = true;
      this.trigger.setAttribute('aria-expanded', 'false');
      this.trigger.removeAttribute('aria-activedescendant');
      this.el && this.el.classList.remove('r4-open');
      this._unlisten();
      if (focus) this.trigger.focus();
      this.fire('collapse', this);
      return this;
    },
    _unlisten() {
      document.removeEventListener('mousedown', this._outside, true);
      document.removeEventListener('touchstart', this._outside, true);
      window.removeEventListener('resize', this._repos);
      window.removeEventListener('scroll', this._repos, true);
    },
    _position() {
      const r = this.trigger.getBoundingClientRect(), vh = window.innerHeight || document.documentElement.clientHeight || 0;
      const h = Math.min(this.pop.scrollHeight || 300, 300), below = vh - r.bottom;
      const up = below < h + 8 && r.top > below;
      Object.assign(this.pop.style, { left: Math.max(4, r.left) + 'px', width: r.width + 'px',
        top: up ? '' : (r.bottom + 4) + 'px', bottom: up ? (vh - r.top + 4) + 'px' : '' });
    },
    _pick(o) {
      if (!o || o.disabled) return;
      if (this.multiple) { this._toggle(o.value, true); return; }
      const changed = this._val !== o.value;
      this._val = o.value;
      this._renderDisplay();
      this.close(true);
      if (changed) this._changed();
    },
    _toggle(v, keepOpen) {
      const i = this._val.indexOf(v);
      if (i >= 0) this._val.splice(i, 1);
      else {
        if (this.maxItems > 0 && this._val.length >= this.maxItems) { this.setError(fmt(this._msg('maxItems'), { n: this.maxItems })); return; }
        this._val.push(v);
      }
      this._renderDisplay();
      if (this._open && keepOpen) {
        const li = this.list.querySelector('[data-i="' + this._view.findIndex(o => o.value === v) + '"]');
        if (li) { const s = this._isSel(v); li.classList.toggle('r4-selected', s); li.setAttribute('aria-selected', s ? 'true' : 'false'); }
        this._position();
      }
      this._changed();
    },
    _typeahead(ch) {
      clearTimeout(this._taTimer);
      this._ta = (this._ta || '') + fold(ch);
      this._taTimer = setTimeout(() => { this._ta = ''; }, 700);
      const start = this._open ? this._active + (this._ta.length === 1 ? 1 : 0) : (this.opts.findIndex(o => o.value === this._val) + 1);
      const list = this._open ? this._view : this.opts;
      for (let k = 0; k < list.length; k++) {
        const idx = (Math.max(0, start) + k) % list.length, o = list[idx];
        if (!o.disabled && fold(o.text).startsWith(this._ta)) {
          if (this._open) this._setActive(idx);
          else if (!this.multiple && o.value !== this._val) { this._val = o.value; this._renderDisplay(); this._changed(); }
          return;
        }
      }
    },
    _key(ev) {
      if (this.disabled) return;
      const k = ev.key, open = this._open, inSearch = ev.target === this.search;
      if (this.readOnly && k !== 'Tab') return;
      switch (k) {
        case 'ArrowDown': ev.preventDefault(); open ? this._move(1) : this.open(); break;
        case 'ArrowUp': ev.preventDefault(); open ? this._move(-1) : this.open(); break;
        case 'PageDown': if (open) { ev.preventDefault(); this._setActive(this._active + 10); } break;
        case 'PageUp': if (open) { ev.preventDefault(); this._setActive(this._active - 10); } break;
        case 'Home': case 'End':
          if (open && !inSearch) { ev.preventDefault(); this._setActive(k === 'Home' ? 0 : this._view.length - 1); } break;
        case 'Enter':
          ev.preventDefault();
          open ? this._pick(this._view[this._active]) : this.open(); break;
        case ' ':
          if (inSearch) break;
          ev.preventDefault();
          open ? this._pick(this._view[this._active]) : this.open(); break;
        case 'Escape':
          if (open) { ev.preventDefault(); ev.stopPropagation(); this.close(true); } break;
        case 'Tab':
          if (open) this.close(false); break;
        case 'Backspace': case 'Delete':
          if (inSearch && this.search.value) break;
          if (this.multiple && this._val.length) { ev.preventDefault(); this._toggle(this._val[this._val.length - 1], true); }
          else if (!this.multiple && this.clearable && this._val) { ev.preventDefault(); this.clear(); }
          break;
        default:
          if (k.length === 1 && !inSearch && !ev.ctrlKey && !ev.metaKey && !ev.altKey) {
            if (this.search) { ev.preventDefault(); this.open(); this.search.value = k; this._q = k; this._renderList(0); }
            else this._typeahead(k);
          }
      }
    },
    _focusEl() { return this.trigger; },
    _cleanup() { this._open && this.close(); this._unlisten(); clearTimeout(this._taTimer); this._loadSeq = (this._loadSeq || 0) + 1; }
  }), {
    title: 'select', group: G,
    description: 'Lista de escolha com popup próprio e acessível (combobox + listbox): busca interna, múltipla escolha com chips, opções estáticas, de <r4-option> ou carregadas de uma URL. Teclado: setas, Home/End, PageUp/Down, Enter/Espaço, Esc, digitação para pular; fecha com Esc e clique fora.',
    props: [
      ...optionDocs,
      { name: 'placeholder', type: 'string', default: "''", desc: 'Texto quando nada está selecionado (vazio = "Selecione..." no idioma atual).' },
      { name: 'searchable', type: 'boolean', default: 'false', desc: 'Campo de busca dentro do popup (ignora acentos e maiúsculas).' },
      { name: 'multiple', type: 'boolean', default: 'false', desc: 'Várias escolhas: o valor vira array e aparece como chips. No HTML: value="a,b" ou JSON.' },
      { name: 'maxItems', type: 'number', default: '0', desc: 'Limite de escolhas no modo multiple (0 = sem limite).' },
      { name: 'clearable', type: 'boolean', default: 'false', desc: 'Botão × para limpar a seleção.' },
      { name: 'emptyText / searchPlaceholder', type: 'string', default: "'' / ''", desc: 'Textos do popup (vazio = "Nenhuma opção encontrada." / "Buscar..." no idioma atual).' },
      { name: 'maxVisible', type: 'number', default: '300', desc: 'Máximo de opções desenhadas por vez (listas grandes pedem busca).' },
      ...fieldDocs,
      { name: 'open() / close() / clear() / getSelected() / getText()', type: 'método', desc: 'Controle do popup e leitura da opção escolhida ({value, text}).' }
    ],
    events: ['change', 'blur', 'invalid', 'reset', 'load', 'loaderror', 'expand', 'collapse']
  });

  /* =====================================================================
   * checkbox / switch
   * ===================================================================== */
  R4.define('checkbox', {
    extend: 'field',
    config: { value: false, checked: false, inputValue: '' },
    _reqKey: 'requiredCheck',
    build() {
      const ids = this._ids();
      this.input = el('input', { type: 'checkbox', class: 'r4-check-input', id: ids.input, name: this.name || null,
        value: this.inputValue || null, onchange: () => this._changed(),
        onclick: ev => { if (this.readOnly) ev.preventDefault(); } });
      this.input.checked = this._truthy(this.value) || bool(this.checked);
      this.labelEl = el('span', { class: 'r4-check-text' }, [String(this.label || '')]);
      const box = el('label', { class: 'r4-check', for: ids.input }, [this.input, el('span', { class: 'r4-check-box', 'aria-hidden': 'true' }), this.labelEl]);
      return this._wrap(box, 'r4-checkfield', { noLabel: true });
    },
    afterRender() { this._initField(); },
    _truthy(v) { return this.inputValue !== '' && v === this.inputValue ? true : (v === true || v === 'true' || v === 1 || v === '1' || v === 'on'); },
    getValue() { const c = !!(this.input && this.input.checked); return this.inputValue !== '' ? (c ? this.inputValue : '') : c; },
    setValue(v) { if (this.input) this.input.checked = this._truthy(v); return this; },
    isChecked() { return !!this.input.checked; },
    toggle() { if (!this.disabled && !this.readOnly) { this.input.checked = !this.input.checked; this._changed(); } return this; },
    setLabel(t) { this.label = t; this.labelEl.firstChild.textContent = t; return this; }
  }, {
    title: 'checkbox', group: G,
    description: 'Caixa de seleção estilizada (input nativo por baixo: teclado e leitores de tela funcionam). O label fica ao lado da caixa; o conteúdo da tag vira o label.',
    props: [
      { name: 'value / checked', type: 'boolean', default: 'false', desc: 'Marcado ao iniciar.' },
      { name: 'inputValue', type: 'string', default: "''", desc: 'Se informado, getValue devolve esse texto quando marcado e "" quando não. Vários checkboxes com o mesmo name viram um array no form.' },
      ...fieldDocs.filter(p => !/^value$/.test(p.name)),
      { name: 'toggle() / isChecked()', type: 'método', desc: 'Inverte / consulta.' }
    ],
    events: fieldEvents
  });

  R4.define('switch', {
    extend: 'checkbox',
    build() {
      const root = proto('checkbox').build.call(this);
      root.classList.add('r4-switchfield');
      this.input.setAttribute('role', 'switch');
      return root;
    }
  }, {
    title: 'switch', group: G,
    description: 'Interruptor liga/desliga (role="switch"). Mesma API do checkbox.',
    props: [{ name: 'value', type: 'boolean', default: 'false', desc: 'Ligado ao iniciar.' }, ...fieldDocs.filter(p => p.name !== 'value')],
    events: fieldEvents
  });

  /* =====================================================================
   * radiogroup
   * ===================================================================== */
  R4.define('radiogroup', Object.assign({}, Options, {
    extend: 'field',
    config: Object.assign({}, OPT_CFG, { inline: false }),
    _reqKey: 'requiredChoice',
    build() {
      const ids = this._ids();
      this._val = this.value == null ? '' : String(this.value);
      this.opts = normOptions(this.options, this.valueField, this.textField);
      this.group = el('div', { class: 'r4-radio-group' + (this.inline ? ' r4-inline' : ''), role: 'radiogroup', id: ids.input,
        'aria-labelledby': this.label ? ids.label : null });
      this._renderRadios();
      return this._wrap(this.group, 'r4-radiofield', { labelTag: 'span' });
    },
    afterRender() { this._initField(); if (this.src) this.load(); },
    _ctl() { return this.group; },
    _natives() { return this.group ? [...this.group.querySelectorAll('input')] : []; },
    _renderRadios() {
      const frag = document.createDocumentFragment(), nm = this.id + '-r';
      this.opts.forEach((o, i) => {
        const id = this.id + '-r' + i;
        const inp = el('input', { type: 'radio', class: 'r4-check-input', name: nm, id, value: o.value, disabled: o.disabled || this.disabled,
          onchange: () => { if (inp.checked) { this._val = o.value; this._changed(); } },
          onclick: ev => { if (this.readOnly) ev.preventDefault(); } });
        inp.checked = o.value === this._val;
        frag.append(el('label', { class: 'r4-check r4-radio', for: id }, [inp, el('span', { class: 'r4-check-box', 'aria-hidden': 'true' }), el('span', { class: 'r4-check-text', text: o.text })]));
      });
      if (this._loading) frag.append(el('span', { class: 'r4-help', text: T('r4.loading', 0, 'Carregando...') }));
      else if (this._loadFailed) frag.append(el('span', { class: 'r4-help', text: T('r4.form.optsFail', 0, 'Falha ao carregar as opções.') }));
      this.group.replaceChildren(frag);
    },
    _optionsChanged() { if (this.group) { this._renderRadios(); this._applyState(); } },
    _applyState() {
      Field._applyState.call(this);
      this._natives().forEach((n, i) => { if (this.opts[i] && this.opts[i].disabled) n.disabled = true; });
    },
    getValue() { return this._val; },
    setValue(v) {
      this._val = v == null ? '' : String(v);
      this.group && this.group.querySelectorAll('input').forEach(i => { i.checked = i.value === this._val; });
      return this;
    },
    _focusEl() { const ins = this._natives().filter(i => !i.disabled); return ins.find(i => i.checked) || ins[0] || this.group; }
  }), {
    title: 'radiogroup', group: G,
    description: 'Grupo de opções exclusivas (radios nativos estilizados; setas trocam a opção). Opções estáticas, <r4-option> ou src.',
    props: [...optionDocs, { name: 'inline', type: 'boolean', default: 'false', desc: 'Opções lado a lado.' }, ...fieldDocs],
    events: ['change', 'blur', 'invalid', 'reset', 'load', 'loaderror']
  });

  /* =====================================================================
   * textarea
   * ===================================================================== */
  R4.define('textarea', {
    extend: 'field',
    config: Object.assign({}, TEXT_CFG, { rows: 3, autoGrow: false, maxRows: 12, counter: false }),
    _textual: true, _multiline: true,
    build() {
      const ids = this._ids();
      this.input = el('textarea', { class: 'r4-input r4-textarea', id: ids.input, name: this.name || null, rows: this.rows,
        placeholder: this.placeholder || null, maxlength: this.maxLength > 0 ? this.maxLength : (this._san() ? this._limit() : null),
        oninput: () => { this._count(); this._grow(); this._changed(); } });
      this.input.value = this.value ?? '';
      if (this.autoGrow) { this.input.style.maxHeight = (this.maxRows * 1.5 + 1) + 'em'; this.input.style.resize = 'none'; }
      const after = [];
      if (this.counter || this.maxLength > 0) after.push(this.countEl = el('div', { class: 'r4-counter', id: ids.input + '-count', 'aria-live': 'off' }));
      const root = this._wrap(this.input, 'r4-textareafield', { after });
      this._count();
      return root;
    },
    afterRender() { this._initField(); this._grow(); },
    _extraDesc() { return this.countEl ? [this.countEl.id] : []; },
    _count() {
      if (!this.countEl) return;
      const n = [...this.input.value].length;
      this.countEl.textContent = this.maxLength > 0 ? n + ' / ' + this.maxLength : n + (n === 1 ? ' caractere' : ' caracteres');
      this.countEl.classList.toggle('r4-near', this.maxLength > 0 && n >= this.maxLength * 0.9);
    },
    _grow() {
      if (!this.autoGrow || !this.input) return;
      this.input.style.height = 'auto';
      const h = this.input.scrollHeight;
      if (h) this.input.style.height = (h + 2) + 'px';
    },
    getValue() { return this._clean(this.input ? this.input.value : (this.value ?? '')); },
    setValue(v) { if (this.input) { this.input.value = v ?? ''; this._count(); this._grow(); } return this; }
  }, {
    title: 'textarea', group: G,
    description: 'Texto em várias linhas com contador de caracteres e crescimento automático opcional. Enter não envia o form. getValue() mantém as quebras de linha e tira controles/bidi/invisíveis (limite padrão 10.000 caracteres).',
    props: [
      { name: 'rows', type: 'number', default: '3', desc: 'Linhas visíveis.' },
      { name: 'autoGrow / maxRows', type: 'boolean / number', default: 'false / 12', desc: 'Cresce com o texto até maxRows linhas.' },
      { name: 'counter', type: 'boolean', default: 'false', desc: 'Mostra o contador (automático quando há maxLength).' },
      ...textDocs.filter(p => p.name !== 'email' && p.name !== 'autocomplete'), ...fieldDocs
    ],
    events: textEvents
  });

  /* =====================================================================
   * numberfield — pt-BR (vírgula decimal), min/max/step, setas
   * ===================================================================== */
  R4.define('numberfield', {
    extend: 'field',
    config: { placeholder: '', min: null, max: null, step: 1, decimals: -1, prefix: '', suffix: '', spinner: true },
    build() {
      const ids = this._ids();
      this.input = el('input', { class: 'r4-input r4-number', id: ids.input, type: 'text', name: this.name || null, role: 'spinbutton',
        inputmode: this.decimals === 0 ? 'numeric' : 'decimal', autocomplete: 'off', placeholder: this.placeholder || null,
        oninput: () => { this._aria(); this._changed(); },
        onkeydown: ev => {
          if (ev.key === 'ArrowUp' || ev.key === 'ArrowDown') { ev.preventDefault(); this.stepBy(ev.key === 'ArrowUp' ? 1 : -1); }
          else if (ev.key === 'Enter') this.fire('enter', this, this.getValue());
        },
        onblur: () => this._normalize() });
      this.input.value = this._text(parseNumber(this.value));
      const parts = [];
      if (this.prefix) parts.push(el('span', { class: 'r4-addon', 'aria-hidden': 'true', text: this.prefix }));
      parts.push(this.input);
      if (this.suffix) parts.push(el('span', { class: 'r4-addon', 'aria-hidden': 'true', text: this.suffix }));
      if (this.spinner) {
        const b = (t, d, lbl) => el('button', { type: 'button', tabindex: '-1', 'aria-label': lbl,
          onmousedown: ev => ev.preventDefault(), onclick: () => { if (!this.disabled && !this.readOnly) { this.stepBy(d); } } }, [R4.icon(t)]);
        parts.push(el('span', { class: 'r4-spin' }, [b('caret-up', 1, T('r4.form.increase', 0, 'Aumentar')), b('caret-down', -1, T('r4.form.decrease', 0, 'Diminuir'))]));
      }
      return this._wrap(el('div', { class: 'r4-input-group' }, parts), 'r4-numberfield');
    },
    afterRender() { this._initField(); this._aria(); },
    _num(v) { const n = parseNumber(v); return n == null || isNaN(n) ? null : n; },
    _text(n) { return n == null || isNaN(n) ? '' : numText(n, this.decimals); },
    _round(n) { return this.decimals >= 0 ? Number(n.toFixed(this.decimals)) : n; },
    _aria() {
      const n = this.getValue(), i = this.input, mn = this._num(this.min), mx = this._num(this.max);
      mn != null ? i.setAttribute('aria-valuemin', mn) : i.removeAttribute('aria-valuemin');
      mx != null ? i.setAttribute('aria-valuemax', mx) : i.removeAttribute('aria-valuemax');
      n != null ? i.setAttribute('aria-valuenow', n) : i.removeAttribute('aria-valuenow');
    },
    _normalize() {
      const n = parseNumber(this.input.value);
      if (n == null || isNaN(n)) return;
      const t = this._text(this._round(n));
      if (t !== this.input.value) this.input.value = t;
    },
    getValue() { const n = parseNumber(this.input ? this.input.value : this.value); return n == null || isNaN(n) ? null : this._round(n); },
    setValue(v) { if (this.input) { this.input.value = this._text(parseNumber(v)); this._aria(); } return this; },
    /** Soma `d` passos (respeita min/max) e dispara change */
    stepBy(d) {
      if (this.disabled || this.readOnly) return this;
      const st = Math.abs(Number(this.step)) || 1, mn = this._num(this.min), mx = this._num(this.max);
      const prec = Math.max((String(st).split('.')[1] || '').length, this.decimals > 0 ? this.decimals : 0);
      let n = this.getValue();
      n = n == null ? (mn != null ? mn : 0) : Number((n + d * st).toFixed(prec));
      if (mn != null && n < mn) n = mn;
      if (mx != null && n > mx) n = mx;
      this.input.value = this._text(n); this._aria(); this._changed();
      return this;
    },
    _preCheck() { const t = this.input ? this.input.value.trim() : ''; return t && isNaN(parseNumber(t)) ? this._msg('number') : true; },
    _typeCheck(n) {
      const mn = this._num(this.min), mx = this._num(this.max);
      if (mn != null && n < mn) return fmt(this._msg('min'), { n: numText(mn) });
      if (mx != null && n > mx) return fmt(this._msg('max'), { n: numText(mx) });
      return true;
    }
  }, {
    title: 'numberfield', group: G,
    description: 'Número no formato brasileiro (1.234,56): aceita vírgula ou ponto, setas ↑/↓ e botões somam step, limites min/max e casas decimais fixas. getValue() devolve Number (ou null se vazio).',
    props: [
      { name: 'min / max', type: 'number', default: 'null', desc: 'Limites (validados e respeitados pelas setas).' },
      { name: 'step', type: 'number', default: '1', desc: 'Incremento das setas e botões.' },
      { name: 'decimals', type: 'number', default: '-1', desc: 'Casas decimais fixas ao sair do campo (-1 = livre; 0 = inteiro).' },
      { name: 'prefix / suffix', type: 'string', default: "''", desc: 'Texto antes/depois (ex.: "R$", "%", "kg").' },
      { name: 'spinner', type: 'boolean', default: 'true', desc: 'Botões ▲▼.' },
      { name: 'placeholder', type: 'string', default: "''", desc: 'Dica.' },
      ...fieldDocs,
      { name: 'stepBy(n)', type: 'método', desc: 'Soma n passos.' }
    ],
    events: ['change', 'blur', 'enter', 'invalid', 'reset']
  });

  /* =====================================================================
   * datefield — input nativo type=date, valor 'AAAA-MM-DD'
   * ===================================================================== */
  const ISO = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/;
  const realDate = s => { const m = ISO.exec(s); if (!m) return false; const d = new Date(+m[1], m[2] - 1, +m[3]); return d.getFullYear() === +m[1] && d.getMonth() === m[2] - 1 && d.getDate() === +m[3]; };
  const toIso = v => {
    if (v instanceof Date) return isNaN(v) ? '' : v.getFullYear() + '-' + String(v.getMonth() + 1).padStart(2, '0') + '-' + String(v.getDate()).padStart(2, '0');
    const s = String(v ?? '').trim(), br = /^([0-9]{2})\/([0-9]{2})\/([0-9]{4})$/.exec(s);
    return br ? br[3] + '-' + br[2] + '-' + br[1] : s.slice(0, 10);
  };
  R4.define('datefield', {
    extend: 'field',
    config: { min: '', max: '' },
    build() {
      const ids = this._ids();
      this.input = el('input', { class: 'r4-input r4-date', id: ids.input, type: 'date', name: this.name || null,
        min: this.min ? toIso(this.min) : null, max: this.max ? toIso(this.max) : null,
        oninput: () => this._changed(), onchange: () => { if (this.getValue() !== this._last) this._changed(); } });
      this.input.value = toIso(this.value);
      this.input.addEventListener('input', () => { this._last = this.getValue(); });
      return this._wrap(this.input, 'r4-datefield');
    },
    afterRender() { this._initField(); this._last = this.getValue(); },
    getValue() { return this.input ? this.input.value : toIso(this.value); },
    setValue(v) { if (this.input) { this.input.value = toIso(v); this._last = this.input.value; } return this; },
    /** Valor como Date (meia-noite local) ou null */
    getDate() { const m = ISO.exec(this.getValue()); return m ? new Date(+m[1], m[2] - 1, +m[3]) : null; },
    _typeCheck(v) {
      if (!realDate(v)) return this._msg('date');
      const mn = this.min && toIso(this.min), mx = this.max && toIso(this.max);
      if (mn && v < mn) return fmt(this._msg('minDate'), { n: R4.util.date(mn) });
      if (mx && v > mx) return fmt(this._msg('maxDate'), { n: R4.util.date(mx) });
      return true;
    }
  }, {
    title: 'datefield', group: G,
    description: "Data com o seletor nativo do navegador. O valor é sempre 'AAAA-MM-DD' (setValue também aceita Date e 'dd/mm/aaaa').",
    props: [
      { name: 'value', type: "'AAAA-MM-DD'", default: "''", desc: 'Data inicial.' },
      { name: 'min / max', type: "'AAAA-MM-DD'", default: "''", desc: 'Limites (o seletor respeita e a validação confere).' },
      ...fieldDocs.filter(p => p.name !== 'value'),
      { name: 'getDate()', type: 'Date|null', desc: 'Valor como objeto Date local.' }
    ],
    events: fieldEvents
  });

  /* =====================================================================
   * passwordfield — mostrar/ocultar + medidor de força
   * ===================================================================== */
  R4.define('passwordfield', {
    extend: 'field',
    // senha: nada de normalizar/colapsar (mudaria a senha); sanitize só tira NUL e guard fica desligado
    // (nunca inspecionar/registrar senha)
    config: Object.assign({}, TEXT_CFG, { showToggle: true, showStrength: false, minStrength: 0, guard: 'off' }),
    _textual: true,
    _clean(v) { return this._san() && typeof v === 'string' ? v.replace(/\u0000/g, '') : v; },
    _over() { return !!this._san() && [...this._rawText()].length > this._limit(); },
    _guardMode() { return 'off'; },
    build() {
      const ids = this._ids();
      this.input = textInput(this, { type: 'password', spellcheck: 'false', autocapitalize: 'off',
        autocomplete: this.autocomplete || (this.showStrength || this.minStrength ? 'new-password' : 'current-password'),
        oninput: () => { this._meter(); this._changed(); } });
      this.input.value = this.value ?? '';
      const parts = [this.input];
      if (this.showToggle) {
        this.toggleBtn = el('button', { type: 'button', class: 'r4-addon r4-addon-btn', 'aria-pressed': 'false', 'aria-controls': ids.input,
          'aria-label': T('r4.form.showPwd', 0, 'Mostrar senha'), text: T('r4.form.show', 0, 'Mostrar'), onclick: () => this.toggleVisible() });
        parts.push(this.toggleBtn);
      }
      const after = [];
      if (this.showStrength || this.minStrength > 0) {
        this.meterText = el('span', { class: 'r4-strength-text', id: ids.input + '-str', 'aria-live': 'polite' });
        this.meter = el('div', { class: 'r4-strength', 'data-level': '' }, [el('div', { class: 'r4-strength-bar', 'aria-hidden': 'true' }, [el('span')]), this.meterText]);
        after.push(this.meter);
      }
      const root = this._wrap(el('div', { class: 'r4-input-group' }, parts), 'r4-passwordfield', { after });
      this._meter();
      return root;
    },
    afterRender() { this._initField(); },
    _natives() { return this.input ? [this.input] : []; },
    _applyState() { Field._applyState.call(this); if (this.toggleBtn) this.toggleBtn.disabled = !!this.disabled; },
    _extraDesc() { return this.meterText ? [this.meterText.id] : []; },
    _meter() {
      if (!this.meter) return;
      const v = this.input.value, s = strength(v);
      this.meter.setAttribute('data-level', v ? String(s) : '');
      this.meterText.textContent = v ? T('r4.form.strength', { level: T('r4.form.strength' + s, 0, STRENGTH_TXT[s]) }, 'Força: ' + STRENGTH_TXT[s]) : '';
    },
    getStrength() { return strength(this.getValue()); },
    relocalize() { if (this.toggleBtn) this.toggleVisible(this.input.type === 'text'); this._meter(); },
    toggleVisible(show) {
      show = show == null ? this.input.type === 'password' : !!show;
      this.input.type = show ? 'text' : 'password';
      if (this.toggleBtn) {
        this.toggleBtn.setAttribute('aria-pressed', show ? 'true' : 'false');
        this.toggleBtn.setAttribute('aria-label', show ? T('r4.form.hidePwd', 0, 'Ocultar senha') : T('r4.form.showPwd', 0, 'Mostrar senha'));
        this.toggleBtn.textContent = show ? T('r4.form.hide', 0, 'Ocultar') : T('r4.form.show', 0, 'Mostrar');
      }
      return this;
    },
    getValue() { return this._clean(this.input ? this.input.value : (this.value ?? '')); },
    setValue(v) { if (this.input) { this.input.value = v ?? ''; this._meter(); } return this; },
    _typeCheck(v) { return this.minStrength > 0 && strength(v) < this.minStrength ? this._msg('weak') : true; }
  }, {
    title: 'passwordfield', group: G,
    description: 'Senha com botão mostrar/ocultar (aria-pressed) e medidor de força opcional. Use match no campo de confirmação.',
    props: [
      { name: 'showToggle', type: 'boolean', default: 'true', desc: 'Botão Mostrar/Ocultar.' },
      { name: 'showStrength', type: 'boolean', default: 'false', desc: 'Barra de força (Muito fraca → Muito forte).' },
      { name: 'minStrength', type: 'number', default: '0', desc: 'Força mínima exigida (0 a 4); também liga o medidor.' },
      ...textDocs.filter(p => p.name !== 'email' && p.name !== 'sanitize' && p.name !== 'guard' && p.name !== 'getSuspicion()'),
      { name: 'sanitize', type: 'boolean', default: 'true', desc: 'Na senha só tira NUL e limita ao tamanho (1000 por padrão): normalizar mudaria a senha.' },
      { name: 'guard', type: "'off'", default: "'off'", desc: 'Sempre desligado na senha: a lib nunca inspeciona nem registra senhas.' },
      ...fieldDocs,
      { name: 'toggleVisible(bool) / getStrength()', type: 'método', desc: 'Mostra/oculta / força atual (0-4).' }
    ],
    events: ['change', 'blur', 'enter', 'invalid', 'reset']
  });

  /* =====================================================================
   * maskfield — cpf, cnpj, telefone, cep, moeda ou padrão livre
   * ===================================================================== */
  R4.define('maskfield', {
    extend: 'field',
    config: Object.assign({}, TEXT_CFG, { mask: '', raw: true, validateMask: true }),
    _textual: true,
    build() {
      const m = String(this.mask || '').toLowerCase(), digits = ['cpf', 'telefone', 'celular', 'fone', 'cep', 'moeda', 'data', 'hora', 'cartao'].includes(m) || (!NAMED[m] && /^[^AS]*$/.test(String(this.mask)));
      this.input = textInput(this, { inputmode: digits ? 'numeric' : null, autocomplete: this.autocomplete || 'off', maxlength: null,
        oninput: () => this._onInput() });
      if (m === 'moeda') this.input.classList.add('r4-money');
      this.input.value = maskValue(this.value ?? '', this.mask);
      return this._wrap(this.input, 'r4-maskfield');
    },
    afterRender() { this._initField(); },
    _isMoney() { return String(this.mask).toLowerCase() === 'moeda'; },
    _onInput() {
      const inp = this.input, old = inp.value, pos = inp.selectionStart == null ? old.length : inp.selectionStart;
      const sig = (old.slice(0, pos).match(/[0-9A-Za-z]/g) || []).length;
      const nv = maskValue(old, this.mask);
      if (nv !== old) {
        inp.value = nv;
        if (document.activeElement === inp) {
          let p = nv.length;
          if (!this._isMoney()) { let c = 0; p = 0; for (let i = 0; i < nv.length && c < sig; i++) { if (SIG.test(nv[i])) { c++; p = i + 1; } } }
          try { inp.setSelectionRange(p, p); } catch (e) { /* tipo sem seleção */ }
        }
      }
      this._changed();
    },
    _raw() { return unmaskValue(this.input ? this.input.value : this.value, this.mask); },
    getValue() {
      if (!this.input) return this.value;
      if (this.raw === false || this.raw === 'false') return this._clean(this.input.value);
      return this._raw();   // só os caracteres significativos da máscara ([0-9A-Za-z]) ou Number (moeda)
    },
    setValue(v) { if (this.input) this.input.value = maskValue(v ?? '', this.mask); return this; },
    /** Valor formatado (com máscara), independente de raw */
    getMasked() { return this.input ? this.input.value : ''; },
    _typeCheck() {
      if (!this.validateMask) return true;
      const m = String(this.mask).toLowerCase(), r = String(this._raw() ?? '');
      if (m === 'moeda') return true;
      if (m === 'cpf') return cpfValid(r) || this._msg('cpf');
      if (m === 'cnpj') return cnpjValid(r) || this._msg('cnpj');
      if (m === 'cpfcnpj') return (r.length <= 11 ? cpfValid(r) : cnpjValid(r)) || this._msg('cpfCnpj');
      if (m === 'telefone' || m === 'celular' || m === 'fone') return r.length >= 10 || this._msg('telefone');
      if (m === 'cep') return r.length === 8 || this._msg('cep');
      if (m === 'data') return realDate(r.slice(4, 8) + '-' + r.slice(2, 4) + '-' + r.slice(0, 2)) || this._msg('date');
      const pat = patternOf(this.mask, r);
      return r.length >= tokenCount(pat) || fmt(this._msg('mask'), { n: pat });
    }
  }, {
    title: 'maskfield', group: G,
    description: "Campo com máscara enquanto digita. Máscaras prontas: cpf, cnpj (inclusive alfanumérico), cpfcnpj, telefone (8 ou 9 dígitos), cep, moeda, data, hora, cartao — ou um padrão livre ('99/99/9999'; 9 = dígito, A = letra, S = letra ou dígito). CPF/CNPJ são validados pelos dígitos verificadores.",
    props: [
      { name: 'mask', type: "'cpf'|'cnpj'|'cpfcnpj'|'telefone'|'cep'|'moeda'|'data'|'hora'|'cartao'|padrão", default: "''", desc: 'Máscara aplicada.' },
      { name: 'raw', type: 'boolean', default: 'true', desc: 'getValue() sem máscara ("52998224725"; moeda → Number). raw:false devolve o texto formatado.' },
      { name: 'validateMask', type: 'boolean', default: 'true', desc: 'Valida o conteúdo (CPF/CNPJ reais, telefone/CEP completos, padrão preenchido).' },
      ...textDocs.filter(p => p.name !== 'email'), ...fieldDocs,
      { name: 'getMasked()', type: 'string', desc: 'Texto formatado, sempre.' }
    ],
    events: ['change', 'blur', 'enter', 'invalid', 'reset', 'suspicious']
  });

  /* =====================================================================
   * Tipos curtos para fields:[{type:'...'}]
   * ===================================================================== */
  const TYPES = {
    text: 'textfield', textfield: 'textfield', email: { xtype: 'textfield', inputType: 'email', email: true },
    url: { xtype: 'textfield', inputType: 'url' }, tel: { xtype: 'maskfield', mask: 'telefone' }, search: { xtype: 'textfield', inputType: 'search' },
    password: 'passwordfield', passwordfield: 'passwordfield', number: 'numberfield', numberfield: 'numberfield',
    date: 'datefield', datefield: 'datefield', select: 'select', multiselect: { xtype: 'select', multiple: true },
    checkbox: 'checkbox', switch: 'switch', radio: 'radiogroup', radiogroup: 'radiogroup', textarea: 'textarea',
    mask: 'maskfield', maskfield: 'maskfield', cpf: { xtype: 'maskfield', mask: 'cpf' }, cnpj: { xtype: 'maskfield', mask: 'cnpj' },
    cpfcnpj: { xtype: 'maskfield', mask: 'cpfcnpj' }, telefone: { xtype: 'maskfield', mask: 'telefone' }, cep: { xtype: 'maskfield', mask: 'cep' },
    moeda: { xtype: 'maskfield', mask: 'moeda' }, fieldset: 'fieldset', row: 'formrow', formrow: 'formrow'
  };
  /** {type:'cpf', name, ...} → {xtype:'maskfield', mask:'cpf', ...} (recursivo para fieldset/formrow) */
  function fieldCfg(f) {
    if (!f || typeof f !== 'object' || f instanceof R4.Component) return f;
    let c = Object.assign({}, f);
    if (!c.xtype && c.type) {
      const t = TYPES[String(c.type).toLowerCase()];
      if (!t) R4.warn('tipo de campo desconhecido "' + c.type + '" — usando textfield');
      c = Object.assign({}, typeof t === 'object' ? t : { xtype: t || 'textfield' }, c);
      delete c.type;
    }
    if (Array.isArray(c.fields)) { c.items = (c.items || []).concat(c.fields); delete c.fields; }
    if (Array.isArray(c.items) && (c.xtype === 'fieldset' || c.xtype === 'formrow')) c.items = c.items.map(fieldCfg);
    return c;
  }

  /* =====================================================================
   * fieldset / formrow
   * ===================================================================== */
  R4.define('fieldset', {
    config: { title: '', html: '', items: [], collapsible: false, collapsed: false },
    build() {
      const fs = el('fieldset', { class: 'r4-fieldset' });
      this.body = el('div', { class: 'r4-fieldset-body', id: this.id + '-body' });
      if (this.title) {
        const lg = el('legend', { class: 'r4-legend' });
        if (this.collapsible) {
          this.toggleBtn = el('button', { type: 'button', class: 'r4-legend-btn', 'aria-expanded': this.collapsed ? 'false' : 'true', 'aria-controls': this.body.id,
            onclick: () => this.toggle() }, [el('span', { class: 'r4-legend-arrow', 'aria-hidden': 'true' }, [R4.icon('chevron-down')]), String(this.title)]);
          lg.append(this.toggleBtn);
        } else lg.textContent = this.title;
        fs.append(lg);
      }
      if (this.html) this.body.innerHTML = this.html;
      this.renderItems(this.body, (this.items || []).map(fieldCfg), 'textfield');
      fs.append(this.body);
      if (this.collapsed) { fs.classList.add('r4-collapsed'); this.body.hidden = true; }
      return fs;
    },
    toggle(open) {
      open = open == null ? this.body.hidden : !!open;
      this.body.hidden = !open; this.el.classList.toggle('r4-collapsed', !open);
      this.toggleBtn && this.toggleBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
      this.fire('toggle', this, !open);
      return this;
    },
    setDisabled(b) {
      this.el.disabled = !!b;
      fieldsIn(this.el).forEach(f => f.setDisabled && f.setDisabled(b));
      return this;
    },
    destroy: destroyAll
  }, {
    title: 'fieldset', group: G,
    description: 'Agrupa campos com uma legenda (<fieldset>/<legend>, lido pelos leitores de tela). Pode recolher.',
    props: [
      { name: 'title', type: 'string', default: "''", desc: 'Legenda.' },
      { name: 'items', type: 'Array<cfg>', default: '[]', desc: "Campos (aceita {type:'text'|'cpf'|'select'...} como em form.fields). No HTML: tags filhas." },
      { name: 'collapsible / collapsed', type: 'boolean', default: 'false', desc: 'Recolher pela legenda.' },
      { name: 'toggle() / setDisabled(b)', type: 'método', desc: 'Recolhe/expande / desabilita todos os campos de dentro.' }
    ],
    events: ['toggle']
  });

  R4.define('formrow', {
    config: { html: '', items: [], cols: '', minWidth: 180 },
    build() {
      const d = el('div', { class: 'r4-formrow' });
      const c = String(this.cols || '').trim();
      if (c) d.style.gridTemplateColumns = /^[0-9]+$/.test(c) ? 'repeat(' + c + ', minmax(0, 1fr))' : c;
      else d.style.gridTemplateColumns = 'repeat(auto-fit, minmax(min(' + (Number(this.minWidth) || 180) + 'px, 100%), 1fr))';
      if (this.html) d.innerHTML = this.html;
      this.renderItems(d, (this.items || []).map(fieldCfg), 'textfield');
      return d;
    },
    destroy: destroyAll
  }, {
    title: 'formrow', group: G,
    description: 'Linha de campos lado a lado que empilha sozinha em telas estreitas (< 560px).',
    props: [
      { name: 'items', type: 'Array<cfg>', default: '[]', desc: 'Campos da linha (aceita {type:...}).' },
      { name: 'cols', type: "'' | '3' | '2fr 1fr'", default: "''", desc: 'Colunas fixas; vazio = automático pelo minWidth.' },
      { name: 'minWidth', type: 'number', default: '180', desc: 'Largura mínima de cada campo no modo automático (px).' }
    ]
  });

  /* =====================================================================
   * form
   * ===================================================================== */
  const isField = c => c && c.name && typeof c.getValue === 'function' && typeof c.setValue === 'function';
  /**
   * Componentes-campo dentro de `root` que pertencem a ele (não a um form aninhado nem a um item de repeater).
   * `form` é o componente dono (ou o controlador de um item, com .el); sem ele devolve todos.
   */
  function fieldsIn(root, form) {
    return [...root.querySelectorAll('.r4-cmp')].map(n => {
      const c = R4.instances[n.id];
      if (!c || c.el !== n || !isField(c) || c === form) return null;
      if (form && n.parentElement.closest(OWNER) !== form.el) return null;
      return c;
    }).filter(Boolean);
  }
  R4.fieldsIn = fieldsIn;
  /** Mostra o campo que estava escondido numa aba inativa ou num fieldset recolhido (antes de focar o erro). */
  function reveal(node) {
    for (let p = node; p && p !== document.body; p = p.parentElement) {
      if (!p.hidden) continue;
      const tp = p.parentElement && p.parentElement.closest('.r4-tabs'), cmp = tp && R4.instances[tp.id];
      const tab = cmp && Array.isArray(cmp.tabs) && cmp.tabs.find(x => x.cmp && x.cmp.el === p);
      if (tab && cmp.setActive) { cmp.setActive(tab); continue; }
      const fs = p.parentElement && R4.instances[p.parentElement.id];
      if (fs && fs.xtype === 'fieldset' && fs.body === p) fs.toggle(true);
    }
  }
  R4.reveal = reveal;

  /** fetch próprio: distingue 2xx de 4xx/5xx sem perder o corpo JSON */
  async function send(url, { method = 'POST', data = null, encrypt = false, headers = null } = {}) {
    method = String(method || 'POST').toUpperCase();
    url = R4.http.check(url);   // recusa javascript:/data:; outra origem → aviso (ou erro com R4.config.strictOrigins)
    let body;
    if (method === 'GET' || method === 'HEAD') {
      const q = new URLSearchParams();
      Object.entries(data || {}).forEach(([k, v]) => { if (v != null) q.append(k, Array.isArray(v) ? v.join(',') : String(v)); });
      const s = q.toString();
      if (s) url += (url.includes('?') ? '&' : '?') + s;
    } else body = JSON.stringify(encrypt ? await R4.crypto.encrypt(data, { metodo: method, caminho: url }) : data);
    const res = await fetch(url, { method, body, credentials: 'same-origin',
      headers: Object.assign({ 'Content-Type': 'application/json', Accept: 'application/json' }, headers || {}) });
    const text = await res.text();
    let json = null;
    if (text) { try { json = JSON.parse(text); } catch (e) { json = null; } }
    return { ok: res.ok, status: res.status, data: json, text };
  }
  const SUBMIT_SEL = '[data-r4-submit],button[type="submit"],input[type="submit"],[r4-click]';

  const pathGet = (o, p) => String(p).split('.').reduce((a, k) => (a == null || BAD_NAMES.has(k) || !Object.prototype.hasOwnProperty.call(Object(a), k) ? undefined : a[k]), o);
  const plainObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);

  R4.define('form', {
    config: { action: '', method: 'POST', encrypt: false, headers: null, html: '', fields: [], items: [], buttons: null,
      submitText: '', resetText: 'Limpar', successText: '', errorText: '',   // '' = texto padrão no idioma atual (resetText 'Limpar' idem; vazio esconde o botão)
      // src: carrega os valores (GET) ao montar; root: caminho até o objeto; notify: avisos com R4.notify; autosaveMs: rascunho automático
      src: '', root: '', notify: true, autosaveMs: 0, autosaveUrl: '',
      resetOnSuccess: false, submitOnEnter: true, focusInvalid: true, values: null },
    build() {
      const f = el('form', { class: 'r4-form', novalidate: true });
      f.addEventListener('submit', ev => { ev.preventDefault(); this.submit(); });
      f.addEventListener('reset', ev => { ev.preventDefault(); this.reset(); });
      f.addEventListener('keydown', ev => this._onKey(ev));
      f.addEventListener('r4-fieldchange', ev => this._onFieldChange(ev));
      f.addEventListener('r4-suspicious', ev => { const d = ev.detail || {}; if (d.field && d.field._form && d.field._form() === this) this.fire('suspicious', this, d.field, d.kinds, d.detail); });
      if (this.html) f.innerHTML = this.html;
      this.renderItems(f, [...(this.fields || []), ...(this.items || [])].map(fieldCfg), 'textfield');
      this.msgEl = el('div', { class: 'r4-form-msg r4-alert', hidden: true });
      f.append(this.msgEl);
      const btns = this._buttonCfgs();
      if (btns.length) {
        this.actionsEl = el('div', { class: 'r4-form-actions' });
        this.renderItems(this.actionsEl, btns, 'button');
        f.append(this.actionsEl);
      }
      return f;
    },
    afterRender() {
      const json = v => { if (typeof v !== 'string') return v; try { return JSON.parse(v); } catch (e) { R4.warn('<r4-form>: JSON inválido em values/headers'); return null; } };
      this.values = json(this.values); this.headers = json(this.headers);
      if (this.values) {
        this.setValues(this.values, true);
        if (this.html) Promise.resolve().then(() => !this._destroyed && this.setValues(this.values, true));   // campos do HTML montam logo depois
      }
      if (this.src) this.load();
    },
    _cleanup() { clearTimeout(this._asT); this._lseq = -1; },
    _notify(kind, text) {
      if (!text || !bool(this.notify) || !R4.notify || this._destroyed) return;
      try { R4.notify({ type: kind, text }); } catch (e) { /* notify indisponível */ }
    },
    /**
     * Busca os valores em `src` (GET, JSON) e preenche os campos (viram o "original" para reset/isDirty).
     * Aceita {retorno:{...}}, {data:{...}} ou o objeto puro; `root` escolhe outro caminho ("dados.perfil").
     * Mesmo tratamento do grid: "carregando" (aria-busy), status fora de 2xx, {status ≥ 400} ou JSON inválido
     * viram erro com "Tentar de novo" (os valores atuais ficam). Eventos load(form, valores, corpo) / loaderror(form, erro).
     */
    async load(src = this.src) {
      if (!src || !this.el || this._destroyed) return this;
      const seq = this._lseq = (this._lseq || 0) + 1;
      this.el.classList.add('r4-loading'); this.el.setAttribute('aria-busy', 'true');
      this._showMsg(T('r4.loading', 0, 'Carregando...'), 'info');
      try {
        const res = await send(src, { method: 'GET', headers: this.headers });
        if (seq !== this._lseq || this._destroyed) return this;
        const b = res.data;
        const txt = b && plainObj(b) && [b.mensagem, b.message, typeof b.retorno === 'string' ? b.retorno : '', b.erro].find(x => typeof x === 'string' && x);
        if (!res.ok || (plainObj(b) && typeof b.status === 'number' && b.status >= 400)) throw new Error('HTTP ' + res.status + (txt ? ': ' + txt : ''));
        if (b == null) throw new Error(T('r4.grid.badJson', 0, 'A resposta não é JSON válido.'));
        const obj = this.root ? pathGet(b, this.root) : plainObj(b.retorno) ? b.retorno : plainObj(b.data) ? b.data : b;
        if (!plainObj(obj)) throw new Error(T('r4.form.noObject', 0, 'A resposta não traz um objeto de valores.'));
        this.setValues(obj, true);
        this._hideMsg();
        this.fire('load', this, obj, b);
      } catch (e) {
        if (seq !== this._lseq || this._destroyed) return this;
        const m = T('r4.loadFail', 0, 'Falha ao carregar.') + (e && e.message ? ' (' + e.message + ')' : '');
        this._showMsg(m, 'err');
        this.msgEl.append(' ', el('button', { type: 'button', class: 'r4-btn r4-form-retry', text: T('r4.retry', 0, 'Tentar de novo'), onclick: () => this.load(src) }));
        this._notify('err', m);
        this.fire('loaderror', this, e);
      } finally {
        if (seq === this._lseq && !this._destroyed) { this.el.classList.remove('r4-loading'); this.el.removeAttribute('aria-busy'); }
      }
      return this;
    },
    reload() { return this.load(); },
    /** Rascunho automático: depois de `autosaveMs` sem mudanças, envia (silencioso) se mudou e é válido. */
    _autosave() {
      const ms = +this.autosaveMs, url = this.autosaveUrl || this.action;
      if (!(ms > 0) || !url || this._destroyed) return;
      clearTimeout(this._asT);
      this._asT = setTimeout(async () => {
        if (this._destroyed || this._busy || !this.isDirty() || !this.isValid()) return;
        const data = this.getValues();
        let res;
        try { res = await send(url, { method: this.method, data: R4.sanitize ? R4.sanitize.deep(data, { strip: false }) : data, encrypt: bool(this.encrypt), headers: this.headers }); }
        catch (e) { res = { ok: false, status: 0, data: null, error: e }; }
        if (this._destroyed) return;
        const ok = res.ok && !(plainObj(res.data) && typeof res.data.status === 'number' && res.data.status >= 400);
        if (ok && same(this.getValues(), data)) this.commit();
        this.fire('autosave', this, ok, res);
      }, ms);
    },
    relocalize() { (this._children || []).forEach(c => c._i18n && c.setText && c.setText(T(c._i18n))); },
    _buttonCfgs() {
      let b = this.buttons;
      if (b === 'false') b = false; else if (b === 'true' || b === '') b = true;
      if (b == null) b = (this.fields || []).length > 0;
      if (b === true) {
        b = [{ text: this.submitText || T('r4.save', 0, 'Salvar'), variant: 'primary', action: 'submit', _i18n: this.submitText ? '' : 'r4.save' }];
        if (this.resetText) b.push({ text: this.resetText === 'Limpar' ? T('r4.clear', 0, 'Limpar') : this.resetText, action: 'reset', _i18n: this.resetText === 'Limpar' ? 'r4.clear' : '' });
      }
      if (!Array.isArray(b)) return [];
      return b.map(x => {
        if (typeof x === 'string') return x;
        const c = Object.assign({ xtype: 'button' }, x);
        if (x.action === 'submit' || x.action === 'reset') {
          const fn = x.handler;
          c.handler = (btn, ev) => { fn && fn(btn, ev); x.action === 'submit' ? this.submit() : this.reset(); };
          if (x.action === 'submit') c.domAttrs = Object.assign({ 'data-r4-submit': '' }, x.domAttrs);
        }
        delete c.action;
        return c;
      });
    },
    /** Campos (componentes com name + getValue/setValue) dentro do form */
    getFields() { return this.el ? fieldsIn(this.el, this) : []; },
    getField(name) { return this.getFields().find(f => f.name === name) || null; },
    _groups(all) {
      const g = Object.create(null);   // name "__proto__" não vira acesso ao protótipo
      this.getFields().forEach(f => {
        if (BAD_NAMES.has(f.name)) { if (!f._badName) { f._badName = true; R4.warn('form: campo com name "' + f.name + '" ignorado (chave perigosa)'); } return; }
        if (all || !f.disabled) (g[f.name] ||= []).push(f);
      });
      return g;
    },
    /**
     * Objeto { name: valor }. Campos desabilitados ficam de fora (passe true para incluir).
     * Higiene: names __proto__/constructor/prototype são ignorados; texto sai sem NUL/controles/bidi
     * (R4.sanitize.deep), exceto campos com sanitize:false; senha só perde NUL.
     */
    getValues(all) {
      const out = {}, g = this._groups(all), S = R4.sanitize;
      Object.keys(g).forEach(n => {
        const list = g[n], f0 = list[0];
        let v = list.length === 1 ? f0.getValue() : list.map(f => f.getValue()).filter(v => !(v === '' || v === false || v == null));
        if (S && f0.sanitize !== false && f0.sanitize !== 'false' && f0.xtype !== 'passwordfield') v = S.deep(v);
        out[n] = v;
      });
      return out;
    },
    /** Preenche pelo nome. commit=true torna esses valores o "original" (reset/isDirty). */
    setValues(obj, commit) {
      if (!obj || typeof obj !== 'object') return this;
      const g = this._groups(true);
      Object.keys(obj).forEach(n => {
        if (BAD_NAMES.has(n)) return;
        const list = g[n]; if (!list) return;
        const v = obj[n];
        if (list.length > 1 && Array.isArray(v)) list.forEach(f => f.setValue(f.inputValue ? v.includes(f.inputValue) : v));
        else list.forEach(f => f.setValue(v));
        list.forEach(f => { f.clearError(); if (commit) f.commit(); });
      });
      this._valuesSet();
      return this;
    },
    /** Avisa o estado reativo (R4.state) que os valores mudaram por código (setValues/reset/load). */
    _valuesSet() { this.el && this.el.dispatchEvent(new CustomEvent('r4-values')); },
    /** Valida tudo; marca os erros, foca o primeiro inválido e dispara invalid. */
    validate() {
      const values = this.getValues(true), errors = {};
      let first = null;
      this.getFields().forEach(f => {
        if (!f.validate(values)) { errors[f.name] = f.getError(); first = first || f; }
      });
      if (first) {
        if (this.focusInvalid) { reveal(first.el); first.focus(); }
        this.fire('invalid', this, errors);
        return false;
      }
      return true;
    },
    isValid() { const v = this.getValues(true); return this.getFields().every(f => f.disabled || f.isValid(v)); },
    isDirty() { return this.getFields().some(f => f.isDirty()); },
    commit() { this.getFields().forEach(f => f.commit()); return this; },
    clearErrors() { this.getFields().forEach(f => f.clearError()); this._hideMsg(); return this; },
    reset() {
      this.getFields().forEach(f => f.reset());
      this._hideMsg();
      this._valuesSet();
      this.fire('reset', this);
      return this;
    },
    /** Mostra erros vindos do servidor: { campo: 'mensagem' } ou [{campo, mensagem}]. Devolve as mensagens que não têm campo. */
    markErrors(errs) {
      const rest = [];
      let first = null;
      if (Array.isArray(errs)) errs = errs.reduce((o, e) => { if (e && (e.campo || e.field)) o[e.campo || e.field] = e.mensagem || e.message || e.msg; return o; }, {});
      if (!errs || typeof errs !== 'object') return rest;
      Object.keys(errs).forEach(n => {
        let m = errs[n]; if (Array.isArray(m)) m = m.join(' ');
        m = m == null ? '' : String(m);
        const f = this.getField(n);
        if (f && !f.disabled) { f.setError(m || msgOf('invalid')); first = first || f; } else if (m) rest.push(m);
      });
      if (first && this.focusInvalid) { reveal(first.el); first.focus(); }
      return rest;
    },
    _showMsg(text, kind) {
      if (!text) return this._hideMsg();
      this.msgEl.textContent = text;
      this.msgEl.className = 'r4-form-msg r4-alert r4-alert-' + kind;
      this.msgEl.setAttribute('role', kind === 'err' ? 'alert' : 'status');
      this.msgEl.hidden = false;
      this._msgKind = kind;
    },
    _hideMsg() { if (this.msgEl) { this.msgEl.hidden = true; this.msgEl.textContent = ''; this.msgEl.removeAttribute('role'); } this._msgKind = ''; },
    /** Botões que enviam este form (inclusive r4-click="submit:#id" fora dele) */
    _submitButtons() {
      const own = this.el.querySelectorAll(SUBMIT_SEL);
      const ext = this.id ? document.querySelectorAll('[r4-click*="submit"]') : [];
      const isMine = b => {
        if (b.matches('[data-r4-submit],[type="submit"]')) return this.el.contains(b);
        return (b.getAttribute('r4-click') || '').split(';').some(p => {
          const i = p.indexOf(':'), name = (i < 0 ? p : p.slice(0, i)).trim(), arg = i < 0 ? '' : p.slice(i + 1).trim().replace(/^#/, '');
          return name === 'submit' && (arg ? arg === this.id : (b.closest('.r4-form') === this.el));
        });
      };
      return [...new Set([...own, ...ext])].filter(isMine);
    },
    _setBusy(b) {
      this._busy = b;
      this.el.classList.toggle('r4-busy', b);
      b ? this.el.setAttribute('aria-busy', 'true') : this.el.removeAttribute('aria-busy');
      if (b) {
        this._busyBtns = this._submitButtons().map(btn => {
          const cmp = R4.instances[btn.id], was = btn.disabled;
          btn.disabled = true; if (cmp && 'disabled' in cmp) cmp.disabled = true;
          const sp = el('span', { class: 'r4-spinner', 'aria-hidden': 'true' });
          btn.prepend(sp); btn.classList.add('r4-btn-busy');
          return { btn, cmp, was, sp };
        });
      } else {
        (this._busyBtns || []).forEach(({ btn, cmp, was, sp }) => {
          btn.disabled = was; if (cmp && 'disabled' in cmp) cmp.disabled = was;
          sp.remove(); btn.classList.remove('r4-btn-busy');
        });
        this._busyBtns = null;
      }
    },
    isBusy() { return !!this._busy; },
    /**
     * Valida, dispara beforesubmit (cancelável) e submit, e envia para `action`.
     * Devolve Promise<{ok, status, data} | false>.
     */
    async submit() {
      if (this._busy || this._destroyed) return false;
      this._hideMsg();
      if (!this.validate()) return false;
      const values = this.getValues();
      if (this.fire('beforesubmit', this, values) === false) return false;
      this.fire('submit', this, values);
      if (!this.action) return { ok: true, status: 0, data: values };
      // o que um ouvinte de beforesubmit/submit tiver acrescentado também perde chaves de protótipo
      const data = R4.sanitize ? R4.sanitize.deep(values, { strip: false }) : values;
      this._setBusy(true);
      let res;
      try {
        res = await send(this.action, { method: this.method, data, encrypt: bool(this.encrypt), headers: this.headers });
      } catch (e) {
        res = { ok: false, status: 0, data: null, error: e };
        R4.warn('form: envio falhou — ' + (e && e.message));
      } finally {
        if (!this._destroyed) this._setBusy(false);
      }
      if (this._destroyed) return false;
      const body = res.data;
      const failed = !res.ok || (body && typeof body === 'object' && typeof body.status === 'number' && body.status >= 400);
      if (failed) {
        res.ok = false;
        const rest = this.markErrors(body && (body.erros || body.errors));
        const txt = body && [body.mensagem, body.message, body.retorno, body.erro].find(x => typeof x === 'string' && x);
        const msg = res.status === 0 ? T('r4.form.offline', 0, 'Sem conexão com o servidor.') : (txt || this.errorText || T('r4.form.sendFail', 0, 'Não foi possível enviar. Tente novamente.'));
        this._showMsg([msg, ...rest].join(' '), 'err');
        this._notify('err', [msg, ...rest].join(' '));
        this.fire('failure', this, body, res);
      } else {
        if (this.resetOnSuccess) this.reset(); else this.commit();
        this._showMsg(this.successText, 'ok');
        this._notify('ok', this.successText || T('r4.form.saved', 0, 'Alterações salvas.'));
        this.fire('success', this, body, res);
      }
      return res;
    },
    _onKey(ev) {
      if (ev.key !== 'Enter' || ev.defaultPrevented || ev.isComposing || !bool(this.submitOnEnter)) return;
      const t = ev.target;
      if (t.tagName !== 'INPUT' || /^(checkbox|radio|button|submit|reset|file|image)$/i.test(t.type)) return;
      ev.preventDefault();
      this.submit();
    },
    _onFieldChange(ev) {
      const f = ev.detail && ev.detail.field;
      if (!f || (f.el.parentElement && f.el.parentElement.closest(OWNER) !== this.el)) return;
      if (this._msgKind === 'ok') this._hideMsg();
      // revalida quem depende deste campo (ex.: confirmar senha)
      this.getFields().forEach(o => { if (o !== f && o.match === f.name && (o._validated || o._error) && !o.isEmpty()) o.validate(); });
      this.fire('change', this, f, ev.detail.value);
      this._autosave();
    },
    destroy: destroyAll   // resposta que chegar depois do destroy é ignorada (_destroyed)
  }, {
    title: 'form', group: G,
    description: 'Formulário: descobre sozinho os campos de dentro (qualquer componente com name), valida, mostra erros nos campos (inclusive os que o servidor devolver em {erros:{campo:msg}}), envia via JSON (opcionalmente criptografado) com estado de carregamento. Enter num campo envia.',
    props: [
      { name: 'action', type: 'string', default: "''", desc: 'URL de envio. Vazio = só valida e dispara submit (tratamento local).' },
      { name: 'method', type: 'string', default: "'POST'", desc: 'POST, PUT, PATCH, DELETE ou GET (GET manda os valores na URL).' },
      { name: 'encrypt', type: 'boolean', default: 'false', desc: 'Envia o corpo criptografado com R4.crypto ({x,y,z}). No HTML basta o atributo encrypt.' },
      { name: 'headers', type: 'object', default: 'null', desc: 'Cabeçalhos extras.' },
      { name: 'fields', type: 'Array<cfg>', default: '[]', desc: "Campos por configuração: {type:'text'|'email'|'password'|'number'|'date'|'select'|'multiselect'|'checkbox'|'switch'|'radio'|'textarea'|'cpf'|'cnpj'|'telefone'|'cep'|'moeda'|'mask'|'fieldset'|'row', name, label, ...} ou {xtype}." },
      { name: 'items / html', type: 'Array<cfg> / string', default: "[] / ''", desc: 'Outros componentes ou HTML livre (tags r4-* dentro são montadas e entram no form).' },
      { name: 'buttons', type: 'true | false | Array<{text, action:"submit"|"reset", handler, variant}>', default: 'null', desc: 'Botões no rodapé. null = Salvar/Limpar automáticos quando há fields.' },
      { name: 'submitText / resetText', type: 'string', default: "'' / 'Limpar'", desc: 'Textos dos botões automáticos (padrão: Salvar / Limpar no idioma atual; resetText vazio esconde o Limpar).' },
      { name: 'successText / errorText', type: 'string', default: "'' / ''", desc: 'Aviso após sucesso (vazio = nenhum) / aviso padrão de falha (usa a mensagem do servidor quando houver).' },
      { name: 'values', type: 'object', default: 'null', desc: 'Valores iniciais (viram o "original" para reset/isDirty).' },
      { name: 'src / root', type: 'string', default: "''", desc: 'Carrega os valores ao montar (GET JSON): aceita {retorno:{...}}, {data:{...}} ou o objeto puro; root escolhe um caminho ("dados.perfil"). Mostra "Carregando...", erro com "Tentar de novo"; evento load / loaderror. reload() (ou r4-click="recarregar:#id") busca de novo.' },
      { name: 'notify', type: 'boolean', default: 'true', desc: 'Também avisa sucesso/erro do envio (e erro do src) com R4.notify. notify="false" desliga.' },
      { name: 'autosaveMs / autosaveUrl', type: 'number / string', default: "0 / ''", desc: 'Rascunho automático: depois de N ms sem mudanças, envia (sem aviso) para autosaveUrl (ou action) se o form mudou e está válido; evento autosave(form, ok, resposta). 0 = desligado.' },
      { name: 'Estado reativo', type: 'R4.state(form)', desc: 'Os valores por name, atualizados a cada digitação: r4-bind, r4-show-if e r4-enable-if reagem a eles (veja "Estado e bindings").' },
      { name: 'resetOnSuccess', type: 'boolean', default: 'false', desc: 'Limpa após enviar com sucesso (senão os valores enviados viram o original).' },
      { name: 'submitOnEnter / focusInvalid', type: 'boolean', default: 'true', desc: 'Enter num campo envia / foca o primeiro campo inválido.' },
      { name: 'getValues() / setValues(obj, commit)', type: 'método', desc: 'Lê / preenche pelo name. Campos desabilitados ficam fora de getValues(). Texto sai limpo (sem NUL/controles/bidi) e names __proto__/constructor/prototype são ignorados — também no envio.' },
      { name: 'suspicious(form, campo, tipos, detalhe)', type: 'evento', desc: "Um campo de texto com guard 'warn'/'block' encontrou sinais de injeção (tipos: sql, script, path, prompt, proto). Só sinal para UX/log: valide no servidor." },
      { name: 'validate() / isValid() / isDirty()', type: 'método', desc: 'Valida mostrando erros e focando o 1º inválido / só confere / houve alteração?' },
      { name: 'submit() / reset() / commit()', type: 'método', desc: 'submit() devolve Promise<{ok, status, data} | false>.' },
      { name: 'markErrors({campo: msg}) / clearErrors()', type: 'método', desc: 'Erros manuais por campo.' },
      { name: 'getFields() / getField(name) / isBusy()', type: 'método', desc: 'Acesso aos campos.' }
    ],
    events: ['change', 'invalid', 'beforesubmit', 'submit', 'success', 'failure', 'reset', 'suspicious', 'load', 'loaderror', 'autosave']
  });
  R4.fieldCfg = fieldCfg;

  /* =====================================================================
   * HTML declarativo
   * ===================================================================== */
  R4.structural('r4-option');
  const optionsFrom = host => [...host.children].filter(k => k.localName === 'r4-option').map(o => {
    const t = o.textContent.trim(), v = o.getAttribute('value');
    return { valor: v ?? t, texto: t || v || '', disabled: o.hasAttribute('disabled'), _sel: o.hasAttribute('selected') };
  });
  const withOptions = (host, cfg) => {
    const o = optionsFrom(host);
    if (o.length) {
      cfg.options = (Array.isArray(cfg.options) ? cfg.options : []).concat(o.map(({ _sel, ...x }) => x));
      const sel = o.filter(x => x._sel).map(x => x.valor);
      if (cfg.value == null && sel.length) cfg.value = cfg.multiple ? sel : sel[0];
    }
    return cfg;
  };
  R4.declare('select', withOptions);
  R4.declare('radiogroup', withOptions);
  const textAsLabel = (host, cfg) => { if (cfg.label == null) { const t = host.textContent.trim(); if (t) cfg.label = t; } return cfg; };
  R4.declare('checkbox', textAsLabel);
  R4.declare('switch', textAsLabel);
  R4.declare('textarea', (host, cfg) => { if (cfg.value == null && host.textContent.trim()) cfg.value = host.textContent.trim(); return cfg; });
  /** <r4-button type="submit|reset"> vira r4-click="submit|reset" (o botão do form) */
  R4.declare('form', (host, cfg) => {
    const clone = host.cloneNode(true);
    clone.querySelectorAll('r4-button[type]').forEach(b => {
      const t = (b.getAttribute('type') || '').toLowerCase();
      b.removeAttribute('type');
      if ((t === 'submit' || t === 'reset') && !b.hasAttribute('r4-click')) b.setAttribute('r4-click', t);
      if (t === 'submit' && !b.hasAttribute('variant')) b.setAttribute('variant', 'primary');
    });
    if (cfg.html == null) cfg.html = clone.innerHTML.trim();
    return cfg;
  });

  /* ---- ações r4-click="submit[:#id]" e "reset[:#id]" ---- */
  const formOf = (arg, from) => {
    const id = String(arg || '').trim().replace(/^#/, '');
    const host = !id && from && from.closest ? from.closest('.r4-form') : null;
    const f = id ? R4.get(id) : host && R4.instances[host.id];
    if (!f || typeof f.submit !== 'function') throw new Error(id ? 'formulário não encontrado: #' + id : 'o botão não está dentro de um <r4-form>');
    return f;
  };
  if (R4.action) {
    R4.action('submit', (a, e) => formOf(a, e).submit());
    R4.action('reset', (a, e) => formOf(a, e).reset());
    // apelidos em português (mesma regra: sem alvo = o form do botão)
    R4.action('salvar', (a, e) => formOf(a, e).submit());
    R4.action('recarregar', (a, e) => {
      const id = String(a || '').trim().replace(/^#/, ''), c = id ? R4.get(id) : formOf(a, e);
      if (!c || typeof c.reload !== 'function') throw new Error('alvo sem reload(): #' + id);
      return c.reload();
    });
  }

  /* ---- funções prontas: R4.form(alvo, {...}), R4.select(alvo, opções)... ---- */
  const plain = v => v && typeof v === 'object' && !Array.isArray(v) && !v.nodeType;
  const Q = R4.quickMap || {};
  Q.form = (a, b) => (Array.isArray(a) ? Object.assign({ fields: a }, b) : typeof a === 'string' ? Object.assign({ action: a }, b) : a);
  Q.select = (a, b) => (Array.isArray(a) ? Object.assign({ options: a }, b) : typeof a === 'string' ? Object.assign({ src: a }, b) : a);
  Q.radiogroup = Q.select;
  Q.maskfield = (a, b) => (plain(a) ? a : Object.assign({ mask: a }, b));
  Q.fieldset = (a, b) => (plain(a) ? a : Array.isArray(b) ? { title: a, items: b } : { title: a, html: b });
  Q.formrow = (a, b) => (Array.isArray(a) ? Object.assign({ items: a }, b) : plain(a) ? a : Object.assign({ html: a }, b));
  ['checkbox', 'switch', 'textarea', 'numberfield', 'datefield', 'passwordfield'].forEach(x => { Q[x] = (a, b) => (plain(a) ? a : Object.assign({ label: a }, b)); });

  /* ---- documentação extra nas páginas existentes da vitrine ---- */
  const addDocs = (mod, list) => { const m = R4.modules[mod]; if (m && m.meta && Array.isArray(m.meta.props)) m.meta.props.push(...list); };
  addDocs('actions', [
    { name: 'submit  |  submit:#id', type: 'ação', desc: 'Envia o <r4-form> do botão (ou o indicado). <r4-button type="submit"> dentro do form faz o mesmo.' },
    { name: 'reset  |  reset:#id', type: 'ação', desc: 'Limpa o form (volta aos valores originais).' },
    { name: 'salvar  |  salvar:#id', type: 'ação', desc: 'O mesmo que submit (valida e envia).' },
    { name: 'recarregar:#id', type: 'ação', desc: 'Busca de novo os valores do <r4-form src> (também serve para grid e qualquer componente com reload()).' }
  ]);
  addDocs('tags', [
    { name: '<r4-form action encrypt method success-text>', type: 'html', desc: 'Campos r4-* dentro entram no form pelo name. <r4-button type="submit|reset"> envia/limpa.' },
    { name: '<r4-select src root searchable multiple>', type: 'html', desc: 'Filhos <r4-option value="x" selected disabled>Texto</r4-option>. Também vale em <r4-radiogroup>.' },
    { name: '<r4-checkbox> / <r4-switch>', type: 'html', desc: 'O conteúdo da tag vira o label.' }
  ]);
  addDocs('quick', [
    { name: 'R4.form(alvo, {action, fields:[{type, name, label, required}]})', type: 'Form', desc: 'Form completo com botões Salvar/Limpar. R4.form(alvo, [campos]) também vale.' },
    { name: 'R4.select(alvo, opções | url[, opções])', type: 'Select', desc: 'Lista de escolha a partir de um array ou de uma URL.' },
    { name: "R4.maskfield(alvo, 'cpf'[, opções])", type: 'Maskfield', desc: 'Campo com máscara.' }
  ]);

  /* =====================================================================
   * Painel de propriedades da vitrine
   * ===================================================================== */
  const PG = (x, pg) => { R4.registry[x].meta.playground = pg; };
  PG('form', {
    html: '<r4-form{attrs}>\n  <r4-textfield name="nome" label="Nome" required min-length="3"></r4-textfield>\n  <r4-textfield name="email" label="E-mail" input-type="email" email required></r4-textfield>\n  <r4-div flex gap="2">\n    <r4-button type="submit">Enviar</r4-button>\n    <r4-button type="reset">Limpar</r4-button>\n  </r4-div>\n</r4-form>',
    cfg: { fields: [{ type: 'text', name: 'nome', label: 'Nome', required: true, minLength: 3 }, { type: 'email', name: 'email', label: 'E-mail', required: true }] },
    controls: { action: ['/vitrine/api/cadastro', '/vitrine/api/echo', ''], method: ['POST', 'PUT'], encrypt: false, successText: 'Cadastro enviado!', resetOnSuccess: false, submitOnEnter: true }
  });
  PG('select', {
    html: '<r4-select name="uf" label="Estado"{attrs} src="/showcase/vitrineData/estados.json"></r4-select>',
    cfg: { name: 'uf', label: 'Estado', src: '/showcase/vitrineData/estados.json' },
    controls: { searchable: true, multiple: false, clearable: false, required: false, placeholder: '', helpText: '', disabled: false, maxItems: 0 }
  });
  PG('checkbox', {
    html: '<r4-checkbox name="aceite"{attrs}>Li e aceito os termos</r4-checkbox>',
    cfg: { name: 'aceite', label: 'Li e aceito os termos' },
    controls: { value: false, required: false, disabled: false, readOnly: false, helpText: '' }
  });
  PG('textarea', {
    html: '<r4-textarea name="obs" label="Observações"{attrs}></r4-textarea>',
    cfg: { name: 'obs', label: 'Observações' },
    controls: { rows: 3, maxLength: 200, autoGrow: false, counter: false, required: false, minLength: 0, placeholder: 'Escreva aqui...', validateOn: ['blur', 'input', 'submit'], guard: ['warn', 'block', 'off'] }
  });
  PG('numberfield', {
    html: '<r4-numberfield name="qtd" label="Quantidade"{attrs}></r4-numberfield>',
    cfg: { name: 'qtd', label: 'Quantidade' },
    controls: { value: '', min: '0', max: '100', step: 1, decimals: -1, prefix: '', suffix: '', spinner: true, required: false }
  });
  PG('maskfield', {
    html: '<r4-maskfield name="doc" label="Documento"{attrs}></r4-maskfield>',
    cfg: { name: 'doc', label: 'Documento', mask: 'cpf' },
    controls: { mask: ['cpf', 'cnpj', 'cpfcnpj', 'telefone', 'cep', 'moeda', 'data', '99/99/9999', 'AAA-9S99'], raw: true, validateMask: true, required: false, validateOn: ['blur', 'input', 'submit'], placeholder: '' }
  });
})(window.R4);
