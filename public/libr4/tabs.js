/**
 * ============================================
 * libr4 / tabs.js  —  R4 dev
 * ============================================
 * Melhorias do tabpanel (sem editar components.js):
 *   - abas REORDENÁVEIS: arraste uma aba por cima das outras (mouse/caneta) ou use
 *     Alt+← / Alt+→ com a aba focada (teclado). `reorderable: false` desliga.
 *   - tabpanel.move(aba|chave|índice, novoÍndice) e evento 'tabmove'.
 *   - a aba ativa sempre rola para dentro da vista; a roda do mouse rola a faixa
 *     de abas na horizontal; barra de rolagem fina.
 *   - abas com role="tab", foco por teclado (Enter/Espaço ativa), aria-selected.
 *   - abas PERSISTENTES: `persist: 'chave'` guarda no R4.store só {chave, título} de cada aba (nada de
 *     conteúdo/HTML) e a aba ativa, com validade (persistTtl, renovada a cada uso); getSavedState() SEMPRE
 *     revalida o que está no storage; restoreSaved(fábrica) recria as abas por uma lista permitida.
 *   - `maxTabs`: ao abrir além do limite, fecha a aba mais antiga que não esteja ativa.
 *   - fechar uma aba destrói também os componentes que estavam dentro dela (nada sobra em R4.instances).
 * ============================================
 */
