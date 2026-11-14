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
 * ============================================
 */
(function (R4) {
  'use strict';
  const entry = R4.registry.tabpanel;
  if (!entry) return;
  const P = entry.cls.prototype;
  P.config.reorderable = true;
  const meta = entry.meta;
  meta.props = (meta.props || []).concat([
    { name: 'reorderable', type: 'boolean', default: 'true', desc: 'Permite reordenar as abas arrastando (ou Alt+←/→ no teclado).' },
    { name: 'move(aba|chave|índice, novoÍndice)', type: 'método', desc: 'Move uma aba de posição.' }
  ]);
  meta.events = (meta.events || []).concat(['tabmove']);

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
    this._enhanceTab(tab);
    if (activate) this.setActive(tab);
    return panel;
  };

  const origSet = P.setActive;
  P.setActive = function (t) {
    const r = origSet.call(this, t);
    this.tabs.forEach(x => x.el.setAttribute('aria-selected', x === this.current ? 'true' : 'false'));
    const cur = this.current;
    if (cur && cur.el.scrollIntoView) cur.el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
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
    return origAfter && origAfter.call(this);
  };

  // abas criadas no build() (antes de existir _enhanceTab no protótipo) — nada a fazer: o P.add já está ativo
})(window.R4);
