<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>libr4 - Vitrine</title>
  <?php $min = isset($_GET['min']) && $_GET['min'] === '1'; /* ?min=1: usa o pacote minificado de libr4/dist */ ?>
  <link rel="stylesheet" href="<?= asset($min ? '/libr4/dist/libr4.min.css' : '/libr4/libr4.css') ?>">
  <link rel="stylesheet" href="<?= asset('/showcase/vitrine.css') ?>">
  <?php /* anti-flash: leitura direta e validada do tema salvo (r4:theme = {v:1,d:{mode,...},e:expira}); sem depender do R4.store; aceita a chave antiga r4-theme até a migração */ ?>
  <script>try { var g = function (k) { return JSON.parse(localStorage.getItem(k) || 'null'); }, e = g('r4:theme'), t = e && e.v === 1 && e.e > Date.now() && e.d && typeof e.d === 'object' ? e.d : g('r4-theme'); if (t && (t.mode === 'dark' || (t.mode === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches))) document.documentElement.classList.add('r4-dark'); } catch (x) {}</script>
</head>
<body>
  <script src="<?= asset($min ? '/libr4/dist/libr4.min.js' : '/libr4/libr4.js') ?>"></script>
  <script src="<?= asset('/showcase/demos.js') ?>"></script>
  <script src="<?= asset('/showcase/vitrineData/vitrineData.js') ?>"></script>
  <script src="<?= asset('/showcase/demos/form.js') ?>"></script>
  <script src="<?= asset('/showcase/demos/dados.js') ?>"></script>
  <script src="<?= asset('/showcase/demos/ui.js') ?>"></script>
  <script src="<?= asset('/showcase/demos/chart.js') ?>"></script>
  <script src="<?= asset('/showcase/demos/theme.js') ?>"></script>
  <script src="<?= asset('/showcase/demos/receitas.js') ?>"></script>
  <script src="<?= asset('/showcase/i18n.js') ?>"></script>
  <script src="<?= asset('/showcase/demos/icons.js') ?>"></script>
  <script src="<?= asset('/showcase/demos/store.js') ?>"></script>
  <script src="<?= asset('/showcase/app.js') ?>"></script>
</body>
</html>
