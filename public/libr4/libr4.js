/**
 * libr4.js — carregador único (R4 dev)
 * Uso: <script src="/libr4/libr4.js"></script> + <link rel="stylesheet" href="/libr4/libr4.css">
 * Carrega, em ordem: core, net, components, declarative, quick.
 */
(function () {
  var s = document.currentScript.src, base = s.replace(/libr4\.js.*$/, ''), q = (s.match(/\?.*$/) || [''])[0];
  ['core', 'net', 'components', 'declarative', 'quick'].forEach(function (f) {
    document.write('<script src="' + base + f + '.js' + q + '"><\/script>');
  });
})();
