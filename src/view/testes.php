<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>libr4 - Testes</title>
  <link rel="stylesheet" href="<?= asset('/libr4/libr4.css') ?>">
  <link rel="stylesheet" href="<?= asset('/showcase/testes/testes.css') ?>">
  <?php /* anti-flash: leitura direta e validada do tema salvo (r4:theme = {v:1,d:{mode,...},e:expira}); aceita a chave antiga r4-theme até a migração */ ?>
  <script>try { var g = function (k) { return JSON.parse(localStorage.getItem(k) || 'null'); }, e = g('r4:theme'), t = e && e.v === 1 && e.e > Date.now() && e.d && typeof e.d === 'object' ? e.d : g('r4-theme'); if (t && (t.mode === 'dark' || (t.mode === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches))) document.documentElement.classList.add('r4-dark'); } catch (x) {}</script>
</head>
<body>
  <?php
  /* A mesma base da vitrine (lib + dados + demos), para a suíte de regressão rodar os exemplos reais. */
  $base = ['/libr4/libr4.js', '/showcase/demos.js', '/showcase/vitrineData/vitrineData.js',
    '/showcase/demos/form.js', '/showcase/demos/dados.js', '/showcase/demos/ui.js', '/showcase/demos/chart.js',
    '/showcase/demos/theme.js', '/showcase/demos/receitas.js', '/showcase/i18n.js', '/showcase/demos/icons.js', '/showcase/demos/store.js'];
  /* O runner e as suítes (ordem = ordem de execução; a "vitrine" é lenta e roda por último). */
  $suites = ['core', 'net', 'declarative', 'quick', 'grid', 'form', 'files', 'sanitize', 'icons', 'store', 'i18n', 'theme', 'ui', 'chart', 'tabs', 'vitrine'];
  foreach ($base as $s) { echo '<script src="' . asset($s) . '"></script>' . "\n  "; }
  ?>
  <script src="<?= asset('/showcase/testes/r4test.js') ?>"></script>
  <?php foreach ($suites as $s) { echo '<script src="' . asset('/showcase/testes/suites/' . $s . '.js') . '"></script>' . "\n  "; } ?>
  <script src="<?= asset('/showcase/testes/runner-ui.js') ?>"></script>
</body>
</html>
