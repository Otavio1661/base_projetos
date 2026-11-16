/**
 * boot.js — anti-flash do tema da vitrine e da página de testes (carregue no <head>, SÍNCRONO, sem defer).
 * Era um <script> inline; como arquivo externo a página funciona com CSP estrita (script-src 'self', sem 'unsafe-inline').
 * Lê direto o tema salvo e põe a classe r4-dark em <html> ANTES da primeira pintura (sem depender do R4.store):
 *   - r4:theme  = { v: 1, d: { mode, ... }, e: expira (ms) }  (formato do R4.store; revalidado aqui)
 *   - r4-theme  = { mode, ... }                               (chave antiga, aceita até a migração)
 * Nada de eval; qualquer erro (armazenamento bloqueado, JSON inválido) é ignorado e a página segue no tema claro.
 */
(function () {
  'use strict';
  try {
    var ler = function (k) {
      var s = window.localStorage.getItem(k);
      return typeof s === 'string' && s.length <= 8192 ? JSON.parse(s) : null;   // limite: valor gigante não é tema
    };
    var obj = function (o) { return o !== null && typeof o === 'object' && !Array.isArray(o); };
    var e = null, t = null;
    try { e = ler('r4:theme'); } catch (x) { e = null; }
    if (obj(e) && e.v === 1 && typeof e.e === 'number' && e.e > Date.now() && obj(e.d)) t = e.d;
    else { try { t = ler('r4-theme'); } catch (x) { t = null; } }
    if (!obj(t)) return;
    var escuro = t.mode === 'dark';
    if (!escuro && t.mode === 'auto') escuro = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (escuro) document.documentElement.classList.add('r4-dark');
  } catch (x) { /* sem tema salvo: segue claro */ }
})();
