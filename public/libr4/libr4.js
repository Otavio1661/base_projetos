/**
 * libr4.js — carregador único (R4 dev)
 * Uso: <script src="/libr4/libr4.js"></script> + <link rel="stylesheet" href="/libr4/libr4.css">
 * Carrega, em ordem: core, support, store, net, components, declarative, quick, tabs, icons, form, sanitize, files, imageeditor, ui, chart, theme.
 */
(function () {
  var s = document.currentScript.src, base = s.replace(/libr4\.js.*$/, ''), q = (s.match(/\?.*$/) || [''])[0];
  // vão para um document.write: aspas/< > nunca passam (a query só repete o ?v= do asset)
  base = base.replace(/["'<>\s]/g, encodeURIComponent); q = q.replace(/[^\w.=&%?-]/g, '');
  ['core', 'support', 'store', 'net', 'components', 'declarative', 'quick', 'tabs', 'icons', 'form', 'sanitize', 'files', 'imageeditor', 'ui', 'chart', 'theme'].forEach(function (f) {
    document.write('<script src="' + base + f + '.js' + q + '"><\/script>');
  });
})();