(function (R4) {
  'use strict';
  const entry = R4.registry.tabpanel;
  if (!entry) return;
  const P = entry.cls.prototype;
  P.config.reorderable = true;
  P.config.persist = '';
  P.config.persistTtl = '7d';
  P.config.maxTabs = 30;
  const meta = entry.meta;
  meta.props = (meta.props || []).concat([
    { name: 'reorderable', type: 'boolean', default: 'true', desc: 'Permite reordenar as abas arrastando (ou Alt+←/→ no teclado).' },
    { name: 'move(aba|chave|índice, novoÍndice)', type: 'método', desc: 'Move uma aba de posição.' },
    { name: 'persist', type: 'string', default: "''", desc: "Chave do R4.store onde guardar as abas abertas (vazio = não guarda). Só abas com key [A-Za-z0-9_.-] (1 a 64) entram; salva {key, título curto} e a aba ativa, nunca conteúdo. Salva ~300 ms depois de abrir/fechar/mover/trocar de aba e ao sair da página." },
    { name: 'persistTtl', type: 'string | number', default: "'7d'", desc: "Validade do estado salvo ('30m', '12h', '7d' ou ms), renovada a cada uso (sliding). Depois disso a lixeira do R4.store apaga." },
    { name: 'maxTabs', type: 'number', default: '30', desc: 'Máximo de abas abertas depois de montado o painel: ao passar, fecha a aba mais antiga que não seja a ativa. 0 = sem limite.' },
    { name: 'getSavedState()', type: '{tabs:[{key,title}], active} | null', desc: 'Estado salvo, SEMPRE revalidado (tipos, tamanhos, chaves, duplicadas, limite). Dado adulterado no storage vira null/é filtrado.' },
    { name: 'restoreSaved(fábrica)', type: 'number', desc: 'Recria as abas salvas, na ordem. fábrica({key, title}) devolve a config da aba (ex.: { title, html, closable }) ou null para IGNORAR a chave (lista permitida). Reativa a aba ativa salva, não repete chave já aberta, regrava o estado limpo e dispara tabsrestore. Devolve quantas abriu.' },
    { name: 'saveState() / clearSaved()', type: 'método', desc: 'Grava agora / apaga o estado salvo (não fecha as abas abertas).' }
  ]);
  meta.events = (meta.events || []).concat(['tabmove', 'tabremove', 'tabsrestore']);

  /* ---------- persistência ---------- */
  const KEYRE = /^[\w.-]{1,64}$/;
  const BADKEY = new Set(['__proto__', 'constructor', 'prototype']);   // nomes que nunca viram chave de aba salva
  const HARD = 100;                                // nunca lê/grava mais que isso, mesmo com maxTabs: 0
  const pending = new Set();                       // painéis com gravação adiada (para gravar ao sair da página)
  let tabSeq = 0;
  /** título curto de texto puro: sem controles/bidi/zero-width e sem < > (nunca HTML), até 60 caracteres */
  // controles, bidi, zero-width e separadores de linha (faixas em código: este arquivo fica 100% ASCII)
  const BAD_CH = new RegExp('[' + [[0, 31], [127, 159], [0x200b, 0x200f], [0x2028, 0x2029], [0x202a, 0x202e], [0x2066, 0x2069], [0xfeff, 0xfeff]].map(r => r.map(c => '\\u' + ('0000' + c.toString(16)).slice(-4)).join('-')).join('') + '<>]', 'g');
  const cleanTitle = s => String(s == null ? '' : s).replace(BAD_CH, '').trim().slice(0, 60);
  /** valida o estado vindo do storage (NÃO confiável): devolve {tabs, active} limpo ou undefined */
  function validState(o, max) {
    if (!o || typeof o !== 'object' || Array.isArray(o) || !Array.isArray(o.tabs)) return undefined;
    const seen = new Set(), tabs = [], cap = max > 0 ? Math.min(max, HARD) : HARD;
    for (const t of o.tabs.slice(0, HARD * 2)) {
      if (!t || typeof t !== 'object' || typeof t.key !== 'string' || !KEYRE.test(t.key) || BADKEY.has(t.key) || seen.has(t.key)) continue;
      seen.add(t.key);
      tabs.push({ key: t.key, title: cleanTitle(typeof t.title === 'string' ? t.title : '') || t.key });
      if (tabs.length >= cap) break;
    }
    return tabs.length ? { tabs, active: typeof o.active === 'string' && seen.has(o.active) ? o.active : null } : undefined;
  }
  const canSave = c => !!(c.persist && typeof c.persist === 'string' && R4.store);

  P.getSavedState = function () {
    if (!canSave(this)) return null;
    const max = this.maxTabs;
    return R4.store.get(this.persist, { schema: o => validState(o, max), fallback: null });
  };
  P.saveState = function () {
    clearTimeout(this._pt); this._pt = 0; pending.delete(this);
    if (!canSave(this) || this._destroyed) return false;
    const tabs = this.tabs.filter(t => typeof t.key === 'string' && KEYRE.test(t.key)).slice(0, HARD)
      .map(t => ({ key: t.key, title: cleanTitle(t.el.firstChild && t.el.firstChild.textContent) || t.key }));
    if (!tabs.length) { R4.store.del(this.persist); return true; }
    const cur = this.current && this.current.key;
    return R4.store.set(this.persist, { tabs, active: typeof cur === 'string' && KEYRE.test(cur) ? cur : null }, { ttl: this.persistTtl, sliding: true, now: true });
  };
  P.clearSaved = function () {
    clearTimeout(this._pt); this._pt = 0; pending.delete(this);
    if (canSave(this)) R4.store.del(this.persist);
    return this;
  };
  /** agenda a gravação (debounce 300 ms) — só depois de montado e se `persist` estiver ligado */
  P._persistSoon = function () {
    if (!this._persistOn || !canSave(this)) return;
    clearTimeout(this._pt); pending.add(this);
    this._pt = setTimeout(() => this.saveState(), 300);
  };
  P.restoreSaved = function (factory) {
    const st = this.getSavedState();
    if (!st) return 0;
    let n = 0;
    st.tabs.forEach(s => {
      if (this.find(s.key)) return;                                  // nunca abre a mesma aba duas vezes
      let cfg = null;
      try { cfg = typeof factory === 'function' ? factory({ key: s.key, title: s.title }) : null; } catch (e) { cfg = null; }
      if (!cfg || typeof cfg !== 'object') return;                   // a fábrica é a lista permitida: o resto é descartado
      this.add(Object.assign({}, cfg, { key: s.key }), false); n++;
    });
    const ativa = st.active && this.find(st.active);
    if (ativa) this.setActive(ativa);
    this.fire('tabsrestore', this, st, n);
    this.saveState();                                                // regrava só o que valeu (o descartado some do storage)
    return n;
  };
  if (typeof window !== 'undefined') window.addEventListener('pagehide', () => pending.forEach(p => { try { p.saveState(); } catch (e) { /* ignora */ } }));

  const origDestroy = P.destroy;
  P.destroy = function () { clearTimeout(this._pt); this._pt = 0; pending.delete(this); return origDestroy.apply(this, arguments); };

  const DRAG_START_PX = 5;
  const tabOf = (cmp, ref) => typeof ref === 'number' ? cmp.tabs[ref]
    : cmp.tabs.find(t => t === ref || t.key === ref || t.cmp === ref);

  /** Move uma aba (DOM + lista) para a posição `to` (0 = primeira). */
  P.move = function (ref, to) {
    const tab = tabOf(this, ref);
    if (!tab) return this;
    const from = this.tabs.indexOf(tab);
    to = Math.max(0, Math.min(this.tabs.length - 1, to));
    if (from === to) return this;
    this.tabs.splice(from, 1);
    this.tabs.splice(to, 0, tab);
    const next = this.tabs[to + 1];
    this.strip.insertBefore(tab.el, next ? next.el : null);
    this.fire('tabmove', this, tab.cmp, from, to);
    this._persistSoon();
    return this;
  };

  /** Prepara UMA aba: acessibilidade, teclado e arrastar. */
  P._enhanceTab = function (tab) {
    const self = this, el = tab.el;
    el.setAttribute('role', 'tab');
    el.setAttribute('tabindex', '0');
    el.setAttribute('aria-selected', 'false');

    el.addEventListener('keydown', ev => {
      if (ev.target !== el) return;                       // não captura teclas do botão de fechar
      if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); self.setActive(tab); }
      else if (self.reorderable && ev.altKey && (ev.key === 'ArrowLeft' || ev.key === 'ArrowRight')) {
        ev.preventDefault();
        self.move(tab, self.tabs.indexOf(tab) + (ev.key === 'ArrowLeft' ? -1 : 1));
        el.focus();
        el.scrollIntoView && el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      }
    });

    // clique logo depois de arrastar não deve ativar a aba
    el.addEventListener('click', ev => {
      if (tab._justDragged) { tab._justDragged = false; ev.stopImmediatePropagation(); ev.preventDefault(); }
    }, true);

    let startX = 0, dragging = false, id = null;
    el.addEventListener('pointerdown', ev => {
      if (!self.reorderable || ev.button !== 0 || ev.pointerType === 'touch') return;   // toque mantém a rolagem nativa
      if (ev.target.closest && ev.target.closest('.r4-x')) return;
      startX = ev.clientX; dragging = false; id = ev.pointerId;
    });
    el.addEventListener('pointermove', ev => {
      if (id === null || ev.pointerId !== id) return;
      let dx = ev.clientX - startX;
      if (!dragging) {
        if (Math.abs(dx) < DRAG_START_PX) return;
        dragging = true;
        el.classList.add('r4-dragging');
        self.strip.classList.add('r4-tabs-sorting');
        el.setPointerCapture && el.setPointerCapture(id);
      }
      el.style.transform = 'translateX(' + dx + 'px)';
      // troca de lugar quando o centro da aba arrastada passa do centro do vizinho
      for (let guard = 0; guard < 50; guard++) {
        const r = el.getBoundingClientRect(), center = r.left + r.width / 2;
        const i = self.tabs.indexOf(tab);
        const prev = self.tabs[i - 1], next = self.tabs[i + 1];
        let swap = null;
        if (prev) { const pr = prev.el.getBoundingClientRect(); if (pr.width && center < pr.left + pr.width / 2) swap = i - 1; }
        if (swap === null && next) { const nr = next.el.getBoundingClientRect(); if (nr.width && center > nr.left + nr.width / 2) swap = i + 1; }
        if (swap === null) break;
        const before = el.getBoundingClientRect().left;
        el.style.transform = 'none';
        self.move(tab, swap);
        const natural = el.getBoundingClientRect().left;
        dx = before - natural;                             // mantém a aba debaixo do ponteiro
        startX = ev.clientX - dx;
        el.style.transform = 'translateX(' + dx + 'px)';
      }
      // rolagem automática perto das bordas da faixa
      const s = self.strip.getBoundingClientRect();
      if (ev.clientX < s.left + 30) self.strip.scrollLeft -= 12;
      else if (ev.clientX > s.right - 30) self.strip.scrollLeft += 12;
    });
    const end = ev => {
      if (id === null || (ev && ev.pointerId !== id)) return;
      id = null;
      if (!dragging) return;
      dragging = false;
      tab._justDragged = true;
      setTimeout(() => { tab._justDragged = false; }, 0);
      el.classList.remove('r4-dragging');
      el.style.transform = '';
      self.strip.classList.remove('r4-tabs-sorting');
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  };

  // ---- encaixa nas funções do tabpanel ----
  const origAdd = P.add;
  P.add = function (cfg, activate = true) {
    const panel = origAdd.call(this, cfg, false);
    const tab = this.tabs[this.tabs.length - 1];
    tab._n = ++tabSeq;                                         // ordem de criação (para fechar a mais antiga)
    this._enhanceTab(tab);
    if (activate) this.setActive(tab);
    if (this.rendered && this.maxTabs > 0) {                   // limite: fecha a mais antiga que não seja a ativa nem a nova
      while (this.tabs.length > this.maxTabs) {
        const velha = this.tabs.filter(x => x !== this.current && x !== tab).sort((a, b) => a._n - b._n)[0];
        if (!velha) break;
        this.remove(velha);
      }
    }
    this._persistSoon();
    return panel;
  };

  const origSet = P.setActive;
  P.setActive = function (t) {
    const antes = this.current;
    const r = origSet.call(this, t);
    this.tabs.forEach(x => x.el.setAttribute('aria-selected', x === this.current ? 'true' : 'false'));
    const cur = this.current;
    if (cur && cur.el.scrollIntoView) cur.el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    if (cur !== antes) this._persistSoon();
    return r;
  };

  const origRemove = P.remove;
  P.remove = function (t) {
    const tab = this.tabs.indexOf(t) >= 0 ? t : null;
    // destrói os componentes que estavam DENTRO da aba (o painel só destrói os próprios filhos): nada sobra em R4.instances
    if (tab && tab.cmp.el) tab.cmp.el.querySelectorAll('.r4-cmp').forEach(n => { const c = R4.instances[n.id]; if (c && c.el === n && c !== tab.cmp) { try { c.destroy(); } catch (e) { /* ignora */ } } });
    const r = origRemove.call(this, t);
    if (tab) { this.fire('tabremove', this, tab.cmp, tab.key); this._persistSoon(); }
    return r;
  };

  const origAfter = P.afterRender;
  P.afterRender = function () {
    this.strip.setAttribute('role', 'tablist');
    this.strip.addEventListener('wheel', ev => {           // roda do mouse rola as abas na horizontal
      if (Math.abs(ev.deltaY) > Math.abs(ev.deltaX) && this.strip.scrollWidth > this.strip.clientWidth) {
        this.strip.scrollLeft += ev.deltaY;
        ev.preventDefault();
      }
    }, { passive: false });
    const r = origAfter && origAfter.call(this);
    this._persistOn = true;                                // daqui em diante, mudanças nas abas são gravadas (se persist estiver ligado)
    return r;
  };

  // abas criadas no build() (antes de existir _enhanceTab no protótipo) — nada a fazer: o P.add já está ativo
})(window.R4);
