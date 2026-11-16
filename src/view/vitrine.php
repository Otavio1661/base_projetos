<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>libr4 - Vitrine</title>
  <link rel="stylesheet" href="<?= asset('/libr4/libr4.css') ?>">
  <link rel="stylesheet" href="<?= asset('/showcase/vitrine.css') ?>">
  <script>try { var t = JSON.parse(localStorage.getItem('r4-theme') || 'null'); if (t && (t.mode === 'dark' || (t.mode === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches))) document.documentElement.classList.add('r4-dark'); } catch (e) {}</script>
</head>
<body>
  <script src="<?= asset('/libr4/libr4.js') ?>"></script>
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
  <script src="<?= asset('/showcase/app.js') ?>"></script>
</body>
</html>
